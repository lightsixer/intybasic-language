import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    TextDocumentSyncKind,
    InitializeResult,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    Hover,
    MarkupKind,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    Diagnostic,
    DiagnosticSeverity,
    Definition,
    Location,
    ReferenceParams
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

// Create a connection for the server
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.', ' ']
            },
            hoverProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ['(', ',', ' ']
            },
            definitionProvider: true,
            referencesProvider: true
        }
    };

    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }

    return result;
});

connection.onInitialized(() => {
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

// IntyBASIC keyword database with documentation
const KEYWORDS = [
    { name: 'REM', description: 'Comment. Everything after REM on the line is ignored.' },
    { name: 'DIM', description: 'Declare variables. `DIM x` for 8-bit, `DIM #x` for 16-bit. Example: `DIM score, #pointer`' },
    { name: 'DEF', description: 'Define a function. Use with FN. Example: `DEF FN double(x) = x * 2`' },
    { name: 'FN', description: 'Call a user-defined function. Example: `y = FN double(5)`' },
    { name: 'DATA', description: 'Define data to be read by READ statements. Example: `DATA 1, 2, 3, 4`' },
    { name: 'READ', description: 'Read values from DATA statements into variables. Example: `READ x, y, z`' },
    { name: 'RESTORE', description: 'Reset the DATA pointer to the beginning or a specific label.' },
    { name: 'IF', description: 'Conditional statement. Example: `IF x > 10 THEN PRINT "High" ELSE PRINT "Low" END IF`' },
    { name: 'THEN', description: 'Used with IF to specify code to execute when condition is true.' },
    { name: 'ELSE', description: 'Specifies code to execute when IF condition is false.' },
    { name: 'ELSEIF', description: 'Test another condition if previous IF/ELSEIF was false.' },
    { name: 'END', description: 'Ends a block (IF, FOR, WHILE, SELECT, PROCEDURE).' },
    { name: 'SELECT', description: 'Start a SELECT CASE block. Example: `SELECT CASE x`' },
    { name: 'CASE', description: 'Match a value in SELECT block. Example: `CASE 1` or `CASE 5 TO 10`' },
    { name: 'EXIT', description: 'Exit from a loop (FOR, WHILE, DO, SELECT). Example: `EXIT FOR`' },
    { name: 'FOR', description: 'Start a FOR loop. Example: `FOR i = 1 TO 10 STEP 1`' },
    { name: 'TO', description: 'Specifies end value in FOR loop. Example: `FOR i = 1 TO 10`' },
    { name: 'STEP', description: 'Specifies increment in FOR loop. Example: `FOR i = 1 TO 10 STEP 2`' },
    { name: 'NEXT', description: 'End of FOR loop. Example: `NEXT i`' },
    { name: 'WHILE', description: 'Start a WHILE loop. Example: `WHILE x < 100`' },
    { name: 'WEND', description: 'End of WHILE loop.' },
    { name: 'DO', description: 'Start a DO loop. Example: `DO WHILE x < 100` or `DO UNTIL x = 0`' },
    { name: 'LOOP', description: 'End of DO loop. Can use `LOOP WHILE` or `LOOP UNTIL`.' },
    { name: 'UNTIL', description: 'Loop until condition becomes true. Example: `DO UNTIL x = 0`' },
    { name: 'REPEAT', description: 'Start an infinite loop. Exit with `GOTO` or `RETURN`.' },
    { name: 'GOTO', description: 'Jump to a label. Example: `GOTO main_loop`' },
    { name: 'GOSUB', description: 'Call a subroutine at a label. Use RETURN to come back.' },
    { name: 'RETURN', description: 'Return from GOSUB or exit PROCEDURE.' },
    { name: 'ON', description: 'Conditional jump. Example: `ON x GOTO label1, label2, label3`' },
    { name: 'PROCEDURE', description: 'Define a procedure/subroutine. Example: `PROCEDURE draw_sprite`' },
    { name: 'SUB', description: 'Alternative keyword for PROCEDURE.' },
    { name: 'PRINT', description: 'Display text or graphics on screen. Example: `PRINT AT 100, "Hello"`' },
    { name: 'AT', description: 'Specify screen position for PRINT. Example: `PRINT AT 100, "Text"`' },
    { name: 'INPUT', description: 'Read input from controllers. Not for text input.' },
    { name: 'POKE', description: 'Write a value to memory address. Example: `POKE $1234, 100`' },
    { name: 'PEEK', description: 'Read a value from memory address. Example: `x = PEEK($1234)`' },
    { name: 'USR', description: 'Call assembly language routine. Example: `result = USR(address, arg1, arg2)`' },
    { name: 'WAIT', description: 'Pause execution. `WAIT` alone waits for frame. `WAIT n` waits n frames.' },
    { name: 'CLS', description: 'Clear the screen.' },
    { name: 'SCREEN', description: 'Set screen mode or properties. Example: `SCREEN mode`' },
    { name: 'DEFINE', description: 'Define graphics data. Example: `DEFINE sprite, 1, bitmap`' },
    { name: 'MODE', description: 'Set graphics or display mode.' },
    { name: 'SPRITE', description: 'Define or manipulate sprites (MOBs). Example: `SPRITE 0, x, y, card`' },
    { name: 'BITMAP', description: 'Specify bitmap data for graphics.' },
    { name: 'NORMAL', description: 'Normal bitmap display mode (not inverted or mirrored).' },
    { name: 'INVERSE', description: 'Invert bitmap colors.' },
    { name: 'MIRROR_X', description: 'Mirror bitmap horizontally.' },
    { name: 'SOUND', description: 'Play a sound effect. Example: `SOUND channel, frequency, volume`' },
    { name: 'MUSIC', description: 'Control music playback. Use MUSIC.PLAYING to check status.' },
    { name: 'PLAY', description: 'Play music from data. Example: `PLAY music_data`' },
    { name: 'SIMPLE', description: 'Simple music mode (monophonic).' },
    { name: 'STOP', description: 'Stop music playback.' },
    { name: 'JUMP', description: 'Jump to a point in music sequence.' },
    { name: 'SPEED', description: 'Set music playback speed.' },
    { name: 'OFF', description: 'Turn something off (sound channel, music, etc).' },
    { name: 'MIX', description: 'Mix audio channels.' },
    { name: 'TYPE', description: 'Specify sound type.' },
    { name: 'NOISE', description: 'Play noise sound.' },
    { name: 'VOL', description: 'Set volume level.' },
    { name: 'VALUE', description: 'Specify a value parameter.' },
    { name: 'FAST', description: 'Fast mode (context-dependent).' },
    { name: 'VOICE', description: 'Intellivoice speech control. Check VOICE.AVAILABLE and VOICE.PLAYING.' },
    { name: 'ENABLE', description: 'Enable a feature (interrupts, voice, etc).' },
    { name: 'DISABLE', description: 'Disable a feature (interrupts, voice, etc).' },
    { name: 'INCLUDE', description: 'Include another BASIC file. Example: `INCLUDE "sprites.bas"`' },
    { name: 'ASM', description: 'Insert inline assembly code. End with END ASM.' },
    { name: 'CALL', description: 'Call an assembly language routine.' },
    { name: 'STACK_CHECK', description: 'Enable stack overflow checking (development aid).' },
    { name: 'CONST', description: 'Define a constant. Example: `CONST MAX_SPEED = 10`' },
    { name: 'VARPTR', description: 'Get the address of a variable. Example: `addr = VARPTR(x)`' },
    { name: 'SEGMENT', description: 'Specify memory segment for code/data placement.' },
    { name: 'BANK', description: 'Specify memory bank for code/data.' },
    { name: 'MAP', description: 'Memory mapping control.' },
    { name: 'AND', description: 'Logical/bitwise AND operator. Example: `IF x > 5 AND y < 10 THEN`' },
    { name: 'OR', description: 'Logical/bitwise OR operator. Example: `IF x = 1 OR x = 2 THEN`' },
    { name: 'XOR', description: 'Logical/bitwise XOR operator. Example: `result = x XOR y`' },
    { name: 'NOT', description: 'Logical/bitwise NOT operator. Example: `IF NOT finished THEN`' }
];

const FUNCTIONS = [
    { 
        name: 'ABS', 
        signature: 'ABS(value)', 
        description: 'Returns the absolute value of a number.',
        parameters: [{ label: 'value', documentation: 'The number to get absolute value of' }]
    },
    { 
        name: 'SGN', 
        signature: 'SGN(value)', 
        description: 'Returns the sign of a number: -1 for negative, 0 for zero, 1 for positive.',
        parameters: [{ label: 'value', documentation: 'The number to get sign of' }]
    },
    { 
        name: 'RAND', 
        signature: 'RAND(max)', 
        description: 'Returns a random number between 0 and max-1.',
        parameters: [{ label: 'max', documentation: 'Upper bound (exclusive) for random number' }]
    },
    { 
        name: 'RANDOM', 
        signature: 'RANDOM(seed)', 
        description: 'Seeds the random number generator with the given value.',
        parameters: [{ label: 'seed', documentation: 'Seed value for random number generator' }]
    },
    { 
        name: 'SQR', 
        signature: 'SQR(value)', 
        description: 'Returns the square root of a number.',
        parameters: [{ label: 'value', documentation: 'The number to get square root of' }]
    },
    { 
        name: 'LEN', 
        signature: 'LEN(string)', 
        description: 'Returns the length of a string.',
        parameters: [{ label: 'string', documentation: 'The string to measure' }]
    },
    { 
        name: 'POS', 
        signature: 'POS(string1, string2)', 
        description: 'Returns the position of string2 within string1, or 0 if not found.',
        parameters: [
            { label: 'string1', documentation: 'The string to search in' },
            { label: 'string2', documentation: 'The string to search for' }
        ]
    },
    { 
        name: 'PEEK', 
        signature: 'PEEK(address)', 
        description: 'Reads a value from a memory address.',
        parameters: [{ label: 'address', documentation: 'Memory address to read from' }]
    },
    { 
        name: 'POKE', 
        signature: 'POKE address, value', 
        description: 'Writes a value to a memory address.',
        parameters: [
            { label: 'address', documentation: 'Memory address to write to' },
            { label: 'value', documentation: 'Value to write' }
        ]
    },
    { 
        name: 'USR', 
        signature: 'USR(address, args...)', 
        description: 'Calls an assembly language routine at the specified address.',
        parameters: [
            { label: 'address', documentation: 'Address of assembly routine' },
            { label: 'args', documentation: 'Optional arguments to pass' }
        ]
    },
    { 
        name: 'PRINT', 
        signature: 'PRINT [AT position,] expression', 
        description: 'Display text or graphics on screen.',
        parameters: [
            { label: 'position', documentation: 'Optional screen position (0-239)' },
            { label: 'expression', documentation: 'Text or value to display' }
        ]
    },
    { 
        name: 'SPRITE', 
        signature: 'SPRITE n, x, y, card', 
        description: 'Position and display a sprite (MOB).',
        parameters: [
            { label: 'n', documentation: 'Sprite number (0-7)' },
            { label: 'x', documentation: 'X coordinate' },
            { label: 'y', documentation: 'Y coordinate' },
            { label: 'card', documentation: 'Card/graphic number' }
        ]
    },
    { 
        name: 'SOUND', 
        signature: 'SOUND channel, frequency, volume', 
        description: 'Play a sound on a PSG channel.',
        parameters: [
            { label: 'channel', documentation: 'Sound channel (0-2 for tones, 3 for noise)' },
            { label: 'frequency', documentation: 'Frequency value' },
            { label: 'volume', documentation: 'Volume (0-15)' }
        ]
    },
    { 
        name: 'DEFINE', 
        signature: 'DEFINE name, count, bitmap...', 
        description: 'Define graphics cards/bitmaps.',
        parameters: [
            { label: 'name', documentation: 'Label for the graphics definition' },
            { label: 'count', documentation: 'Number of cards to define' },
            { label: 'bitmap', documentation: 'Bitmap data' }
        ]
    },
    { 
        name: 'FRAME', 
        signature: 'FRAME', 
        description: 'Returns the current frame number (increments at 60Hz).',
        parameters: []
    },
    { 
        name: 'NTSC', 
        signature: 'NTSC', 
        description: 'Returns 1 if running on NTSC system, 0 if PAL.',
        parameters: []
    },
    { 
        name: '#MOBSHADOW', 
        signature: '#MOBSHADOW', 
        description: 'Returns the address of the MOB shadow table.',
        parameters: []
    },
    { 
        name: '#BACKTAB', 
        signature: '#BACKTAB', 
        description: 'Returns the address of the BACKTAB (screen memory).',
        parameters: []
    }
];

const VARIABLES = [
    { name: 'CONT', description: 'Controller 1 status. Use .UP, .DOWN, .LEFT, .RIGHT, .BUTTON properties.' },
    { name: 'CONT1', description: 'Controller 1 status (same as CONT).' },
    { name: 'CONT2', description: 'Controller 2 status.' },
    { name: 'CONT3', description: 'Controller 3 status (ECS keyboard).' },
    { name: 'CONT4', description: 'Controller 4 status (ECS keyboard).' },
    { name: 'COL0', description: 'Collision status for MOB 0.' },
    { name: 'COL1', description: 'Collision status for MOB 1.' },
    { name: 'COL2', description: 'Collision status for MOB 2.' },
    { name: 'COL3', description: 'Collision status for MOB 3.' },
    { name: 'COL4', description: 'Collision status for MOB 4.' },
    { name: 'COL5', description: 'Collision status for MOB 5.' },
    { name: 'COL6', description: 'Collision status for MOB 6.' },
    { name: 'COL7', description: 'Collision status for MOB 7.' },
    { name: 'MUSIC.PLAYING', description: 'Returns 1 if music is currently playing, 0 otherwise.' },
    { name: 'VOICE.AVAILABLE', description: 'Returns 1 if Intellivoice is available, 0 otherwise.' },
    { name: 'VOICE.PLAYING', description: 'Returns 1 if Intellivoice is currently speaking, 0 otherwise.' },
    { name: 'ECS.AVAILABLE', description: 'Returns 1 if ECS is available, 0 otherwise.' },
    { name: 'FLASH.FIRST', description: 'First sector of JLP flash memory.' },
    { name: 'FLASH.LAST', description: 'Last sector of JLP flash memory.' }
];

// Completion provider
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        const items: CompletionItem[] = [];

        // Add keywords
        KEYWORDS.forEach(keyword => {
            items.push({
                label: keyword.name,
                kind: CompletionItemKind.Keyword,
                documentation: keyword.description,
                data: { type: 'keyword', name: keyword.name }
            });
        });

        // Add functions
        FUNCTIONS.forEach(func => {
            items.push({
                label: func.name,
                kind: CompletionItemKind.Function,
                detail: func.signature,
                documentation: func.description,
                data: { type: 'function', name: func.name }
            });
        });

        // Add variables
        VARIABLES.forEach(variable => {
            items.push({
                label: variable.name,
                kind: CompletionItemKind.Variable,
                documentation: variable.description,
                data: { type: 'variable', name: variable.name }
            });
        });

        return items;
    }
);

