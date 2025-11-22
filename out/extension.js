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
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
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
// GLobal paths retrieved from settings
const INTYBASIC_COMPILER_PATH = getConfig('compilerPath');
const INTYBASIC_LIBRARY_PATH = getConfig('libraryPath');
const AS1600_ASSEMBLER_PATH = getConfig('assemblerPath');
const JZINTV_EMULATOR_PATH = getConfig('emulatorPath');
const JZINTV_EXEC_PATH = getConfig('execRomPath');
const JZINTV_GROM_PATH = getConfig('gromRomPath');
const OUTPUT_DIR = getConfig('outputDirectory') || 'bin';
// Update warning message for new required paths (optional, but good practice)
if (!INTYBASIC_COMPILER_PATH || !INTYBASIC_LIBRARY_PATH || !AS1600_ASSEMBLER_PATH || !JZINTV_EMULATOR_PATH || !JZINTV_EXEC_PATH || !JZINTV_GROM_PATH) {
    vscode.window.showWarningMessage('Some IntyBasic tool or ROM paths are not configured. Please check your extension settings.');
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    // Create a diagnostic collection for IntyBASIC errors
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('intybasic');
    context.subscriptions.push(diagnosticCollection);
    // Create an output channel for build messages
    const outputChannel = vscode.window.createOutputChannel('IntyBASIC Build');
    context.subscriptions.push(outputChannel);
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
        args.push(`"${romPath}"`);
        const runCommand = `& "${JZINTV_EMULATOR_PATH}" ${args.join(' ')}; exit 0`;
        // Create or reuse a terminal to run the emulator
        let terminal = vscode.window.terminals.find(t => t.name === 'IntyBASIC Emulator');
        if (!terminal) {
            terminal = vscode.window.createTerminal('IntyBASIC Emulator');
        }
        terminal.show();
        terminal.sendText(runCommand);
    }
    // 1. Build Command: Transpile and Assemble
    let disposableBuild = vscode.commands.registerCommand('intybasic.build', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        vscode.window.showInformationMessage('Building IntyBASIC ROM...');
        const success = await buildROM(editor);
        if (success) {
            vscode.window.showInformationMessage('Build successful!');
        }
    });
    // 2. Run Command
    let disposableRun = vscode.commands.registerCommand('intybasic.run', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        await runROM(editor);
    });
    // 3. Build and Run Command
    let disposableBuildAndRun = vscode.commands.registerCommand('intybasic.buildAndRun', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        vscode.window.showInformationMessage('Building IntyBASIC ROM...');
        const success = await buildROM(editor);
        if (success) {
            vscode.window.showInformationMessage('Build successful! Starting emulator...');
            await runROM(editor);
        }
    });
    // 4. Clean Command
    let disposableClean = vscode.commands.registerCommand('intybasic.clean', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const fileBaseName = path.basename(editor.document.fileName, '.bas');
        const fileDir = path.dirname(editor.document.fileName);
        const asmPath = path.join(fileDir, 'asm', `${fileBaseName}.asm`);
        const binPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.bin`);
        const romPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.rom`);
        const cfgPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.cfg`);
        const lstPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.lst`);
        const symPath = path.join(fileDir, OUTPUT_DIR, `${fileBaseName}.sym`);
        const filesToDelete = [asmPath, binPath, romPath, cfgPath, lstPath, symPath];
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
    context.subscriptions.push(disposableBuild, disposableRun, disposableBuildAndRun, disposableClean);
}
// This method is called when your extension is deactivated
function deactivate() { }
//# sourceMappingURL=extension.js.map