# IntyBASIC Project File Support

The IntyBASIC extension now supports optional project files to manage multi-file projects.

## Overview

When working with multiple `.BAS` files in your workspace, you can create an `intybasic.json` project file at your workspace root. This file identifies the main source file that should be built, regardless of which file is currently open in the editor.

## Benefits

- **Multi-file organization**: Keep related `.BAS` files in the same workspace without accidentally building the wrong one
- **Consistent builds**: Build/run/debug commands always target the project's main file
- **Custom ROM naming**: Override the default ROM filename
- **Project-specific settings**: Override compiler settings per-project

## Creating a Project File

### Using the Command Palette

1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run command: **IntyBASIC: Create Project File**
3. Select your main `.BAS` file from the list
4. Optionally enter a custom project name
5. The `intybasic.json` file will be created and opened for review

### Manual Creation

Create a file named `intybasic.json` in your workspace root:

```json
{
  "mainFile": "src/main.bas",
  "projectName": "MyGame",
  "compilerSettings": {
    "enableJLP": true,
    "enableIntellivoice": false,
    "enableJLPSavegame": true,
    "enableSDKUseBINFormat": false
  },
  "toolFlags": {
    "compilerFlags": "--warnings",
    "assemblerFlags": "",
    "emulatorFlags": "--kbdhackfile=mykeys.cfg"
  },
  "sdkToolFlags": {
    "buildFlags": "",
    "runFlags": "",
    "debugFlags": "-s"
  }
}
```

## Configuration Fields

### Required Fields

- **`mainFile`** (string): Relative path from workspace root to your main `.BAS` file
  - Use forward slashes (`/`) for path separators
  - Example: `"src/main.bas"` or `"game.bas"`

### Optional Fields

- **`projectName`** (string): Custom name for the output ROM
  - If omitted, uses the basename of `mainFile` (e.g., `main.bas` → `main.bin`)
  - Example: `"MyAwesomeGame"`