// Completion item resolver (for additional details)
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data && item.data.type === 'function') {
            const func = FUNCTIONS.find(f => f.name === item.data.name);
            if (func) {
                item.detail = func.signature;
                item.documentation = {
                    kind: MarkupKind.Markdown,
                    value: `**${func.signature}**\n\n${func.description}`
                };
            }
        }
        return item;
    }
);

// Hover provider
connection.onHover(
    (params: TextDocumentPositionParams): Hover | undefined => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return undefined;
        }

        // Get the word at the cursor position
        const text = document.getText();
        const offset = document.offsetAt(params.position);
        
        // Simple word extraction (can be improved)
        let start = offset;
        let end = offset;
        
        // Find word boundaries
        while (start > 0 && /[A-Za-z0-9_#.]/.test(text[start - 1])) {
            start--;
        }
        while (end < text.length && /[A-Za-z0-9_#.]/.test(text[end])) {
            end++;
        }
        
        const word = text.substring(start, end).toUpperCase();
        
        // Check if it's a function
        const func = FUNCTIONS.find(f => f.name === word);
        if (func) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: `**${func.signature}**\n\n${func.description}`
                }
            };
        }
        
        // Check if it's a variable
        const variable = VARIABLES.find(v => v.name === word);
        if (variable) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: `**${variable.name}**\n\n${variable.description}`
                }
            };
        }
        
        // Check if it's a keyword
        const keyword = KEYWORDS.find(k => k.name === word);
        if (keyword) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: `**${keyword.name}**\n\n${keyword.description}`
                }
            };
        }
        
        return undefined;
    }
);

