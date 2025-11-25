"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const node_1 = require("vscode-languageclient/node");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
let client;
function getToolchainConfig() {
    const config = vscode.workspace.getConfiguration('intybasic');
    const mode = config.get('toolchainMode') || 'standalone';
    const sdkPath = config.get('sdkPath');
    return { mode, sdkPath };
}
// Detect if a file is within an SDK project structure
function detectSdkProject(filePath) {
    const sdkFolders = ['Projects', 'Examples', 'Contributions'];
    return sdkFolders.some(folder => filePath.includes(path.sep + folder + path.sep));
}
// Get project name from file path
function getProjectName(filePath) {
    return path.basename(filePath, '.bas');
}
// Helper function to parse IntyBASIC error output
function parseIntyBasicErrors(output, fileUri) {
    const diagnostics = [];
    const errorRegex = /^Error:\s+(.+)\s+in\s+line\s+(\d+)$/gm;
    let match;
    while ((match = errorRegex.exec(output)) !== null) {
        const message = match[1];
        const lineNumber = parseInt(match[2]) - 1; // VS Code uses 0-based line numbers
        const range = new vscode.Range(new vscode.Position(lineNumber, 0), new vscode.Position(lineNumber, Number.MAX_VALUE));
        const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'IntyBASIC';
        diagnostics.push(diagnostic);
    }
    return diagnostics;
}
// Helper function to get configuration settings
function getConfig(key) {
    // 'intybasic' is the root namespace defined in package.json
    const config = vscode.workspace.getConfiguration('intybasic');
    return config.get(key);
}
function getConfigBoolean(key) {
    const config = vscode.workspace.getConfiguration('intybasic');
    return config.get(key) || false;
}
// Global configuration - will be initialized based on mode
const ENABLE_INTELLIVOICE = getConfigBoolean('enableIntellivoice');
const ENABLE_JLP_SAVEGAME = getConfigBoolean('enableJlpSavegame');
// Standalone mode paths (only used when mode is 'standalone')
let INTYBASIC_COMPILER_PATH;
let INTYBASIC_LIBRARY_PATH;
let AS1600_ASSEMBLER_PATH;
let JZINTV_EMULATOR_PATH;
let JZINTV_EXEC_PATH;
let JZINTV_GROM_PATH;
let INTYSMAP_PATH;
let OUTPUT_DIR = 'bin'; // Default value
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
    }
    else if (toolchainConfig.mode === 'sdk') {
        // Validate SDK configuration
        if (!toolchainConfig.sdkPath) {
            vscode.window.showErrorMessage('IntyBASIC SDK mode is enabled but SDK path is not configured. Please set intybasic.sdkPath in settings.');
        }
        else if (!fs.existsSync(toolchainConfig.sdkPath)) {
            vscode.window.showErrorMessage(`IntyBASIC SDK path does not exist: ${toolchainConfig.sdkPath}`);
        }
    }
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    // Initialize configuration based on toolchain mode
    initializeConfiguration();
    // Terminal references for reuse
    let emulatorTerminal;
    let debuggerTerminal;
    // Helper function to get or create terminal
    function getOrCreateTerminal(name, terminalRef) {
        // Check if terminal still exists
        if (terminalRef && vscode.window.terminals.includes(terminalRef)) {
            return terminalRef;
        }
        // Create new terminal
        return vscode.window.createTerminal({ name });
    }
    // Start the language server
    const serverModule = context.asAbsolutePath(path.join('out', 'server', 'intybasicServer.js'));
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] }
        }
    };
    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'intybasic' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.bas')
        }
    };
    client = new node_1.LanguageClient('intybasicLanguageServer', 'IntyBASIC Language Server', serverOptions, clientOptions);
    client.start();
    // Create a diagnostic collection for IntyBASIC errors
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('intybasic');
    context.subscriptions.push(diagnosticCollection);
    // Create an output channel for build messages
    const outputChannel = vscode.window.createOutputChannel('IntyBASIC Build');
    context.subscriptions.push(outputChannel);
    // ==================== SDK Mode Functions ====================
    // Helper function to get SDK script path based on platform
    function getSDKScriptPath(scriptName, sdkPath) {
        if (process.platform === 'win32') {
            return path.join(sdkPath, 'bin', `${scriptName}.BAT`);
        }
        else if (process.platform === 'darwin') {
            // macOS uses Perl scripts in bin directory
            return path.join(sdkPath, 'bin', scriptName.toLowerCase());
        }
        else {
            throw new Error('SDK mode is not supported on Linux. Please use standalone mode.');
        }
    }
    // Helper function to build ROM using SDK
    async function buildROMSdk(editor) {
        const toolchainConfig = getToolchainConfig();
        if (!toolchainConfig.sdkPath) {
            vscode.window.showErrorMessage('SDK path is not configured.');
            return false;
        }
        diagnosticCollection.clear();
        const projectName = getProjectName(editor.document.fileName);
        const isExample = detectSdkProject(editor.document.fileName) &&
            (editor.document.fileName.includes('Examples') ||
                editor.document.fileName.includes('Contributions'));
        outputChannel.clear();
        outputChannel.appendLine('Building IntyBASIC ROM using SDK...');
        outputChannel.appendLine(`Project: ${projectName}`);
        outputChannel.appendLine(`SDK Path: ${toolchainConfig.sdkPath}`);
        outputChannel.appendLine('');
        try {
            let buildCommand;
            const flags = [];
            if (isExample) {
                flags.push('-x');
            }
            if (ENABLE_JLP_SAVEGAME) {
                flags.push('-j');
            }
            if (process.platform === 'win32') {
                const scriptPath = getSDKScriptPath('INTYBUILD', toolchainConfig.sdkPath);
                const binPath = path.join(toolchainConfig.sdkPath, 'bin');
                // Set INTYBASIC_INSTALL, add bin to PATH, and execute batch file
                buildCommand = `cmd /c "set "INTYBASIC_INSTALL=${toolchainConfig.sdkPath}" && set "PATH=${binPath};%PATH%" && cd /d "${toolchainConfig.sdkPath}" && "${scriptPath}" ${flags.join(' ')} ${projectName}"`;
            }
            else {
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
        }
        catch (error) {
            const output = (error.stdout || '') + (error.stderr || '');
            outputChannel.appendLine(output);
            outputChannel.show(true);
            const errors = parseIntyBasicErrors(output, editor.document.uri);
            if (errors.length > 0) {
                diagnosticCollection.set(editor.document.uri, errors);
                vscode.window.showErrorMessage(`IntyBASIC build failed with ${errors.length} error(s). Check the Problems panel.`);
            }
            else {
                vscode.window.showErrorMessage(`Build failed: ${error.message}`);
            }
            return false;
        }
    }
    // Helper function to run ROM using SDK
    async function runROMSdk(editor) {
        const toolchainConfig = getToolchainConfig();
        if (!toolchainConfig.sdkPath) {
            vscode.window.showErrorMessage('SDK path is not configured.');
            return;
        }
        const projectName = getProjectName(editor.document.fileName);
        const isExample = detectSdkProject(editor.document.fileName) &&
            (editor.document.fileName.includes('Examples') ||
                editor.document.fileName.includes('Contributions'));
        const flags = [];
        if (isExample) {
            flags.push('-x');
        }
        try {
            let runCommand;
            emulatorTerminal = getOrCreateTerminal('IntyBASIC Emulator', emulatorTerminal);
            emulatorTerminal.show();
            if (process.platform === 'win32') {
                // Rely on system PATH and INTYBASIC_INSTALL from SDK installation
                emulatorTerminal.sendText(`cd "${toolchainConfig.sdkPath}"`);
                emulatorTerminal.sendText(`.\\bin\\INTYRUN.BAT ${flags.join(' ')} ${projectName}`);
            }
            else {
                // macOS - use script from PATH (SDK installer adds to PATH)
                runCommand = `INTYBASIC_INSTALL="${toolchainConfig.sdkPath}" intyrun ${flags.join(' ')} "${projectName}"`;
                emulatorTerminal.sendText(runCommand);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to run emulator: ${error.message}`);
        }
    }
    // Helper function to run ROM in debugger using SDK
    async function runROMDebugSdk(editor) {
        const toolchainConfig = getToolchainConfig();
        if (!toolchainConfig.sdkPath) {
            vscode.window.showErrorMessage('SDK path is not configured.');
            return;
        }
        const projectName = getProjectName(editor.document.fileName);
        const isExample = detectSdkProject(editor.document.fileName) &&
            (editor.document.fileName.includes('Examples') ||
                editor.document.fileName.includes('Contributions'));
        const flags = [];
        if (isExample) {
            flags.push('-x');
        }
        try {
            let debugCommand;
            debuggerTerminal = getOrCreateTerminal('IntyBASIC Debugger', debuggerTerminal);
            debuggerTerminal.show();
            if (process.platform === 'win32') {
                // Rely on system PATH and INTYBASIC_INSTALL from SDK installation
                debuggerTerminal.sendText(`cd "${toolchainConfig.sdkPath}"`);
                debuggerTerminal.sendText(`.\\bin\\INTYDBUG.BAT ${flags.join(' ')} ${projectName}`);
            }
            else {
                // macOS - use script from PATH (SDK installer adds to PATH)
                debugCommand = `INTYBASIC_INSTALL="${toolchainConfig.sdkPath}" intydbug ${flags.join(' ')} "${projectName}"`;
                debuggerTerminal.sendText(debugCommand);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to run debugger: ${error.message}`);
        }
    }
    // Helper function to create new SDK project
    async function createSDKProject() {
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
            let newCommand;
            const args = [projectName];
            if (authorName) {
                args.push(`"${authorName}"`);
            }
            if (process.platform === 'win32') {
                const scriptPath = getSDKScriptPath('INTYNEW', toolchainConfig.sdkPath);
                const binPath = path.join(toolchainConfig.sdkPath, 'bin');
                // Set INTYBASIC_INSTALL, add bin to PATH, and execute
                newCommand = `cmd /c "set "INTYBASIC_INSTALL=${toolchainConfig.sdkPath}" && set "PATH=${binPath};%PATH%" && cd /d "${toolchainConfig.sdkPath}" && "${scriptPath}" ${args.join(' ')}"`;
            }
            else {
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
            }
            else {
                vscode.window.showWarningMessage('Project created but file not found at expected location.');
            }
        }
        catch (error) {
            outputChannel.appendLine((error.stdout || '') + (error.stderr || ''));
            outputChannel.show(true);
            vscode.window.showErrorMessage(`Failed to create project: ${error.message}`);
        }
    }
    // ==================== Standalone Mode Functions ====================
    // Helper function to build ROM
    async function buildROM(editor) {
        diagnosticCollection.clear();
        const fileBaseName = path.basename(editor.document.fileName, '.bas');
        const fileDir = path.dirname(editor.document.fileName);
        const outputDir = path.join(fileDir, OUTPUT_DIR);
        const asmDir = path.join(fileDir, 'asm');
        const asmOutputPath = path.join(asmDir, `${fileBaseName}.asm`);
        const romPath = path.join(outputDir, `${fileBaseName}.bin`);
        // Check if ROM is already up-to-date
        try {
            const romStat = await vscode.workspace.fs.stat(vscode.Uri.file(romPath));
            const sourceStat = await vscode.workspace.fs.stat(editor.document.uri);
            if (romStat.mtime >= sourceStat.mtime) {
                outputChannel.clear();
                outputChannel.appendLine('Build artifacts are already up-to-date.');
                outputChannel.appendLine(`ROM: ${romPath}`);
                outputChannel.show(true);
                vscode.window.showInformationMessage('Build artifacts are already up-to-date.');
                return true;
            }
        }
        catch (e) {
            // ROM doesn't exist or can't check, proceed with build
        }
        // Ensure output directories exist
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(outputDir));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(asmDir));
        }
        catch (e) {
            // Directories might already exist
        }
        const transpileArgs = [
            `"${editor.document.fileName}"`,
            `"${asmOutputPath}"`
        ];
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
                `"${path.join(outputDir, fileBaseName)}"`,
                `"${asmOutputPath}"`
            ];
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
        }
        catch (error) {
            const output = (error.stdout || '') + (error.stderr || '');
            outputChannel.appendLine(output);
            outputChannel.show(true);
            const errors = parseIntyBasicErrors(output, editor.document.uri);
            if (errors.length > 0) {
                diagnosticCollection.set(editor.document.uri, errors);
                vscode.window.showErrorMessage(`IntyBASIC build failed with ${errors.length} error(s). Check the Problems panel.`);
            }
            else {
                vscode.window.showErrorMessage(`Build failed: ${error.message}`);
            }
            return false;
        }
    }
    // Helper function to build ROM with debug symbols
    async function buildROMDebug(editor) {
        const fileBaseName = path.basename(editor.document.fileName, '.bas');
        const fileDir = path.dirname(editor.document.fileName);
        const asmDir = path.join(fileDir, 'asm-debug');
        const outputDir = path.join(fileDir, 'debug');
        const asmOutputPath = path.join(asmDir, `${fileBaseName}.asm`);
        const romPath = path.join(outputDir, `${fileBaseName}.bin`);
        const smapPath = path.join(outputDir, `${fileBaseName}.smap`);
        const symPath = path.join(outputDir, `${fileBaseName}.sym`);
        // Ensure output directories exist
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(outputDir));
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(asmDir));
        }
        catch (e) {
            // Directories might already exist
        }
        const transpileArgs = [
            `"${editor.document.fileName}"`,
            `"${asmOutputPath}"`
        ];
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
            const lstPath = path.join(outputDir, `${fileBaseName}.lst`);
            const assembleArgs = [
                '-o',
                `"${path.join(outputDir, fileBaseName)}"`,
                '-l',
                `"${lstPath}"`,
                '-j',
                `"${smapPath}"`,
                '-s',
                `"${symPath}"`,
                `"${asmOutputPath}"`
            ];
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
                }
                catch (error) {
                    outputChannel.appendLine(`Warning: intysmap failed: ${error.message}`);
                    outputChannel.appendLine('Continuing without intysmap processing (newer AS1600 versions may not need it)...');
                }
            }
            else {
                outputChannel.appendLine('Note: intysmap not configured (likely not needed with newer AS1600 versions).');
            }
            outputChannel.appendLine('');
            outputChannel.appendLine('Debug build completed successfully!');
            outputChannel.appendLine(`Source map: ${smapPath}`);
            outputChannel.appendLine(`Symbol file: ${symPath}`);
            outputChannel.show(true);
            return true;
        }
        catch (error) {
            const output = (error.stdout || '') + (error.stderr || '');
            outputChannel.appendLine(output);
            outputChannel.show(true);
            const errors = parseIntyBasicErrors(output, editor.document.uri);
            if (errors.length > 0) {
                diagnosticCollection.set(editor.document.uri, errors);
                vscode.window.showErrorMessage(`IntyBASIC debug build failed with ${errors.length} error(s). Check the Problems panel.`);
            }
            else {
                vscode.window.showErrorMessage(`Debug build failed: ${error.message}`);
            }
            return false;
        }
    }
    // Helper function to run ROM
    async function runROM(editor) {
        const fileBaseName = path.basename(editor.document.fileName, '.bas');
        const fileDir = path.dirname(editor.document.fileName);
        const romPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.bin`);
        // Check if ROM exists and is up-to-date
        try {
            const romStat = await vscode.workspace.fs.stat(vscode.Uri.file(romPath));
            const sourceStat = await vscode.workspace.fs.stat(editor.document.uri);
            if (romStat.mtime < sourceStat.mtime) {
                const response = await vscode.window.showWarningMessage('The ROM file is older than the source file. Build first?', 'Build & Run', 'Run Anyway', 'Cancel');
                if (response === 'Build & Run') {
                    const success = await buildROM(editor);
                    if (!success) {
                        return;
                    }
                }
                else if (response === 'Cancel' || !response) {
                    return;
                }
            }
        }
        catch (error) {
            const response = await vscode.window.showErrorMessage('ROM file not found. Build first?', 'Build & Run', 'Cancel');
            if (response === 'Build & Run') {
                const success = await buildROM(editor);
                if (!success) {
                    return;
                }
            }
            else {
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
        // Add JLP savegame support - always use ROM name + .sav
        const savegamePath = romPath.replace(/\.bin$/, '.sav');
        args.push('--jlp', `--jlp-savegame="${savegamePath}"`);
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
    async function runROMDebug(editor) {
        const fileBaseName = path.basename(editor.document.fileName, '.bas');
        const fileDir = path.dirname(editor.document.fileName);
        const romPath = path.join(fileDir, 'debug', `${fileBaseName}.bin`);
        const smapPath = path.join(fileDir, 'debug', `${fileBaseName}.smap`);
        const symPath = path.join(fileDir, 'debug', `${fileBaseName}.sym`);
        // Check if ROM exists
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(romPath));
        }
        catch (error) {
            const response = await vscode.window.showErrorMessage('ROM file not found. Build first?', 'Debug Build & Run', 'Cancel');
            if (response === 'Debug Build & Run') {
                const success = await buildROMDebug(editor);
                if (!success) {
                    return;
                }
            }
            else {
                return;
            }
        }
        // Check if debug files exist
        let hasDebugFiles = false;
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(smapPath));
            hasDebugFiles = true;
        }
        catch (error) {
            const response = await vscode.window.showWarningMessage('Debug symbols not found. Run a debug build first?', 'Debug Build & Run', 'Run Anyway', 'Cancel');
            if (response === 'Debug Build & Run') {
                const success = await buildROMDebug(editor);
                if (!success) {
                    return;
                }
                hasDebugFiles = true;
            }
            else if (response === 'Cancel' || !response) {
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
            }
            catch (error) {
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
        // Add JLP savegame support - always use ROM name + .sav
        const savegamePath = romPath.replace(/\.bin$/, '.sav');
        args.push('--jlp', `--jlp-savegame="${savegamePath}"`);
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
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            vscode.window.showErrorMessage('No IntyBASIC file is open.');
            return;
        }
        const toolchainConfig = getToolchainConfig();
        vscode.window.showInformationMessage('Building IntyBASIC ROM...');
        const success = toolchainConfig.mode === 'sdk'
            ? await buildROMSdk(editor)
            : await buildROM(editor);
        if (success) {
            vscode.window.showInformationMessage('Build successful!');
        }
    });
    // 2. Run Command
    let disposableRun = vscode.commands.registerCommand('intybasic.run', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            vscode.window.showErrorMessage('No IntyBASIC file is open.');
            return;
        }
        const toolchainConfig = getToolchainConfig();
        if (toolchainConfig.mode === 'sdk') {
            await runROMSdk(editor);
        }
        else {
            await runROM(editor);
        }
    });
    // 3. Build and Run Command
    let disposableBuildAndRun = vscode.commands.registerCommand('intybasic.buildAndRun', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            vscode.window.showErrorMessage('No IntyBASIC file is open.');
            return;
        }
        const toolchainConfig = getToolchainConfig();
        vscode.window.showInformationMessage('Building IntyBASIC ROM...');
        const success = toolchainConfig.mode === 'sdk'
            ? await buildROMSdk(editor)
            : await buildROM(editor);
        if (success) {
            vscode.window.showInformationMessage('Build successful! Starting emulator...');
            if (toolchainConfig.mode === 'sdk') {
                await runROMSdk(editor);
            }
            else {
                await runROM(editor);
            }
        }
    });
    // 4. Clean Command
    let disposableClean = vscode.commands.registerCommand('intybasic.clean', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            vscode.window.showErrorMessage('No IntyBASIC file is open.');
            return;
        }
        const fileBaseName = path.basename(editor.document.fileName, '.bas');
        const fileDir = path.dirname(editor.document.fileName);
        // Regular build artifacts
        const asmPath = path.join(fileDir, 'asm', `${fileBaseName}.asm`);
        const binPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.bin`);
        const romPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.rom`);
        const cfgPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.cfg`);
        const lstPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.lst`);
        const symPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.sym`);
        const smapPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.smap`);
        // Debug build artifacts
        const asmDebugPath = path.join(fileDir, 'asm-debug', `${fileBaseName}.asm`);
        const binDebugPath = path.join(fileDir, 'debug', `${fileBaseName}.bin`);
        const romDebugPath = path.join(fileDir, 'debug', `${fileBaseName}.rom`);
        const cfgDebugPath = path.join(fileDir, 'debug', `${fileBaseName}.cfg`);
        const lstDebugPath = path.join(fileDir, 'debug', `${fileBaseName}.lst`);
        const symDebugPath = path.join(fileDir, 'debug', `${fileBaseName}.sym`);
        const smapDebugPath = path.join(fileDir, 'debug', `${fileBaseName}.smap`);
        const filesToDelete = [
            asmPath, binPath, romPath, cfgPath, lstPath, symPath, smapPath,
            asmDebugPath, binDebugPath, romDebugPath, cfgDebugPath, lstDebugPath, symDebugPath, smapDebugPath
        ];
        let deletedCount = 0;
        for (const file of filesToDelete) {
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(file));
                deletedCount++;
            }
            catch (e) {
                // File might not exist, that's okay
            }
        }
        if (deletedCount > 0) {
            vscode.window.showInformationMessage(`Cleaned ${deletedCount} build artifact(s) for ${fileBaseName}.bas`);
        }
        else {
            vscode.window.showInformationMessage(`No build artifacts found for ${fileBaseName}.bas`);
        }
    });
    // 5. Debug Build Command
    let disposableDebugBuild = vscode.commands.registerCommand('intybasic.debugBuild', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            vscode.window.showErrorMessage('No IntyBASIC file is open.');
            return;
        }
        const toolchainConfig = getToolchainConfig();
        vscode.window.showInformationMessage('Building IntyBASIC ROM (Debug)...');
        const success = toolchainConfig.mode === 'sdk'
            ? await buildROMSdk(editor) // SDK mode doesn't distinguish debug builds
            : await buildROMDebug(editor);
        if (success) {
            vscode.window.showInformationMessage('Debug build successful!');
        }
    });
    // 6. Debug Run Command
    let disposableDebugRun = vscode.commands.registerCommand('intybasic.debugRun', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            vscode.window.showErrorMessage('No IntyBASIC file is open.');
            return;
        }
        const toolchainConfig = getToolchainConfig();
        if (toolchainConfig.mode === 'sdk') {
            await runROMDebugSdk(editor);
        }
        else {
            await runROMDebug(editor);
        }
    });
    // 7. Debug Build and Run Command
    let disposableDebugBuildAndRun = vscode.commands.registerCommand('intybasic.debugBuildAndRun', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.scheme !== 'file') {
            vscode.window.showErrorMessage('No IntyBASIC file is open.');
            return;
        }
        const toolchainConfig = getToolchainConfig();
        vscode.window.showInformationMessage('Building IntyBASIC ROM (Debug)...');
        const success = toolchainConfig.mode === 'sdk'
            ? await buildROMSdk(editor)
            : await buildROMDebug(editor);
        if (success) {
            vscode.window.showInformationMessage('Debug build successful! Starting debugger...');
            if (toolchainConfig.mode === 'sdk') {
                await runROMDebugSdk(editor);
            }
            else {
                await runROMDebug(editor);
            }
        }
    });
    // 8. New SDK Project Command
    let disposableNewProject = vscode.commands.registerCommand('intybasic.newProject', async () => {
        await createSDKProject();
    });
    context.subscriptions.push(disposableBuild, disposableRun, disposableBuildAndRun, disposableClean, disposableDebugBuild, disposableDebugRun, disposableDebugBuildAndRun, disposableNewProject);
}
// This method is called when your extension is deactivated
// This method is called when your extension is deactivated
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
//# sourceMappingURL=extension.js.map