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
    MarkupKind
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
            hoverProvider: true
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

// IntyBASIC keyword database
const KEYWORDS = [
    'REM', 'DIM', 'DEF', 'FN', 'DATA', 'READ', 'RESTORE',
    'IF', 'THEN', 'ELSE', 'ELSEIF', 'END', 'SELECT', 'CASE', 'EXIT',
    'FOR', 'TO', 'STEP', 'NEXT', 'WHILE', 'WEND', 'DO', 'LOOP', 'UNTIL', 'REPEAT',
    'GOTO', 'GOSUB', 'RETURN', 'ON', 'FRAME',
    'PROCEDURE', 'SUB',
    'PRINT', 'AT', 'INPUT',
    'POKE', 'PEEK', 'USR',
    'WAIT', 'CLS', 'SCREEN', 'DEFINE', 'MODE',
    'SPRITE', 'BITMAP', 'NORMAL', 'INVERSE', 'MIRROR_X',
    'SOUND', 'MUSIC', 'PLAY', 'SIMPLE', 'REPEAT', 'STOP', 'JUMP', 'SPEED', 'OFF', 'MIX', 'TYPE', 'NOISE', 'VOL', 'VALUE', 'FAST',
    'VOICE', 'ENABLE', 'DISABLE',
    'INCLUDE', 'ASM', 'CALL', 'STACK_CHECK',
    'CONST', 'VARPTR',
    'SEGMENT', 'BANK', 'MAP',
    'AND', 'OR', 'XOR', 'NOT'
];

const FUNCTIONS = [
    { name: 'ABS', signature: 'ABS(value)', description: 'Returns the absolute value of a number.' },
    { name: 'SGN', signature: 'SGN(value)', description: 'Returns the sign of a number: -1 for negative, 0 for zero, 1 for positive.' },
    { name: 'RAND', signature: 'RAND(max)', description: 'Returns a random number between 0 and max-1.' },
    { name: 'RANDOM', signature: 'RANDOM(seed)', description: 'Seeds the random number generator with the given value.' },
    { name: 'SQR', signature: 'SQR(value)', description: 'Returns the square root of a number.' },
    { name: 'LEN', signature: 'LEN(string)', description: 'Returns the length of a string.' },
    { name: 'POS', signature: 'POS(string1, string2)', description: 'Returns the position of string2 within string1, or 0 if not found.' },
    { name: 'PEEK', signature: 'PEEK(address)', description: 'Reads a value from a memory address.' },
    { name: 'USR', signature: 'USR(address, args...)', description: 'Calls an assembly language routine at the specified address.' },
    { name: 'FRAME', signature: 'FRAME', description: 'Returns the current frame number (increments at 60Hz).' },
    { name: 'NTSC', signature: 'NTSC', description: 'Returns 1 if running on NTSC system, 0 if PAL.' },
    { name: '#MOBSHADOW', signature: '#MOBSHADOW', description: 'Returns the address of the MOB shadow table.' },
    { name: '#BACKTAB', signature: '#BACKTAB', description: 'Returns the address of the BACKTAB (screen memory).' }
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
                label: keyword,
                kind: CompletionItemKind.Keyword,
                data: { type: 'keyword', name: keyword }
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
        if (KEYWORDS.includes(word)) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: `**${word}** (keyword)`
                }
            };
        }
        
        return undefined;
    }
);

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();