- **`compilerSettings`** (object): Override workspace-level compiler settings
  - **`enableJLP`** (boolean): Enable JLP (Joe Zbiciak's Learning Platform) support
  - **`enableIntellivoice`** (boolean): Enable Intellivoice support
  - **`enableJLPSavegame`** (boolean): Enable JLP savegame/flash persistence
  - **`enableSDKUseBINFormat`** (boolean): Use BIN+CFG format instead of ROM format (SDK mode)
  - Project settings override workspace settings when specified
  - Omitted settings fall back to workspace configuration

- **`toolFlags`** (object): Additional command-line flags for build/run tools (standalone mode)
  - **`compilerFlags`** (string): Extra flags passed to IntyBASIC compiler
    - Example: `"--warnings"` to enable compiler warnings
    - Inserted after standard flags but before source/output files
  - **`assemblerFlags`** (string): Extra flags passed to AS1600 assembler
    - Example: `"-w"` to suppress warnings
    - Inserted after standard flags but before source file
  - **`emulatorFlags`** (string): Extra flags passed to JzIntv emulator
    - Example: `"--kbdhackfile=mykeys.cfg"` for custom keyboard mapping
    - Example: `"--fullscreen"` to run in fullscreen mode
    - Inserted after standard flags but before ROM path
  - All flags are optional - omit entirely or leave as empty strings
  - **Note:** These flags apply to standalone mode only (when individual tool paths are configured)

- **`sdkToolFlags`** (object): Additional command-line flags for SDK scripts (SDK mode only)
  - **`buildFlags`** (string): Extra flags passed to INTYBUILD.BAT/intybuild script
    - Example: `""` (most build options are controlled by compiler settings)
    - Appended after auto-generated flags (`-x`, `-j`, `-b`)
  - **`runFlags`** (string): Extra flags passed to INTYRUN.BAT/intyrun script
    - These are passed through to JzIntv emulator
    - Example: `"--fullscreen"` to run in fullscreen mode
    - Appended after auto-generated flags
  - **`debugFlags`** (string): Extra flags passed to INTYDBUG.BAT/intydbug script
    - These are passed through to JzIntv debugger
    - Example: `"-s"` to halt execution and wait for debugger commands
    - Appended after auto-generated flags
  - All flags are optional - omit entirely or leave as empty strings
  - **Note:** These flags apply to SDK mode only (when SDK path is configured and toolchain mode is set to 'sdk')
  - SDK scripts wrap compiler+assembler (INTYBUILD) or emulator (INTYRUN/INTYDBUG), so flag structure differs from standalone mode

## How It Works

### With Project File

When `intybasic.json` exists at workspace root:
- All build/run/debug commands target the `mainFile` specified in the project
- The currently open/active file in the editor is ignored
- Build messages show: `"Building IntyBASIC ROM (project: MyGame)..."`
- Output files use the `projectName` if specified

### Without Project File (Legacy Behavior)

When no `intybasic.json` exists:
- Commands use the currently active file in the editor (original behavior)
- Build messages show: `"Building IntyBASIC ROM (filename.bas)..."`
- Fully backward compatible with existing workflows

## Example Workflow

### Scenario: Multi-file Game Project

```
my-game/
├── intybasic.json
├── main.bas              ← Main file that includes others
├── player.bas            ← Player logic
├── enemies.bas           ← Enemy logic
└── levels.bas            ← Level data
```

**intybasic.json:**
```json
{
  "mainFile": "main.bas",
  "projectName": "SpaceAdventure",
  "compilerSettings": {
    "enableJLP": true,
    "enableJLPSavegame": true
  }
}
```

**main.bas:**
```basic
REM Main game file
INCLUDE "player.bas"
INCLUDE "enemies.bas"
INCLUDE "levels.bas"

' Your main game code here...
```

Now you can:
- Open and edit `enemies.bas`
- Run **IntyBASIC: Build ROM** from Command Palette
- The extension builds `main.bas` (not `enemies.bas`)
- Output ROM is named `SpaceAdventure.bin`
- JLP features are enabled for this project

### Scenario: Using Custom Tool Flags

You can pass additional flags to the compiler, assembler, or emulator for advanced features:

**Example 1: Enable compiler warnings**
```json
{
  "mainFile": "game.bas",
  "toolFlags": {
    "compilerFlags": "--warnings"
  }
}
```

**Example 2: Custom keyboard mapping for emulator**
```json
{
  "mainFile": "game.bas",
  "toolFlags": {
    "emulatorFlags": "--kbdhackfile=custom_keys.cfg"
  }
}
```

**Example 3: Fullscreen emulator with rate control**
```json
{
  "mainFile": "game.bas",
  "toolFlags": {
    "emulatorFlags": "--fullscreen --ratecontrol"
  }
}
```

**Example 4: Multiple flags per tool**
```json
{
  "mainFile": "game.bas",
  "toolFlags": {
    "compilerFlags": "--warnings --opt-mul",
    "emulatorFlags": "--voice=snd_samples --fullscreen"
  }
}
```

### Scenario: Using SDK Mode Flags

If you're using SDK mode (IntyBASIC SDK with INTYBUILD.BAT/INTYRUN.BAT/INTYDBUG.BAT scripts), use `sdkToolFlags` instead:

**Example 1: Halt debugger at start (wait for commands)**
```json
{
  "mainFile": "game.bas",
  "sdkToolFlags": {
    "debugFlags": "-s"
  }
}
```

**Example 2: Custom emulator flags via run script**
```json
{
  "mainFile": "game.bas",
  "sdkToolFlags": {
    "runFlags": "--fullscreen --kbdhackfile=custom_keys.cfg"
  }
}
```

**Example 3: Combined SDK flags**
```json
{
  "mainFile": "game.bas",
  "compilerSettings": {
    "enableJLP": true
  },
  "sdkToolFlags": {
    "runFlags": "--fullscreen",
    "debugFlags": "-s --kbdhackfile=debug_keys.cfg"
  }
}
```

**Note:** The exact flags available depend on your IntyBASIC, AS1600, and JzIntv versions. Consult the respective tool documentation for all available options.

## Commands

All existing build/run/debug commands work with project files:

- **IntyBASIC: Build ROM** - Builds the project's main file
- **IntyBASIC: Run ROM in Emulator** - Runs the project's ROM
- **IntyBASIC: Build and Run ROM** - Builds and runs the project
- **IntyBASIC: Clean Build Artifacts** - Cleans project artifacts
- **IntyBASIC: Debug Build ROM** - Debug builds the project
- **IntyBASIC: Run ROM in Debugger** - Debugs the project
- **IntyBASIC: Debug Build and Run** - Debug builds and runs the project

Plus the new commands:
- **IntyBASIC: Create Project File** - Creates `intybasic.json` interactively
- **IntyBASIC: Create .gitignore** - Creates or updates `.gitignore` with IntyBASIC build directories

## Tips

1. **Path format**: Always use forward slashes in `mainFile` path, even on Windows
2. **Workspace root**: The project file must be at the workspace root (not in subdirectories)
3. **One project per workspace**: Only one `intybasic.json` is supported per workspace
4. **Settings override**: Project `compilerSettings` override workspace settings only when explicitly specified
5. **Overwrite protection**: The Create Project File command warns before overwriting existing `intybasic.json`
6. **Standalone vs SDK flags**: Use `toolFlags` for standalone mode (individual tool paths), `sdkToolFlags` for SDK mode (INTYBUILD/INTYRUN/INTYDBUG scripts)
7. **SDK flag structure**: SDK mode wraps compiler+assembler in INTYBUILD, so there's no separate `compilerFlags`/`assemblerFlags` - use `buildFlags` instead
8. **Flag placement**: Tool flags are inserted after built-in flags but before file arguments, ensuring proper command structure
9. **Multiple flags**: Space-separate multiple flags in a single string: `"--flag1 --flag2"`
10. **Version control**: Use the Create .gitignore command to automatically ignore build directories (`asm/`, `bin/`, `debug/`, etc.)

## Migration

If you have an existing single-file workflow, no changes are needed:
- The extension works exactly as before without a project file
- You can add a project file later if your project grows

If you want to adopt project files:
1. Organize your `.BAS` files as desired
2. Run **IntyBASIC: Create Project File**
3. Select your main file
4. Continue using all commands as normal

## Troubleshooting

**Build targets wrong file:**
- Check that `intybasic.json` exists at workspace root
- Verify `mainFile` path is correct and relative to workspace root
- Ensure the main file exists at the specified path

**Custom ROM name not working:**
- Check `projectName` field in `intybasic.json`
- Verify the project file is valid JSON

**Settings not being applied:**
- Check that `compilerSettings` object is properly formatted
- Remember: omitted settings use workspace defaults
- Project settings only override when explicitly set

**"Main file not found" error:**
- Verify the `mainFile` path is correct
- Check that path uses forward slashes
- Ensure the file exists in your workspace

**Tool flags not working:**
- Check the Output panel for the actual command being executed
- Verify flags are supported by your tool versions
- Ensure flags are properly quoted if they contain spaces
- Test flags manually with the tools first to confirm syntax
- Check that flags don't conflict with built-in flags