// Signature help provider
connection.onSignatureHelp(
    (params: TextDocumentPositionParams): SignatureHelp | undefined => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return undefined;
        }

        const text = document.getText();
        const offset = document.offsetAt(params.position);
        
        // Find the function call we're in by looking backwards for an opening parenthesis
        // or command name without parenthesis (like PRINT AT, SPRITE, etc.)
        let start = offset - 1;
        let parenCount = 0;
        let foundOpenParen = false;
        
        // Look backwards to find the function/command start
        while (start >= 0) {
            const char = text[start];
            
            if (char === ')') {
                parenCount++;
            } else if (char === '(') {
                if (parenCount === 0) {
                    foundOpenParen = true;
                    break;
                }
                parenCount--;
            } else if (parenCount === 0 && /[\n\r:]/.test(char)) {
                // Hit a new line or statement separator
                break;
            }
            
            start--;
        }
        
        // Extract the function/command name
        let functionStart = start;
        if (foundOpenParen) {
            functionStart = start - 1;
        }
        
        // Skip whitespace before function name
        while (functionStart >= 0 && /\s/.test(text[functionStart])) {
            functionStart--;
        }
        
        // Find the start of the word
        let wordStart = functionStart;
        while (wordStart >= 0 && /[A-Za-z0-9_#]/.test(text[wordStart])) {
            wordStart--;
        }
        wordStart++;
        
        const functionName = text.substring(wordStart, functionStart + 1).toUpperCase();
        
        // Find matching function
        const func = FUNCTIONS.find(f => f.name === functionName);
        if (!func) {
            return undefined;
        }
        
        // Count which parameter we're on by counting commas
        let paramIndex = 0;
        let searchPos = foundOpenParen ? start + 1 : wordStart + functionName.length;
        let depth = 0;
        
        for (let i = searchPos; i < offset; i++) {
            const char = text[i];
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
            } else if (char === ',' && depth === 0) {
                paramIndex++;
            }
        }
        
        // Build parameter information
        const parameterInfos: ParameterInformation[] = func.parameters.map(p => ({
            label: p.label,
            documentation: p.documentation
        }));
        
        const signatureInfo: SignatureInformation = {
            label: func.signature,
            documentation: {
                kind: MarkupKind.Markdown,
                value: func.description
            },
            parameters: parameterInfos
        };
        
        return {
            signatures: [signatureInfo],
            activeSignature: 0,
            activeParameter: Math.min(paramIndex, func.parameters.length - 1)
        };
    }
);

