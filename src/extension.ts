// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

const execAsync = promisify(exec);

let client: LanguageClient;

// Toolchain mode configuration
interface ToolchainConfig {
    mode: 'standalone' | 'sdk';
    sdkPath?: string;
}

function getToolchainConfig(): ToolchainConfig {
    const config = vscode.workspace.getConfiguration('intybasic');
    const mode = config.get<string>('toolchainMode') as 'standalone' | 'sdk' || 'standalone';
    const sdkPath = config.get<string>('sdkPath');
    
    return { mode, sdkPath };
}

// Detect if a file is within an SDK project structure
function detectSdkProject(filePath: string): boolean {
    const sdkFolders = ['Projects', 'Examples', 'Contributions'];
    return sdkFolders.some(folder => filePath.includes(path.sep + folder + path.sep));
}

// Get project name from file path
function getProjectName(filePath: string): string {
    return path.basename(filePath, '.bas');
}

// Active project context (set by command handlers when project file is used)
let activeProjectContext: ProjectContext | null = null;

// Get project name, checking active project context first
function getEffectiveProjectName(filePath: string): string {
    if (activeProjectContext && activeProjectContext.projectName) {
        return activeProjectContext.projectName;
    }
    return getProjectName(filePath);
}

// ============================================================================
// Project File Support (intybasic.json)
// ============================================================================

interface ProjectCompilerSettings {
    enableJLP?: boolean;
    enableIntellivoice?: boolean;
    enableJLPSavegame?: boolean;
    enableSDKUseBINFormat?: boolean;
}

interface ProjectToolFlags {
    compilerFlags?: string;      // Additional flags for IntyBASIC compiler (standalone mode)
    assemblerFlags?: string;     // Additional flags for AS1600 assembler (standalone mode)
    emulatorFlags?: string;      // Additional flags for JzIntv emulator (standalone mode)
}

interface SDKToolFlags {
    buildFlags?: string;         // Additional flags for INTYBUILD.BAT (SDK mode)
    runFlags?: string;           // Additional flags for INTYRUN.BAT (SDK mode)
    debugFlags?: string;         // Additional flags for INTYDBUG.BAT (SDK mode)
}

interface IntyBasicProjectConfig {
    mainFile: string;           // Relative path to main .BAS file (required)
    projectName?: string;        // Custom ROM output name (optional, defaults to mainFile basename)
    compilerSettings?: ProjectCompilerSettings;  // Project-level compiler settings (optional)
    toolFlags?: ProjectToolFlags;  // Additional command-line flags for tools (standalone mode, optional)
    sdkToolFlags?: SDKToolFlags;   // Additional command-line flags for SDK scripts (SDK mode, optional)
}

interface ProjectContext {
    projectFile: vscode.Uri | null;
    config: IntyBasicProjectConfig | null;
    mainFile: vscode.Uri;
    projectName: string;
    compilerSettings: {
        ENABLE_INTELLIVOICE: boolean;
        ENABLE_JLP: boolean;
        ENABLE_JLP_SAVEGAME: boolean;
        SDK_USE_BIN_FORMAT: boolean;
    };
    toolFlags: {
        compilerFlags: string;
        assemblerFlags: string;
        emulatorFlags: string;
    };
    sdkToolFlags: {
        buildFlags: string;
        runFlags: string;
        debugFlags: string;
    };
}

// Find intybasic.json in workspace root
async function findProjectFile(): Promise<vscode.Uri | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
    }
    
    const rootFolder = workspaceFolders[0].uri;
    const projectFileUri = vscode.Uri.joinPath(rootFolder, 'intybasic.json');
    
    try {
        await vscode.workspace.fs.stat(projectFileUri);
        return projectFileUri;
    } catch {
        return null;
    }
}

// Load and validate project configuration from intybasic.json
async function loadProjectConfig(projectFileUri: vscode.Uri): Promise<IntyBasicProjectConfig | null> {
    try {
        const fileContent = await vscode.workspace.fs.readFile(projectFileUri);
        const configText = Buffer.from(fileContent).toString('utf8');
        const config = JSON.parse(configText) as IntyBasicProjectConfig;
        
        // Validate required fields
        if (!config.mainFile || typeof config.mainFile !== 'string') {
            vscode.window.showErrorMessage('Invalid intybasic.json: "mainFile" field is required and must be a string.');
            return null;
        }
        
        return config;
    } catch (error) {
        if (error instanceof SyntaxError) {
            vscode.window.showErrorMessage('Invalid intybasic.json: Failed to parse JSON. ' + error.message);
        } else {
            vscode.window.showErrorMessage('Failed to read intybasic.json: ' + (error as Error).message);
        }
        return null;
    }
}

// Resolve target file for build/run/debug commands
async function resolveTargetFile(): Promise<ProjectContext | null> {
    // Check for project file first
    const projectFileUri = await findProjectFile();
    
    if (projectFileUri) {
        const config = await loadProjectConfig(projectFileUri);
        if (!config) {
            return null; // Error already shown in loadProjectConfig
        }
        
        // Resolve mainFile relative to workspace root
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri;
        const mainFileUri = vscode.Uri.joinPath(workspaceRoot, config.mainFile);
        
        // Verify mainFile exists
        try {
            await vscode.workspace.fs.stat(mainFileUri);
        } catch {
            vscode.window.showErrorMessage(`Main file not found: ${config.mainFile}`);
            return null;
        }
        
        // Determine project name
        const projectName = config.projectName || path.basename(config.mainFile, '.bas');
        
        // Merge compiler settings (project overrides workspace)
        const workspaceSettings = getCurrentSettings();
        const compilerSettings = {
            ENABLE_INTELLIVOICE: config.compilerSettings?.enableIntellivoice ?? workspaceSettings.ENABLE_INTELLIVOICE,
            ENABLE_JLP: config.compilerSettings?.enableJLP ?? workspaceSettings.ENABLE_JLP,
            ENABLE_JLP_SAVEGAME: config.compilerSettings?.enableJLPSavegame ?? workspaceSettings.ENABLE_JLP_SAVEGAME,
            SDK_USE_BIN_FORMAT: config.compilerSettings?.enableSDKUseBINFormat ?? workspaceSettings.SDK_USE_BIN_FORMAT
        };
        
        // Get tool flags from project config
        const toolFlags = {
            compilerFlags: config.toolFlags?.compilerFlags || '',
            assemblerFlags: config.toolFlags?.assemblerFlags || '',
            emulatorFlags: config.toolFlags?.emulatorFlags || ''
        };
        
        // Get SDK tool flags from project config
        const sdkToolFlags = {
            buildFlags: config.sdkToolFlags?.buildFlags || '',
            runFlags: config.sdkToolFlags?.runFlags || '',
            debugFlags: config.sdkToolFlags?.debugFlags || ''
        };
        
        return {
            projectFile: projectFileUri,
            config,
            mainFile: mainFileUri,
            projectName,
            compilerSettings,
            toolFlags,
            sdkToolFlags
        };
    }
    
    // Fall back to active editor (legacy behavior)
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
        vscode.window.showErrorMessage('Please open or focus an IntyBASIC (.bas) file, or create a project file (intybasic.json).');
        return null;
    }
    
    return {
        projectFile: null,
        config: null,
        mainFile: editor.document.uri,
        projectName: path.basename(editor.document.fileName, '.bas'),
        compilerSettings: getCurrentSettings(),
        toolFlags: {
            compilerFlags: '',
            assemblerFlags: '',
            emulatorFlags: ''
        },
        sdkToolFlags: {
            buildFlags: '',
            runFlags: '',
            debugFlags: ''
        }
    };
}