// Document change handler for diagnostics
documents.onDidChangeContent(change => {
    validateDocument(change.document);
});

// Document opened handler
documents.onDidOpen(event => {
    validateDocument(event.document);
});

function validateDocument(document: TextDocument): void {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    
    // Count variable usage
    const dimPattern = /\bDIM\s+(#?)([A-Za-z_][A-Za-z0-9_]*(?:\s*\(\s*\d+\s*\))?(?:\s*,\s*(#?)([A-Za-z_][A-Za-z0-9_]*(?:\s*\(\s*\d+\s*\))?))*)/gi;
    
    let bit8Count = 0;
    let bit16Count = 0;
    const lines: { line: number, var8: number, var16: number }[] = [];
    
    let match;
    while ((match = dimPattern.exec(text)) !== null) {
        const lineNumber = document.positionAt(match.index).line;
        const dimStatement = match[0];
        
        // Parse the DIM statement for all variables
        const varPattern = /(#?)([A-Za-z_][A-Za-z0-9_]*(?:\s*\(\s*\d+\s*\))?)/g;
        let varMatch;
        let lineBit8 = 0;
        let lineBit16 = 0;
        
        while ((varMatch = varPattern.exec(dimStatement)) !== null) {
            if (varMatch[1] === '' && varMatch[0] !== 'DIM') {
                // 8-bit variable
                const arrayMatch = /\((\d+)\)/.exec(varMatch[2]);
                if (arrayMatch) {
                    lineBit8 += parseInt(arrayMatch[1]);
                } else {
                    lineBit8++;
                }
            } else if (varMatch[1] === '#') {
                // 16-bit variable
                const arrayMatch = /\((\d+)\)/.exec(varMatch[2]);
                if (arrayMatch) {
                    lineBit16 += parseInt(arrayMatch[1]);
                } else {
                    lineBit16++;
                }
            }
        }
        
        bit8Count += lineBit8;
        bit16Count += lineBit16;
        lines.push({ line: lineNumber, var8: lineBit8, var16: lineBit16 });
    }
    
    // Check limits
    const MAX_8BIT = 228;
    const MAX_16BIT = 110;
    
    if (bit8Count > MAX_8BIT) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 }
            },
            message: `Too many 8-bit variables: ${bit8Count}/${MAX_8BIT}. Reduce variable count.`,
            source: 'IntyBASIC'
        });
    } else if (bit8Count > MAX_8BIT * 0.8) {
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 }
            },
            message: `Approaching 8-bit variable limit: ${bit8Count}/${MAX_8BIT} (${Math.round(bit8Count/MAX_8BIT*100)}%)`,
            source: 'IntyBASIC'
        });
    }
    
    if (bit16Count > MAX_16BIT) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 }
            },
            message: `Too many 16-bit variables: ${bit16Count}/${MAX_16BIT}. Reduce variable count.`,
            source: 'IntyBASIC'
        });
    } else if (bit16Count > MAX_16BIT * 0.8) {
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 }
            },
            message: `Approaching 16-bit variable limit: ${bit16Count}/${MAX_16BIT} (${Math.round(bit16Count/MAX_16BIT*100)}%)`,
            source: 'IntyBASIC'
        });
    }
    
    connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Symbol extraction helpers