// Helper function to create editor-like object from ProjectContext for build functions
function createEditorFromContext(projectContext: ProjectContext): any {
    return {
        document: {
            fileName: projectContext.mainFile.fsPath,
            uri: projectContext.mainFile
        }
    };
}

// ============================================================================
// End Project File Support
// ============================================================================

// Helper function to parse IntyBASIC error output
function parseIntyBasicErrors(output: string, fileUri: vscode.Uri): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const errorRegex = /^Error:\s+(.+)\s+in\s+line\s+(\d+)$/gm;
    
    let match;
    while ((match = errorRegex.exec(output)) !== null) {
        const message = match[1];
        const lineNumber = parseInt(match[2]) - 1; // VS Code uses 0-based line numbers
        
        const range = new vscode.Range(
            new vscode.Position(lineNumber, 0),
            new vscode.Position(lineNumber, Number.MAX_VALUE)
        );
        
        const diagnostic = new vscode.Diagnostic(
            range,
            message,
            vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = 'IntyBASIC';
        diagnostics.push(diagnostic);
    }
    
    return diagnostics;
}

// Helper function to get configuration settings
function getConfig(key: string): string | undefined {
    // 'intybasic' is the root namespace defined in package.json
    const config = vscode.workspace.getConfiguration('intybasic');
    return config.get<string>(key);
}

function getConfigBoolean(key: string): boolean {
    const config = vscode.workspace.getConfiguration('intybasic');
    return config.get<boolean>(key) || false;
}

// Function to get current settings (called each time to pick up changes without reload)
// If projectContext is provided, project settings override workspace settings
function getCurrentSettings(projectContext?: ProjectContext | null) {
    if (projectContext && projectContext.compilerSettings) {
        return projectContext.compilerSettings;
    }
    return {
        ENABLE_INTELLIVOICE: getConfigBoolean('enableIntellivoice'),
        ENABLE_JLP: getConfigBoolean('enableJLP'),
        ENABLE_JLP_SAVEGAME: getConfigBoolean('enableJLPSavegame'),
        SDK_USE_BIN_FORMAT: getConfigBoolean('enableSDKUseBINFormat')
    };
} 

// Standalone mode paths (only used when mode is 'standalone')
let INTYBASIC_COMPILER_PATH: string | undefined;
let INTYBASIC_LIBRARY_PATH: string | undefined;
let AS1600_ASSEMBLER_PATH: string | undefined;
let JZINTV_EMULATOR_PATH: string | undefined;
let JZINTV_EXEC_PATH: string | undefined;
let JZINTV_GROM_PATH: string | undefined;
let INTYSMAP_PATH: string | undefined;
let OUTPUT_DIR: string = 'bin'; // Default value

// Initialize configuration based on mode
function initializeConfiguration() {
    const toolchainConfig = getToolchainConfig();
    
    if (toolchainConfig.mode === 'standalone') {
        INTYBASIC_COMPILER_PATH = getConfig('compilerPath');
        INTYBASIC_LIBRARY_PATH = getConfig('libraryPath'); 
        AS1600_ASSEMBLER_PATH = getConfig('assemblerPath');
        JZINTV_EMULATOR_PATH = getConfig('emulatorPath');
        JZINTV_EXEC_PATH = getConfig('execRomPath');       
        JZINTV_GROM_PATH = getConfig('gromRomPath');
        INTYSMAP_PATH = getConfig('intysmapPath');
        const outputDirConfig = getConfig('outputDirectory');
        OUTPUT_DIR = outputDirConfig !== undefined ? outputDirConfig : 'bin';
        
        // Validate standalone configuration
        if (!INTYBASIC_COMPILER_PATH || !AS1600_ASSEMBLER_PATH || !JZINTV_EMULATOR_PATH || !JZINTV_EXEC_PATH || !JZINTV_GROM_PATH) {
            vscode.window.showWarningMessage('Some IntyBASIC tool or ROM paths are not configured. Please check your extension settings.');
        }
    } else if (toolchainConfig.mode === 'sdk') {
        // Validate SDK configuration
        if (!toolchainConfig.sdkPath) {
            vscode.window.showErrorMessage('IntyBASIC SDK mode is enabled but SDK path is not configured. Please set intybasic.sdkPath in settings.');
        } else if (!fs.existsSync(toolchainConfig.sdkPath)) {
            vscode.window.showErrorMessage(`IntyBASIC SDK path does not exist: ${toolchainConfig.sdkPath}`);
        }
    }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Initialize configuration based on toolchain mode
    initializeConfiguration();

    // Terminal references for reuse
    let emulatorTerminal: vscode.Terminal | undefined;
    let debuggerTerminal: vscode.Terminal | undefined;

    // Helper function to get or create terminal
    function getOrCreateTerminal(name: string, terminalRef: vscode.Terminal | undefined): vscode.Terminal {
        // Check if terminal still exists
        if (terminalRef && vscode.window.terminals.includes(terminalRef)) {
            return terminalRef;
        }
        // Create new terminal
        return vscode.window.createTerminal({ name });
    }

    // Start the language server
    const serverModule = context.asAbsolutePath(
        path.join('out', 'server', 'intybasicServer.js')
    );

    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'intybasic' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.bas')
        }
    };

    client = new LanguageClient(
        'intybasicLanguageServer',
        'IntyBASIC Language Server',
        serverOptions,
        clientOptions
    );

    client.start();

    // Create a diagnostic collection for IntyBASIC errors
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('intybasic');
    context.subscriptions.push(diagnosticCollection);

    // Create an output channel for build messages
    const outputChannel = vscode.window.createOutputChannel('IntyBASIC Build');
    context.subscriptions.push(outputChannel);

    // ==================== SDK Mode Functions ====================

    // Helper function to get SDK script path based on platform
    function getSDKScriptPath(scriptName: string, sdkPath: string): string {
        if (process.platform === 'win32') {
            return path.join(sdkPath, 'bin', `${scriptName}.BAT`);
        } else if (process.platform === 'darwin') {
            // macOS uses Perl scripts in bin directory
            return path.join(sdkPath, 'bin', scriptName.toLowerCase());
        } else {
            throw new Error('SDK mode is not supported on Linux. Please use standalone mode.');
        }
    }

    // Helper function to build ROM using SDK
    async function buildROMSdk(editor: vscode.TextEditor): Promise<boolean> {
        const { ENABLE_JLP, SDK_USE_BIN_FORMAT } = getCurrentSettings(activeProjectContext);
        const toolchainConfig = getToolchainConfig();
        if (!toolchainConfig.sdkPath) {
            vscode.window.showErrorMessage('SDK path is not configured.');
            return false;
        }

        diagnosticCollection.clear();

        const projectName = getEffectiveProjectName(editor.document.fileName);
        const isExample = detectSdkProject(editor.document.fileName) && 
                         (editor.document.fileName.includes('Examples') || 
                          editor.document.fileName.includes('Contributions'));
        
        outputChannel.clear();
        outputChannel.appendLine('Building IntyBASIC ROM using SDK...');
        outputChannel.appendLine(`Project: ${projectName}`);
        outputChannel.appendLine(`SDK Path: ${toolchainConfig.sdkPath}`);
        outputChannel.appendLine('');

        try {
            let buildCommand: string;
            const flags: string[] = [];
            
            if (isExample) {
                flags.push('-x');
            }
            if (ENABLE_JLP) {
                flags.push('-j');
            }
            if (SDK_USE_BIN_FORMAT) {
                flags.push('-b');
            }
            // Add project-specific SDK build flags
            if (activeProjectContext && activeProjectContext.sdkToolFlags.buildFlags) {
                flags.push(activeProjectContext.sdkToolFlags.buildFlags);
            }

            if (process.platform === 'win32') {
                const scriptPath = getSDKScriptPath('INTYBUILD', toolchainConfig.sdkPath);
                const binPath = path.join(toolchainConfig.sdkPath, 'bin');
                // Set INTYBASIC_INSTALL, add bin to PATH, and execute batch file
                buildCommand = `cmd /c "set "INTYBASIC_INSTALL=${toolchainConfig.sdkPath}" && set "PATH=${binPath};%PATH%" && cd /d "${toolchainConfig.sdkPath}" && "${scriptPath}" ${flags.join(' ')} ${projectName}"`;
            } else {
                // macOS - use script from PATH (SDK installer adds to PATH)
                buildCommand = `INTYBASIC_INSTALL="${toolchainConfig.sdkPath}" intybuild ${flags.join(' ')} "${projectName}"`;
            }

            outputChannel.appendLine(`Command: ${buildCommand}`);
            outputChannel.appendLine('');

            const { stdout, stderr } = await execAsync(buildCommand);
            const output = stdout + stderr;
            
            outputChannel.appendLine(output);
            
            // Parse for errors
            const errors = parseIntyBasicErrors(output, editor.document.uri);
            if (errors.length > 0) {
                diagnosticCollection.set(editor.document.uri, errors);
                outputChannel.show(true);
                vscode.window.showErrorMessage(`IntyBASIC build failed with ${errors.length} error(s). Check the Problems panel.`);
                return false;
            }
            
            diagnosticCollection.clear();
            outputChannel.appendLine('');
            outputChannel.appendLine('Build completed successfully!');
            outputChannel.show(true);
            
            return true;
            
        } catch (error: any) {
            const output = (error.stdout || '') + (error.stderr || '');
            outputChannel.appendLine(output);
            outputChannel.show(true);
            
            const errors = parseIntyBasicErrors(output, editor.document.uri);
            
            if (errors.length > 0) {
                diagnosticCollection.set(editor.document.uri, errors);
                vscode.window.showErrorMessage(`IntyBASIC build failed with ${errors.length} error(s). Check the Problems panel.`);
            } else {
                vscode.window.showErrorMessage(`Build failed: ${error.message}`);
            }
            return false;
        }
    }

    // Helper function to run ROM using SDK
    async function runROMSdk(editor: vscode.TextEditor): Promise<void> {
        const { ENABLE_JLP, ENABLE_JLP_SAVEGAME, SDK_USE_BIN_FORMAT } = getCurrentSettings(activeProjectContext);
        const toolchainConfig = getToolchainConfig();
        if (!toolchainConfig.sdkPath) {
            vscode.window.showErrorMessage('SDK path is not configured.');
            return;
        }

        const projectName = getEffectiveProjectName(editor.document.fileName);
        const isExample = detectSdkProject(editor.document.fileName) && 
                         (editor.document.fileName.includes('Examples') || 
                          editor.document.fileName.includes('Contributions'));

        const flags: string[] = [];
        if (isExample) {
            flags.push('-x');
        }
        if (SDK_USE_BIN_FORMAT) {
            flags.push('-b');
        }
        if (ENABLE_JLP) {
            // JLP mode 3: Accelerators + RAM enabled, flash storage present
            flags.push('-J3');
            if (ENABLE_JLP_SAVEGAME) {
                // Add JLP savegame support - use project name + .sav
                flags.push(`--jlp-savegame=${projectName}.sav`);
            }
        }
        // Add project-specific SDK run flags
        if (activeProjectContext && activeProjectContext.sdkToolFlags.runFlags) {
            flags.push(activeProjectContext.sdkToolFlags.runFlags);
        }

        try {
            let runCommand: string;

            emulatorTerminal = getOrCreateTerminal('IntyBASIC Emulator', emulatorTerminal);
            emulatorTerminal.show();
            
            if (process.platform === 'win32') {
                // Rely on system PATH and INTYBASIC_INSTALL from SDK installation
                emulatorTerminal.sendText(`cd "${toolchainConfig.sdkPath}"`);
                emulatorTerminal.sendText(`.\\bin\\INTYRUN.BAT ${flags.join(' ')} ${projectName}`);
            } else {
                // macOS - use script from PATH (SDK installer adds to PATH)
                runCommand = `INTYBASIC_INSTALL="${toolchainConfig.sdkPath}" intyrun ${flags.join(' ')} "${projectName}"`;
                emulatorTerminal.sendText(runCommand);
            }
            
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to run emulator: ${error.message}`);
        }
    }

    // Helper function to run ROM in debugger using SDK
    async function runROMDebugSdk(editor: vscode.TextEditor): Promise<void> {
        const { ENABLE_JLP, ENABLE_JLP_SAVEGAME, SDK_USE_BIN_FORMAT } = getCurrentSettings(activeProjectContext);
        const toolchainConfig = getToolchainConfig();
        if (!toolchainConfig.sdkPath) {
            vscode.window.showErrorMessage('SDK path is not configured.');
            return;
        }

        const projectName = getEffectiveProjectName(editor.document.fileName);
        const isExample = detectSdkProject(editor.document.fileName) && 
                         (editor.document.fileName.includes('Examples') || 
                          editor.document.fileName.includes('Contributions'));

        const flags: string[] = [];
        if (isExample) {
            flags.push('-x');
        }
        if (SDK_USE_BIN_FORMAT) {
            flags.push('-b');
        }
        if (ENABLE_JLP) {
            // JLP mode 3: Accelerators + RAM enabled, flash storage present
            flags.push('-J3');
            if (ENABLE_JLP_SAVEGAME) {
                // Add JLP savegame support - use project name + .sav
                flags.push(`--jlp-savegame=${projectName}.sav`);
            }
        }
        // Add project-specific SDK debug flags
        if (activeProjectContext && activeProjectContext.sdkToolFlags.debugFlags) {
            flags.push(activeProjectContext.sdkToolFlags.debugFlags);
        }

        try {
            let debugCommand: string;

            debuggerTerminal = getOrCreateTerminal('IntyBASIC Debugger', debuggerTerminal);
            debuggerTerminal.show();
            
            if (process.platform === 'win32') {
                // Rely on system PATH and INTYBASIC_INSTALL from SDK installation
                debuggerTerminal.sendText(`cd "${toolchainConfig.sdkPath}"`);
                debuggerTerminal.sendText(`.\\bin\\INTYDBUG.BAT ${flags.join(' ')} ${projectName}`);
            } else {
                // macOS - use script from PATH (SDK installer adds to PATH)
                debugCommand = `INTYBASIC_INSTALL="${toolchainConfig.sdkPath}" intydbug ${flags.join(' ')} "${projectName}"`;
                debuggerTerminal.sendText(debugCommand);
            }
            
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to run debugger: ${error.message}`);
        }
    }

    // Helper function to create new SDK project
    async function createSDKProject(): Promise<void> {
        const toolchainConfig = getToolchainConfig();
        if (toolchainConfig.mode !== 'sdk' || !toolchainConfig.sdkPath) {
            vscode.window.showErrorMessage('This command requires SDK mode to be enabled and SDK path to be configured.');
            return;
        }

        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter project name',
            placeHolder: 'mygame',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Project name is required';
                }
                if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
                    return 'Project name must start with a letter and contain only letters, numbers, and underscores';
                }
                return null;
            }
        });

        if (!projectName) {
            return;
        }

        const authorName = await vscode.window.showInputBox({
            prompt: 'Enter author name (optional)',
            placeHolder: 'Your Name'
        });

        try {
            let newCommand: string;
            const args: string[] = [projectName];
            
            if (authorName) {
                args.push(`"${authorName}"`);
            }

            if (process.platform === 'win32') {
                const scriptPath = getSDKScriptPath('INTYNEW', toolchainConfig.sdkPath);
                const binPath = path.join(toolchainConfig.sdkPath, 'bin');
                // Set INTYBASIC_INSTALL, add bin to PATH, and execute
                newCommand = `cmd /c "set "INTYBASIC_INSTALL=${toolchainConfig.sdkPath}" && set "PATH=${binPath};%PATH%" && cd /d "${toolchainConfig.sdkPath}" && "${scriptPath}" ${args.join(' ')}"`;
            } else {
                // macOS - use script from PATH (SDK installer adds to PATH)
                newCommand = `INTYBASIC_INSTALL="${toolchainConfig.sdkPath}" intynew ${args.join(' ')}`;
            }

            outputChannel.clear();
            outputChannel.appendLine('Creating new SDK project...');
            outputChannel.appendLine(`Command: ${newCommand}`);
            outputChannel.appendLine('');

            const { stdout, stderr } = await execAsync(newCommand);
            
            outputChannel.appendLine(stdout + stderr);
            outputChannel.show(true);

            // Open the project folder as workspace
            const projectFolderPath = path.join(toolchainConfig.sdkPath, 'Projects', projectName);
            const projectFilePath = path.join(projectFolderPath, `${projectName}.bas`);
            
            if (fs.existsSync(projectFilePath)) {
                const projectUri = vscode.Uri.file(projectFolderPath);
                
                // Open the project folder
                await vscode.commands.executeCommand('vscode.openFolder', projectUri, { forceNewWindow: false });
                
                vscode.window.showInformationMessage(`Project '${projectName}' created successfully!`);
            } else {
                vscode.window.showWarningMessage('Project created but file not found at expected location.');
            }
            
        } catch (error: any) {
            outputChannel.appendLine((error.stdout || '') + (error.stderr || ''));
            outputChannel.show(true);
            vscode.window.showErrorMessage(`Failed to create project: ${error.message}`);
        }
    }

    // Helper function to create IntyBASIC project file
    async function createProjectFile(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('Please open a workspace folder first.');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri;
        
        // Check if project file already exists
        const projectFileUri = vscode.Uri.joinPath(workspaceRoot, 'intybasic.json');
        try {
            await vscode.workspace.fs.stat(projectFileUri);
            const overwrite = await vscode.window.showWarningMessage(
                'intybasic.json already exists. Do you want to overwrite it?',
                { modal: true },
                'Yes', 'No'
            );
            if (overwrite !== 'Yes') {
                return;
            }
        } catch {
            // File doesn't exist, proceed
        }

        // Find all .BAS files in workspace
        const basFiles = await vscode.workspace.findFiles('**/*.bas', '**/node_modules/**');
        
        if (basFiles.length === 0) {
            vscode.window.showErrorMessage('No .BAS files found in workspace.');
            return;
        }

        // Create quick pick items with workspace-relative paths
        const quickPickItems = basFiles.map(uri => {
            const relativePath = vscode.workspace.asRelativePath(uri);
            return {
                label: path.basename(relativePath),
                description: path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath),
                detail: relativePath,
                uri: uri
            };
        });

        // Show quick pick to select main file
        const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select the main .BAS file for your project',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selectedItem) {
            return;
        }

        const mainFileRelativePath = vscode.workspace.asRelativePath(selectedItem.uri);

        // Ask for optional project name
        const defaultProjectName = path.basename(selectedItem.uri.fsPath, '.bas');
        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter project name (optional - leave empty to use main file name)',
            placeHolder: defaultProjectName,
            value: ''
        });

        // Get current extension settings to populate compilerSettings
        const currentSettings = getCurrentSettings();

        // Create project configuration with all fields
        const projectConfig: IntyBasicProjectConfig = {
            mainFile: mainFileRelativePath.replace(/\\/g, '/'),
            projectName: (projectName && projectName.trim() !== '') ? projectName.trim() : defaultProjectName,
            compilerSettings: {
                enableIntellivoice: currentSettings.ENABLE_INTELLIVOICE,
                enableJLP: currentSettings.ENABLE_JLP,
                enableJLPSavegame: currentSettings.ENABLE_JLP_SAVEGAME,
                enableSDKUseBINFormat: currentSettings.SDK_USE_BIN_FORMAT
            },
            toolFlags: {
                compilerFlags: "",
                assemblerFlags: "",
                emulatorFlags: ""
            },
            sdkToolFlags: {
                buildFlags: "",
                runFlags: "",
                debugFlags: ""
            }
        };

        // Create JSON with comments (using a formatted string for better readability)
        const projectJsonWithComments = `{
  "mainFile": "${projectConfig.mainFile}",
  "projectName": "${projectConfig.projectName}",
  
  "compilerSettings": {
    "enableIntellivoice": ${projectConfig.compilerSettings!.enableIntellivoice},
    "enableJLP": ${projectConfig.compilerSettings!.enableJLP},
    "enableJLPSavegame": ${projectConfig.compilerSettings!.enableJLPSavegame},
    "enableSDKUseBINFormat": ${projectConfig.compilerSettings!.enableSDKUseBINFormat}
  },
  
  "toolFlags": {
    "compilerFlags": "",
    "assemblerFlags": "",
    "emulatorFlags": ""
  },
  
  "sdkToolFlags": {
    "buildFlags": "",
    "runFlags": "",
    "debugFlags": ""
  }
}`;
        
        // Write project file
        try {
            await vscode.workspace.fs.writeFile(
                projectFileUri,
                Buffer.from(projectJsonWithComments, 'utf8')
            );

            vscode.window.showInformationMessage(`Created intybasic.json with main file: ${mainFileRelativePath}`);

            // Open the project file for review
            const document = await vscode.workspace.openTextDocument(projectFileUri);
            await vscode.window.showTextDocument(document);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to create project file: ${error.message}`);
        }
    }

    // Helper function to create .gitignore file
    async function createGitignoreFile(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('Please open a workspace folder first.');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri;
        const gitignoreUri = vscode.Uri.joinPath(workspaceRoot, '.gitignore');
        
        // Check if .gitignore already exists
        let existingContent = '';
        let fileExists = false;
        try {
            const fileContent = await vscode.workspace.fs.readFile(gitignoreUri);
            existingContent = Buffer.from(fileContent).toString('utf8');
            fileExists = true;
        } catch {
            // File doesn't exist, proceed
        }

        // IntyBASIC build directories to ignore
        const intybasicEntries = [
            '# IntyBASIC build artifacts',
            'asm/',
            'asm-debug/',
            'bin/',
            'debug/'
        ];

        if (fileExists) {
            // Check if IntyBASIC entries already exist
            const hasIntybasicEntries = intybasicEntries.some(entry => 
                existingContent.includes(entry.replace('# ', ''))
            );

            if (hasIntybasicEntries) {
                const overwrite = await vscode.window.showWarningMessage(
                    '.gitignore already contains IntyBASIC entries. Do you want to append them again?',
                    { modal: true },
                    'Append Anyway', 'Cancel'
                );
                if (overwrite !== 'Append Anyway') {
                    return;
                }
            }

            // Append to existing file
            const newContent = existingContent.trimEnd() + '\n\n' + intybasicEntries.join('\n') + '\n';
            
            try {
                await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(newContent, 'utf8'));
                vscode.window.showInformationMessage('Added IntyBASIC entries to .gitignore');
                
                // Open the file
                const document = await vscode.workspace.openTextDocument(gitignoreUri);
                await vscode.window.showTextDocument(document);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to update .gitignore: ${error.message}`);
            }
        } else {
            // Create new .gitignore file
            const content = intybasicEntries.join('\n') + '\n';
            
            try {
                await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage('Created .gitignore with IntyBASIC build directories');
                
                // Open the file
                const document = await vscode.workspace.openTextDocument(gitignoreUri);
                await vscode.window.showTextDocument(document);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to create .gitignore: ${error.message}`);
            }
        }
    }

    // ==================== Standalone Mode Functions ====================

    // Helper function to build ROM
    async function buildROM(editor: vscode.TextEditor): Promise<boolean> {
        const { ENABLE_JLP } = getCurrentSettings(activeProjectContext);
        diagnosticCollection.clear();

        const sourceBaseName = path.basename(editor.document.fileName, '.bas');
        const projectName = getEffectiveProjectName(editor.document.fileName);
        const fileDir = path.dirname(editor.document.fileName);
        
        const outputDir = path.join(fileDir, OUTPUT_DIR);
        const asmDir = path.join(fileDir, 'asm');
        const asmOutputPath = path.join(asmDir, `${sourceBaseName}.asm`);
        const romPath = path.join(outputDir, `${projectName}.bin`);

        // Check if ROM is already up-to-date
        try {
            const romStat = await vscode.workspace.fs.stat(vscode.Uri.file(romPath));
            
            // Find all .bas files in the workspace
            const basFiles = await vscode.workspace.findFiles('**/*.bas', '**/node_modules/**');
            let anySourceNewer = false;
            
            for (const basFile of basFiles) {
                try {
                    const basFileStat = await vscode.workspace.fs.stat(basFile);
                    if (basFileStat.mtime > romStat.mtime) {
                        anySourceNewer = true;
                        break;
                    }
                } catch (e) {
                    // Can't stat this file, skip
                }
            }
            
            // Also check if project file is newer than ROM
            let projectFileIsNewer = false;
            if (activeProjectContext && activeProjectContext.projectFile) {
                try {
                    const projectStat = await vscode.workspace.fs.stat(activeProjectContext.projectFile);
                    if (projectStat.mtime > romStat.mtime) {
                        projectFileIsNewer = true;
                    }
                } catch (e) {
                    // Project file doesn't exist or can't stat
                }
            }
            
            if (!anySourceNewer && !projectFileIsNewer) {
                outputChannel.clear();
                outputChannel.appendLine('Build artifacts are already up-to-date.');
                outputChannel.appendLine(`ROM: ${romPath}`);
                outputChannel.show(true);
                vscode.window.showInformationMessage('Build artifacts are already up-to-date.');
                return true;
            }
        } catch (e) {
            // ROM doesn't exist or can't check, proceed with build
        }

        // Ensure output directories exist
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(outputDir));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(asmDir));
        } catch (e) {
            // Directories might already exist
        }

        const transpileArgs = [];
        if (ENABLE_JLP) {
            transpileArgs.push('--jlp');
        }
        // Add project-specific compiler flags
        if (activeProjectContext && activeProjectContext.toolFlags.compilerFlags) {
            transpileArgs.push(activeProjectContext.toolFlags.compilerFlags);
        }
        transpileArgs.push(
            `"${editor.document.fileName}"`,
            `"${asmOutputPath}"`
        );
        if (INTYBASIC_LIBRARY_PATH) {
            transpileArgs.push(`"${INTYBASIC_LIBRARY_PATH}"`);
        }
        
        const transpileCommand = `"${INTYBASIC_COMPILER_PATH}" ${transpileArgs.join(' ')}`;
        
        outputChannel.clear();
        outputChannel.appendLine('Building IntyBASIC ROM...');
        outputChannel.appendLine(`Command: ${transpileCommand}`);
        outputChannel.appendLine('');
        
        try {
            const { stdout, stderr } = await execAsync(transpileCommand, { cwd: fileDir });
            const output = stdout + stderr;
            
            outputChannel.appendLine(output);
            
            const errors = parseIntyBasicErrors(output, editor.document.uri);
            if (errors.length > 0) {
                diagnosticCollection.set(editor.document.uri, errors);
                outputChannel.show(true);
                vscode.window.showErrorMessage(`IntyBASIC transpilation failed with ${errors.length} error(s). Check the Problems panel.`);
                return false;
            }
            
            diagnosticCollection.clear();
            
            const assembleArgs = [
                '-o',
                `"${path.join(outputDir, projectName)}"`,
                `"${asmOutputPath}"`
            ];
            // Add project-specific assembler flags
            if (activeProjectContext && activeProjectContext.toolFlags.assemblerFlags) {
                assembleArgs.splice(assembleArgs.length - 1, 0, activeProjectContext.toolFlags.assemblerFlags);
            }
            const assembleCommand = `"${AS1600_ASSEMBLER_PATH}" ${assembleArgs.join(' ')}`;
            
            outputChannel.appendLine('Running assembler...');
            outputChannel.appendLine(`Command: ${assembleCommand}`);
            outputChannel.appendLine('');
            
            const assembleResult = await execAsync(assembleCommand, { cwd: fileDir });
            outputChannel.appendLine(assembleResult.stdout + assembleResult.stderr);
            
            outputChannel.appendLine('');
            outputChannel.appendLine('Build completed successfully!');
            outputChannel.show(true);
            
            return true;
            
        } catch (error: any) {
            const output = (error.stdout || '') + (error.stderr || '');
            outputChannel.appendLine(output);
            outputChannel.show(true);
            
            const errors = parseIntyBasicErrors(output, editor.document.uri);
            
            if (errors.length > 0) {
                diagnosticCollection.set(editor.document.uri, errors);
                vscode.window.showErrorMessage(`IntyBASIC build failed with ${errors.length} error(s). Check the Problems panel.`);
            } else {
                vscode.window.showErrorMessage(`Build failed: ${error.message}`);
            }
            return false;
        }
    }

    // Helper function to build ROM with debug symbols
    async function buildROMDebug(editor: vscode.TextEditor): Promise<boolean> {
        const { ENABLE_JLP } = getCurrentSettings(activeProjectContext);
        const sourceBaseName = path.basename(editor.document.fileName, '.bas');
        const projectName = getEffectiveProjectName(editor.document.fileName);
        const fileDir = path.dirname(editor.document.fileName);
        const asmDir = path.join(fileDir, 'asm-debug');
        const outputDir = path.join(fileDir, 'debug');
        const asmOutputPath = path.join(asmDir, `${sourceBaseName}.asm`);
        const romPath = path.join(outputDir, `${projectName}.bin`);
        const smapPath = path.join(outputDir, `${projectName}.smap`);
        const symPath = path.join(outputDir, `${projectName}.sym`);

        // Ensure output directories exist
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(outputDir));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(asmDir));
        } catch (e) {
            // Directories might already exist
        }

        const transpileArgs = [];
        if (ENABLE_JLP) {
            transpileArgs.push('--jlp');
        }
        // Add project-specific compiler flags
        if (activeProjectContext && activeProjectContext.toolFlags.compilerFlags) {
            transpileArgs.push(activeProjectContext.toolFlags.compilerFlags);
        }
        transpileArgs.push(
            `"${editor.document.fileName}"`,
            `"${asmOutputPath}"`
        );
        if (INTYBASIC_LIBRARY_PATH) {
            transpileArgs.push(`"${INTYBASIC_LIBRARY_PATH}"`);
        }
        
        const transpileCommand = `"${INTYBASIC_COMPILER_PATH}" ${transpileArgs.join(' ')}`;
        
        outputChannel.clear();
        outputChannel.appendLine('Building IntyBASIC ROM (Debug Mode)...');
        outputChannel.appendLine(`Command: ${transpileCommand}`);
        outputChannel.appendLine('');
        
        try {
            const { stdout, stderr } = await execAsync(transpileCommand, { cwd: fileDir });
            const output = stdout + stderr;
            
            outputChannel.appendLine(output);
            
            const errors = parseIntyBasicErrors(output, editor.document.uri);
            if (errors.length > 0) {
                diagnosticCollection.set(editor.document.uri, errors);
                outputChannel.show(true);
                vscode.window.showErrorMessage(`IntyBASIC compilation failed with ${errors.length} error(s). Check the Problems panel.`);
                return false;
            }
            
            diagnosticCollection.clear();
            
            // Assemble with source map and symbol file flags
            const lstPath = path.join(outputDir, `${projectName}.lst`);
            const assembleArgs = [
                '-o',
                `"${path.join(outputDir, projectName)}"`,
                '-l',
                `"${lstPath}"`,
                '-j',
                `"${smapPath}"`,
                '-s',
                `"${symPath}"`,
                `"${asmOutputPath}"`
            ];
            // Add project-specific assembler flags
            if (activeProjectContext && activeProjectContext.toolFlags.assemblerFlags) {
                assembleArgs.splice(assembleArgs.length - 1, 0, activeProjectContext.toolFlags.assemblerFlags);
            }
            const assembleCommand = `"${AS1600_ASSEMBLER_PATH}" ${assembleArgs.join(' ')}`;
            
            outputChannel.appendLine('Running assembler (with debug symbols)...');
            outputChannel.appendLine(`Command: ${assembleCommand}`);
            outputChannel.appendLine('');
            
            const assembleResult = await execAsync(assembleCommand, { cwd: fileDir });
            outputChannel.appendLine(assembleResult.stdout + assembleResult.stderr);
            
            // Process source map with intysmap if available (may be obsolete with newer AS1600)
            if (INTYSMAP_PATH) {
                outputChannel.appendLine('Processing source map with intysmap...');
                const intysmapCommand = `"${INTYSMAP_PATH}" "${smapPath}"`;
                outputChannel.appendLine(`Command: ${intysmapCommand}`);
                outputChannel.appendLine('');
                
                try {
                    const intysmapResult = await execAsync(intysmapCommand, { cwd: fileDir });
                    outputChannel.appendLine(intysmapResult.stdout + intysmapResult.stderr);
                } catch (error: any) {
                    outputChannel.appendLine(`Warning: intysmap failed: ${error.message}`);
                    outputChannel.appendLine('Continuing without intysmap processing (newer AS1600 versions may not need it)...');
                }
            } else {
                outputChannel.appendLine('Note: intysmap not configured (likely not needed with newer AS1600 versions).');
            }
            
            outputChannel.appendLine('');
            outputChannel.appendLine('Debug build completed successfully!');
            outputChannel.appendLine(`Source map: ${smapPath}`);
            outputChannel.appendLine(`Symbol file: ${symPath}`);
            outputChannel.show(true);
            
            return true;
            
        } catch (error: any) {
            const output = (error.stdout || '') + (error.stderr || '');
            outputChannel.appendLine(output);
            outputChannel.show(true);
            
            const errors = parseIntyBasicErrors(output, editor.document.uri);
            
            if (errors.length > 0) {
                diagnosticCollection.set(editor.document.uri, errors);
                vscode.window.showErrorMessage(`IntyBASIC debug build failed with ${errors.length} error(s). Check the Problems panel.`);
            } else {
                vscode.window.showErrorMessage(`Debug build failed: ${error.message}`);
            }
            return false;
        }
    }

    // Helper function to run ROM
    async function runROM(editor: vscode.TextEditor) {
        const { ENABLE_INTELLIVOICE, ENABLE_JLP, ENABLE_JLP_SAVEGAME } = getCurrentSettings(activeProjectContext);
        const projectName = getEffectiveProjectName(editor.document.fileName);
        const fileDir = path.dirname(editor.document.fileName);
        const romPath = path.join(fileDir, OUTPUT_DIR, `${projectName}.bin`);

        // Check if ROM exists and is up-to-date
        try {
            const romStat = await vscode.workspace.fs.stat(vscode.Uri.file(romPath));
            
            // Find all .bas files in the workspace
            const basFiles = await vscode.workspace.findFiles('**/*.bas', '**/node_modules/**');
            let anySourceNewer = false;
            
            for (const basFile of basFiles) {
                try {
                    const basFileStat = await vscode.workspace.fs.stat(basFile);
                    if (basFileStat.mtime > romStat.mtime) {
                        anySourceNewer = true;
                        break;
                    }
                } catch (e) {
                    // Can't stat this file, skip
                }
            }
            
            // Also check if project file is newer than ROM
            let projectFileIsNewer = false;
            if (activeProjectContext && activeProjectContext.projectFile) {
                try {
                    const projectStat = await vscode.workspace.fs.stat(activeProjectContext.projectFile);
                    if (projectStat.mtime > romStat.mtime) {
                        projectFileIsNewer = true;
                    }
                } catch (e) {
                    // Project file doesn't exist or can't stat
                }
            }
            
            if (anySourceNewer || projectFileIsNewer) {
                const response = await vscode.window.showWarningMessage(
                    'The ROM file is older than the source files. Build first?',
                    'Build & Run',
                    'Run Anyway',
                    'Cancel'
                );
                
                if (response === 'Build & Run') {
                    const success = await buildROM(editor);
                    if (!success) {
                        return;
                    }
                } else if (response === 'Cancel' || !response) {
                    return;
                }
            }
        } catch (error) {
            const response = await vscode.window.showErrorMessage(
                'ROM file not found. Build first?',
                'Build & Run',
                'Cancel'
            );
            
            if (response === 'Build & Run') {
                const success = await buildROM(editor);
                if (!success) {
                    return;
                }
            } else {
                return;
            }
        }

        // Build the emulator command
        const args = ['-z3'];
        if (JZINTV_EXEC_PATH) {
            args.push('-e', `"${JZINTV_EXEC_PATH}"`);
        }
        if (JZINTV_GROM_PATH) {
            args.push('-g', `"${JZINTV_GROM_PATH}"`);
        }
        if (ENABLE_INTELLIVOICE) {
            args.push('-v1');
        }
        if (ENABLE_JLP) {
            // JLP mode 3: Accelerators + RAM enabled, flash storage present
            args.push('-J3');
            if (ENABLE_JLP_SAVEGAME) {
                // Add JLP savegame support - use ROM name + .sav
                const savegamePath = romPath.replace(/\.bin$/, '.sav');
                args.push(`--jlp-savegame="${savegamePath}"`);
            }
        }
        // Add project-specific emulator flags
        if (activeProjectContext && activeProjectContext.toolFlags.emulatorFlags) {
            args.push(activeProjectContext.toolFlags.emulatorFlags);
        }
        args.push(`"${romPath}"`);
        
        // Detect if we're on Windows (PowerShell) or Unix (bash/zsh)
        const isWindows = process.platform === 'win32';
        const runCommand = isWindows 
            ? `& "${JZINTV_EMULATOR_PATH}" ${args.join(' ')}; exit 0`
            : `"${JZINTV_EMULATOR_PATH}" ${args.join(' ')}`;
        
        // Create or reuse a terminal to run the emulator
        let terminal = vscode.window.terminals.find(t => t.name === 'IntyBASIC Emulator');
        if (!terminal) {
            terminal = vscode.window.createTerminal('IntyBASIC Emulator');
        }
        terminal.show();
        terminal.sendText(runCommand);
    }

    // Helper function to run ROM in debugger
    async function runROMDebug(editor: vscode.TextEditor) {
        const { ENABLE_INTELLIVOICE, ENABLE_JLP, ENABLE_JLP_SAVEGAME } = getCurrentSettings(activeProjectContext);
        const projectName = getEffectiveProjectName(editor.document.fileName);
        const fileDir = path.dirname(editor.document.fileName);
        const romPath = path.join(fileDir, 'debug', `${projectName}.bin`);
        const smapPath = path.join(fileDir, 'debug', `${projectName}.smap`);
        const symPath = path.join(fileDir, 'debug', `${projectName}.sym`);

        // Check if ROM exists
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(romPath));
        } catch (error) {
            const response = await vscode.window.showErrorMessage(
                'ROM file not found. Build first?',
                'Debug Build & Run',
                'Cancel'
            );
            
            if (response === 'Debug Build & Run') {
                const success = await buildROMDebug(editor);
                if (!success) {
                    return;
                }
            } else {
                return;
            }
        }

        // Check if debug files exist
        let hasDebugFiles = false;
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(smapPath));
            hasDebugFiles = true;
        } catch (error) {
            const response = await vscode.window.showWarningMessage(
                'Debug symbols not found. Run a debug build first?',
                'Debug Build & Run',
                'Run Anyway',
                'Cancel'
            );
            
            if (response === 'Debug Build & Run') {
                const success = await buildROMDebug(editor);
                if (!success) {
                    return;
                }
                hasDebugFiles = true;
            } else if (response === 'Cancel' || !response) {
                return;
            }
        }

        // Build the debugger command
        const args = ['-d', '-z3'];
        
        if (hasDebugFiles) {
            args.push(`--src-map="${smapPath}"`);
            
            // Check if symbol file exists
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(symPath));
                args.push(`--sym-file="${symPath}"`);
            } catch (error) {
                // Symbol file doesn't exist, continue without it
            }
        }
        
        if (JZINTV_EXEC_PATH) {
            args.push('-e', `"${JZINTV_EXEC_PATH}"`);
        }
        if (JZINTV_GROM_PATH) {
            args.push('-g', `"${JZINTV_GROM_PATH}"`);
        }
        if (ENABLE_INTELLIVOICE) {
            args.push('-v1');
        }
        if (ENABLE_JLP) {
            // JLP mode 3: Accelerators + RAM enabled, flash storage present
            args.push('-J3');
            if (ENABLE_JLP_SAVEGAME) {
                // Add JLP savegame support - use ROM name + .sav
                const savegamePath = romPath.replace(/\.bin$/, '.sav');
                args.push(`--jlp-savegame="${savegamePath}"`);
            }
        }
        // Add project-specific emulator flags
        if (activeProjectContext && activeProjectContext.toolFlags.emulatorFlags) {
            args.push(activeProjectContext.toolFlags.emulatorFlags);
        }
        args.push(`"${romPath}"`);
        
        // Detect if we're on Windows (PowerShell) or Unix (bash/zsh)
        const isWindows = process.platform === 'win32';
        const runCommand = isWindows 
            ? `& "${JZINTV_EMULATOR_PATH}" ${args.join(' ')}`
            : `"${JZINTV_EMULATOR_PATH}" ${args.join(' ')}`;
        
        // Create or reuse a terminal to run the debugger
        let terminal = vscode.window.terminals.find(t => t.name === 'IntyBASIC Debugger');
        if (!terminal) {
            terminal = vscode.window.createTerminal('IntyBASIC Debugger');
        }
        terminal.show();
        terminal.sendText(runCommand);
    }

	// 1. Build Command: Transpile and Assemble
    let disposableBuild = vscode.commands.registerCommand('intybasic.build', async () => {
        const projectContext = await resolveTargetFile();
        if (!projectContext) {
            return;
        }

        activeProjectContext = projectContext;
        const editor = createEditorFromContext(projectContext);
        const toolchainConfig = getToolchainConfig();
        
        const buildTarget = projectContext.projectFile 
            ? `project: ${projectContext.projectName}`
            : path.basename(projectContext.mainFile.fsPath);
        vscode.window.showInformationMessage(`Building IntyBASIC ROM (${buildTarget})...`);
        
        const success = toolchainConfig.mode === 'sdk' 
            ? await buildROMSdk(editor)
            : await buildROM(editor);
            
        if (success) {
            vscode.window.showInformationMessage('Build successful!');
        }
        
        activeProjectContext = null;
    });
    
    // 2. Run Command
    let disposableRun = vscode.commands.registerCommand('intybasic.run', async () => {
        const projectContext = await resolveTargetFile();
        if (!projectContext) {
            return;
        }

        activeProjectContext = projectContext;
        const editor = createEditorFromContext(projectContext);
        const toolchainConfig = getToolchainConfig();
        
        if (toolchainConfig.mode === 'sdk') {
            await runROMSdk(editor);
        } else {
            await runROM(editor);
        }
        
        activeProjectContext = null;
    });

    // 3. Build and Run Command
    let disposableBuildAndRun = vscode.commands.registerCommand('intybasic.buildAndRun', async () => {
        const projectContext = await resolveTargetFile();
        if (!projectContext) {
            return;
        }

        activeProjectContext = projectContext;
        const editor = createEditorFromContext(projectContext);
        const toolchainConfig = getToolchainConfig();
        
        const buildTarget = projectContext.projectFile 
            ? `project: ${projectContext.projectName}`
            : path.basename(projectContext.mainFile.fsPath);
        vscode.window.showInformationMessage(`Building IntyBASIC ROM (${buildTarget})...`);
        
        const success = toolchainConfig.mode === 'sdk'
            ? await buildROMSdk(editor)
            : await buildROM(editor);
            
        if (success) {
            vscode.window.showInformationMessage('Build successful! Starting emulator...');
            if (toolchainConfig.mode === 'sdk') {
                await runROMSdk(editor);
            } else {
                await runROM(editor);
            }
        }
        
        activeProjectContext = null;
    });

    // 4. Clean Command
    let disposableClean = vscode.commands.registerCommand('intybasic.clean', async () => {
        const projectContext = await resolveTargetFile();
        if (!projectContext) {
            return;
        }

        const sourceBaseName = path.basename(projectContext.mainFile.fsPath, '.bas');
        const projectName = projectContext.projectName;
        const fileDir = path.dirname(projectContext.mainFile.fsPath);
        
        // Regular build artifacts
        const asmPath = path.join(fileDir, 'asm', `${sourceBaseName}.asm`);
        const binPath = path.join(fileDir, OUTPUT_DIR, `${projectName}.bin`);
        const romPath = path.join(fileDir, OUTPUT_DIR, `${projectName}.rom`);
        const cfgPath = path.join(fileDir, OUTPUT_DIR, `${projectName}.cfg`);
        const lstPath = path.join(fileDir, OUTPUT_DIR, `${projectName}.lst`);
        const symPath = path.join(fileDir, OUTPUT_DIR, `${projectName}.sym`);
        const smapPath = path.join(fileDir, OUTPUT_DIR, `${projectName}.smap`);
        
        // Debug build artifacts
        const asmDebugPath = path.join(fileDir, 'asm-debug', `${sourceBaseName}.asm`);
        const binDebugPath = path.join(fileDir, 'debug', `${projectName}.bin`);
        const romDebugPath = path.join(fileDir, 'debug', `${projectName}.rom`);
        const cfgDebugPath = path.join(fileDir, 'debug', `${projectName}.cfg`);
        const lstDebugPath = path.join(fileDir, 'debug', `${projectName}.lst`);
        const symDebugPath = path.join(fileDir, 'debug', `${projectName}.sym`);
        const smapDebugPath = path.join(fileDir, 'debug', `${projectName}.smap`);

        const filesToDelete = [
            asmPath, binPath, romPath, cfgPath, lstPath, symPath, smapPath,
            asmDebugPath, binDebugPath, romDebugPath, cfgDebugPath, lstDebugPath, symDebugPath, smapDebugPath
        ];
        let deletedCount = 0;

        for (const file of filesToDelete) {
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(file));
                deletedCount++;
            } catch (e) {
                // File might not exist, that's okay
            }
        }

        if (deletedCount > 0) {
            vscode.window.showInformationMessage(`Cleaned ${deletedCount} build artifact(s) for ${projectName}`);
        } else {
            vscode.window.showInformationMessage(`No build artifacts found for ${projectName}`);
        }
    });

    // 5. Debug Build Command
    let disposableDebugBuild = vscode.commands.registerCommand('intybasic.debugBuild', async () => {
        const projectContext = await resolveTargetFile();
        if (!projectContext) {
            return;
        }

        activeProjectContext = projectContext;
        const editor = createEditorFromContext(projectContext);
        const toolchainConfig = getToolchainConfig();
        
        const buildTarget = projectContext.projectFile 
            ? `project: ${projectContext.projectName}`
            : path.basename(projectContext.mainFile.fsPath);
        vscode.window.showInformationMessage(`Building IntyBASIC ROM (Debug, ${buildTarget})...`);
        
        const success = toolchainConfig.mode === 'sdk'
            ? await buildROMSdk(editor)  // SDK mode doesn't distinguish debug builds
            : await buildROMDebug(editor);
            
        if (success) {
            vscode.window.showInformationMessage('Debug build successful!');
        }
        
        activeProjectContext = null;
    });

    // 6. Debug Run Command
    let disposableDebugRun = vscode.commands.registerCommand('intybasic.debugRun', async () => {
        const projectContext = await resolveTargetFile();
        if (!projectContext) {
            return;
        }

        activeProjectContext = projectContext;
        const editor = createEditorFromContext(projectContext);
        const toolchainConfig = getToolchainConfig();
        
        if (toolchainConfig.mode === 'sdk') {
            await runROMDebugSdk(editor);
        } else {
            await runROMDebug(editor);
        }
        
        activeProjectContext = null;
    });

    // 7. Debug Build and Run Command
    let disposableDebugBuildAndRun = vscode.commands.registerCommand('intybasic.debugBuildAndRun', async () => {
        const projectContext = await resolveTargetFile();
        if (!projectContext) {
            return;
        }

        activeProjectContext = projectContext;
        const editor = createEditorFromContext(projectContext);
        const toolchainConfig = getToolchainConfig();
        
        const buildTarget = projectContext.projectFile 
            ? `project: ${projectContext.projectName}`
            : path.basename(projectContext.mainFile.fsPath);
        vscode.window.showInformationMessage(`Building IntyBASIC ROM (Debug, ${buildTarget})...`);
        
        const success = toolchainConfig.mode === 'sdk'
            ? await buildROMSdk(editor)
            : await buildROMDebug(editor);
            
        if (success) {
            vscode.window.showInformationMessage('Debug build successful! Starting debugger...');
            if (toolchainConfig.mode === 'sdk') {
                await runROMDebugSdk(editor);
            } else {
                await runROMDebug(editor);
            }
        }
        
        activeProjectContext = null;
    });

    // 8. New SDK Project Command
    let disposableNewProject = vscode.commands.registerCommand('intybasic.newProject', async () => {
        await createSDKProject();
    });

    // 9. Create Project File Command
    let disposableCreateProject = vscode.commands.registerCommand('intybasic.createProject', async () => {
        await createProjectFile();
    });

    // 10. Create Gitignore Command
    let disposableCreateGitignore = vscode.commands.registerCommand('intybasic.createGitignore', async () => {
        await createGitignoreFile();
    });

    context.subscriptions.push(disposableBuild, disposableRun, disposableBuildAndRun, disposableClean, disposableDebugBuild, disposableDebugRun, disposableDebugBuildAndRun, disposableNewProject, disposableCreateProject, disposableCreateGitignore);
}

// This method is called when your extension is deactivated
// This method is called when your extension is deactivated
export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