interface Symbol {
    name: string;
    type: 'variable' | 'procedure' | 'label' | 'constant';
    line: number;
    character: number;
    endCharacter: number;
}

function extractSymbols(document: TextDocument): Symbol[] {
    const symbols: Symbol[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const upperLine = line.toUpperCase();
        
        // Skip comments
        if (/^\s*('|REM\b)/i.test(line)) {
            continue;
        }
        
        // Find DIM declarations
        const dimMatch = /\bDIM\s+(#?)([A-Za-z_][A-Za-z0-9_]*)/gi;
        let match;
        while ((match = dimMatch.exec(line)) !== null) {
            symbols.push({
                name: match[2].toUpperCase(),
                type: 'variable',
                line: lineNum,
                character: match.index + match[0].indexOf(match[2]),
                endCharacter: match.index + match[0].indexOf(match[2]) + match[2].length
            });
        }
        
        // Find CONST declarations
        const constMatch = /\bCONST\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gi;
        while ((match = constMatch.exec(line)) !== null) {
            symbols.push({
                name: match[1].toUpperCase(),
                type: 'constant',
                line: lineNum,
                character: match.index + match[0].indexOf(match[1]),
                endCharacter: match.index + match[0].indexOf(match[1]) + match[1].length
            });
        }
        
        // Find PROCEDURE/SUB declarations (label: PROCEDURE or just label:)
        const procMatch = /^([A-Za-z_][A-Za-z0-9_]*):\s*(?:PROCEDURE|SUB)?\s*$/i;
        const procResult = procMatch.exec(line);
        if (procResult) {
            symbols.push({
                name: procResult[1].toUpperCase(),
                type: 'procedure',
                line: lineNum,
                character: 0,
                endCharacter: procResult[1].length
            });
        }
        
        // Find label definitions (standalone labels)
        const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*):\s*$/;
        const labelResult = labelMatch.exec(line);
        if (labelResult && !procResult) {
            symbols.push({
                name: labelResult[1].toUpperCase(),
                type: 'label',
                line: lineNum,
                character: 0,
                endCharacter: labelResult[1].length
            });
        }
    }
    
    return symbols;
}

function findSymbolAtPosition(document: TextDocument, line: number, character: number): string | undefined {
    const text = document.getText();
    const offset = document.offsetAt({ line, character });
    
    // Find word boundaries
    let start = offset;
    let end = offset;
    
    while (start > 0 && /[A-Za-z0-9_#.]/.test(text[start - 1])) {
        start--;
    }
    while (end < text.length && /[A-Za-z0-9_#.]/.test(text[end])) {
        end++;
    }
    
    const word = text.substring(start, end).toUpperCase();
    // Remove leading # if present
    return word.startsWith('#') ? word.substring(1) : word;
}

// Go to Definition provider
connection.onDefinition(
    (params: TextDocumentPositionParams): Definition | undefined => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return undefined;
        }
        
        const symbolName = findSymbolAtPosition(document, params.position.line, params.position.character);
        if (!symbolName) {
            return undefined;
        }
        
        const symbols = extractSymbols(document);
        const definition = symbols.find(s => s.name === symbolName);
        
        if (definition) {
            return Location.create(
                params.textDocument.uri,
                {
                    start: { line: definition.line, character: definition.character },
                    end: { line: definition.line, character: definition.endCharacter }
                }
            );
        }
        
        return undefined;
    }
);

// Find References provider
connection.onReferences(
    (params: ReferenceParams): Location[] => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            return [];
        }
        
        const symbolName = findSymbolAtPosition(document, params.position.line, params.position.character);
        if (!symbolName) {
            return [];
        }
        
        const locations: Location[] = [];
        const text = document.getText();
        const lines = text.split(/\r?\n/);
        
        // Find all occurrences of the symbol
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            const upperLine = line.toUpperCase();
            
            // Skip comments
            if (/^\s*('|REM\b)/i.test(line)) {
                continue;
            }
            
            // Find all word boundaries that match the symbol
            const wordPattern = new RegExp(`\\b${symbolName}\\b`, 'gi');
            let match;
            
            while ((match = wordPattern.exec(line)) !== null) {
                locations.push(
                    Location.create(
                        params.textDocument.uri,
                        {
                            start: { line: lineNum, character: match.index },
                            end: { line: lineNum, character: match.index + match[0].length }
                        }
                    )
                );
            }
        }
        
        return locations;
    }
);

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();
