# 🤖 IntyBasic Development Suite for VS Code



This extension provides comprehensive language support and integrated build tools for developing games and applications for the **Mattel Intellivision** using the **IntyBasic** dialect of BASIC.

## ✨ Features

* **Syntax Highlighting:** Accurate syntax coloration for all IntyBasic keywords, operators, control flow, built-in functions, and data types (including 16-bit variables like `#A` and binary/hex literals).
* **IntelliSense & Code Completion:** Full language server support with:
  * Code completion for all 70+ IntyBASIC keywords, functions, and intrinsic variables
  * Hover tooltips with comprehensive documentation and examples
  * Signature help showing function parameters as you type
  * Go to Definition (F12) for variables, constants, procedures, and labels
  * Find All References (Shift+F12) to locate symbol usage throughout your code
  * Variable limits linter warns when approaching memory limits (228 8-bit / 110 16-bit variables)
* **Integrated Build Chain:** Seamlessly compile your `.bas` files to `.asm` using the **IntyBasic cross-compiler** and assemble them into a runable `.bin` ROM file using **AS1600**.
* **Emulator Launch:** Directly launch and run your compiled ROM files in the **jzIntv emulator** from within VS Code.
* **Debug Support:** Build with source maps and symbol files, then launch jzIntv's debugger with your IntyBASIC source code visible alongside the disassembly.
* **JLP & Intellivoice:** Optional JLP savegame support (uses ROM name + `.sav` for FLASH persistence) and optional Intellivoice configuration.
* **Error Reporting:** Display build errors from the IntyBasic cross-compiler directly in the VS Code **Problems Panel**, linking errors back to the correct line in your source file.
* **Clean Command:** Remove all build artifacts (both regular and debug) with a single command.
* **Cross-Platform:** Works on Windows, macOS, and Linux.

---

## 🚀 Getting Started

### Choosing Your Toolchain Mode

The extension supports two toolchain modes:

1. **Standalone Mode** (default): You configure individual tool paths and manage your own IntyBASIC installation
2. **SDK Mode**: Uses the IntyBASIC SDK wrapper scripts that bundle all tools together

Choose the mode that matches your setup in Settings > IntyBASIC > Toolchain Mode.

---

### Option A: Standalone Mode Setup

This is the traditional approach where you configure each tool individually.

#### 1. Prerequisites

You must have the following external command-line tools installed and accessible on your system:

* **IntyBasic Cross-Compiler** (The `intybasic` executable)
* **AS1600 Assembler** (The `as1600` executable, often included with jzIntv tools)
* **jzIntv Emulator** (The `jzintv` executable)
* The **IntyBasic library files** (`intybasic_prologue.asm`, etc.)
* The **jzIntv ROM files** (`exec.bin` and `grom.bin`)

#### 2. Extension Configuration

After installing the extension, you must configure the paths to your tools.

1.  Go to **Settings** (`Ctrl+,` or `Cmd+,`).
2.  Search for **`IntyBasic`**.
3.  Set **Toolchain Mode** to `standalone` (this is the default).
4.  Configure the following paths and settings:

| Setting | Description |
| :--- | :--- |
| `intybasic.compilerPath` | Absolute path to the `intybasic` executable. |
| `intybasic.assemblerPath` | Absolute path to the `as1600` executable. |
| `intybasic.emulatorPath` | Absolute path to the `jzintv` executable. |
| `intybasic.libraryPath` | Path to the directory containing `intybasic_prologue.asm`, etc. |
| `intybasic.execRomPath` | Path to the `exec.bin` ROM image (used by `jzintv -e`). |
| `intybasic.gromRomPath` | Path to the `grom.bin` ROM image (used by `jzintv -g`). |
| `intybasic.intysmapPath` | (Optional) Path to the `intysmap` utility for debug builds. May not be needed with newer AS1600 versions. |
| `intybasic.enableIntellivoice` | (Optional) Enable Intellivoice support when running emulator. Default: false. |
| `intybasic.enableJlpSavegame` | (Optional) Enable JLP savegame support for FLASH persistence. Savegame uses ROM name + `.sav`. Default: false. |

---

### Option B: SDK Mode Setup

The IntyBASIC SDK is a community-maintained bundle that includes wrapper scripts for easy project management.

#### 1. Install the IntyBASIC SDK

Download and install the IntyBASIC SDK from the official source. The SDK includes:
- IntyBASIC compiler, AS1600 assembler, jzIntv emulator
- Wrapper scripts (INTYBUILD, INTYRUN, INTYDBUG, INTYNEW)
- Project management structure (Projects/, Examples/, Contributions/)
- All required ROM and library files

#### 2. Extension Configuration

1.  Go to **Settings** (`Ctrl+,` or `Cmd+,`).
2.  Search for **`IntyBasic`**.
3.  Set **Toolchain Mode** to `sdk`.
4.  Set **SDK Path** to your SDK installation directory (e.g., `C:\Tools\IntyBASIC SDK` on Windows).

#### 3. Important: Restart VS Code

After installing the SDK, **restart VS Code** so it can inherit the environment variables set by the SDK installer (particularly `PATH` and `INTYBASIC_INSTALL`).

#### 4. macOS: Grant Documents Folder Access

**macOS users only:** If the SDK is installed in your Documents folder (the default location), macOS will prompt you to grant VS Code access when you first run an SDK command. You must approve this prompt for SDK commands to work.

If you accidentally dismissed the prompt or need to change permissions later:
1. Go to **System Settings > Privacy & Security > Files and Folders**
2. Find **Visual Studio Code** in the list
3. Enable **Documents Folder** access

Alternatively, you can avoid this issue by installing the SDK to a less protected location like `/Applications/IntyBASIC-SDK` or `~/IntyBASIC-SDK` (in your home directory root), then update the SDK Path setting accordingly.

#### 4. macOS: Grant Documents Folder Access

**macOS users only:** If the SDK is installed in your Documents folder (the default location), macOS will prompt you to grant VS Code access when you first run an SDK command. You must approve this prompt for SDK commands to work.

If you accidentally dismissed the prompt or need to change permissions later:
1. Go to **System Settings > Privacy & Security > Files and Folders**
2. Find **Visual Studio Code** in the list
3. Enable **Documents Folder** access

Alternatively, you can avoid this issue by installing the SDK to a less protected location like `/Applications/IntyBASIC-SDK` or `~/IntyBASIC-SDK` (in your home directory root), then update the SDK Path setting accordingly.

#### 5. SDK Project Structure

The SDK expects projects in specific folders:
- `Projects/` - Your custom projects
- `Examples/` - SDK example projects
- `Contributions/` - Community contributed projects

Each project has its own folder with the `.bas` source file and build outputs go to `asm/` and `bin/` subdirectories.

#### 6. Creating New SDK Projects

Use the **IntyBASIC: New SDK Project** command to scaffold a new project with:
- Main `.bas` file with boilerplate code
- Optional title screen template (`title.bas`)
- Proper folder structure
- SDK-compatible project organization

The new project will be created in the SDK's `Projects/` folder and automatically opened.

---

## ⌨️ Usage

The extension provides several commands accessible through the **Command Palette** (`Ctrl+Shift+P` or `Cmd+Shift+P`):

### Standard Build & Run Commands

| Command | Description |
| :--- | :--- |
| **IntyBASIC: Build ROM (Compile & Assemble)** | Compiles your `.bas` file to `.asm`, then assembles to `.bin`. Output goes to `asm/` and `bin/` folders. |
| **IntyBASIC: Run ROM in Emulator** | Launches your compiled `.bin` file in jzIntv. Prompts to build if ROM is missing or outdated. |
| **IntyBASIC: Build and Run ROM** | Combines build and run for quick iteration. |
| **IntyBASIC: Clean Build Artifacts** | Removes all generated files (`.asm`, `.bin`, `.sym`, `.smap`, etc.) from both regular and debug folders. |

### Debug Commands

| Command | Description |
| :--- | :--- |
| **IntyBASIC: Debug Build ROM (with source maps)** | Builds with source maps (`.smap`) and symbol files (`.sym`) for debugging. Output goes to `asm-debug/` and `debug/` folders. |
| **IntyBASIC: Run ROM in Debugger** | Launches jzIntv with debugger mode (`-d`) and source map integration. Shows your BASIC source alongside assembly in the debugger. |
| **IntyBASIC: Debug Build and Run in Debugger** | Combines debug build and debugger launch. |

### SDK-Specific Commands

These commands are only available when **Toolchain Mode** is set to `sdk`:

| Command | Description |
| :--- | :--- |
| **IntyBASIC: New SDK Project** | Creates a new project in the SDK's `Projects/` folder with scaffolded code and opens the project folder. |

### Build Output

* **Standalone mode**: Compiled files go to `asm/` (assembly) and `bin/` (ROM) folders relative to your source file.
* **SDK mode**: Build outputs follow the same structure but are managed by the SDK wrapper scripts.
* **Debug builds**: Compiled files go to `asm-debug/` (assembly) and `debug/` (ROM + debug symbols) folders.

### Using the Debugger

When you run a debug build and launch the debugger, jzIntv opens in a terminal with its interactive debugger. You can:
- See your IntyBASIC source code alongside the disassembly
- Set breakpoints
- Step through code
- Inspect memory and registers
- Use all standard jzIntv debugger commands

**Useful Debugger Commands:**
- `s` or `s <n>` - Step through `n` instructions (default: 1). Shows disassembly and register state.
- `r` or `r <n>` - Run `n` cycles silently (default: forever). Use F4/BREAK to stop.
- `t` - Trace over JSR calls (step-over functions).
- `b <addr>` - Set breakpoint at address. Use symbol names from your code!
- `n <addr>` - Remove breakpoint at address.
- `u <addr> <n>` - Disassemble `n` instructions at address.
- `m <addr> <n>` - Show `n` memory locations at address.
- `w <addr1> <addr2>` - Toggle write watch on address range.
- `@ <addr1> <addr2>` - Toggle read watch on address range.
- `v <addr> <n>` - Show source code around address (when source maps loaded).
- `h` - Toggle history logging (use `d` to dump history to `dump.hst`).
- `?` - Show help.
- `q` - Quit debugger.

Press `ENTER` alone to repeat the last step/trace command.

Type `?` in the debugger for help on available commands.

---

## 💡 IntelliSense Features

The extension includes a full-featured language server that provides intelligent code assistance:

### Code Completion

As you type, the extension suggests:
- **Keywords**: All IntyBASIC control flow, graphics, sound, and system keywords
- **Functions**: Built-in functions like `ABS()`, `RAND()`, `PEEK()`, `SPRITE()`, etc.
- **Variables**: Intrinsic variables like `CONT`, `COL0-7`, `MUSIC.PLAYING`, `VOICE.AVAILABLE`

### Hover Documentation

Hover over any keyword, function, or variable to see:
- Detailed description of what it does
- Usage examples
- Parameter information
- Syntax patterns

### Signature Help

When typing function calls, see real-time parameter hints:
- Which parameter you're currently editing
- Documentation for each parameter
- Full function signature

Example: Type `SPRITE(` and see hints for `n, x, y, card` parameters.

### Navigation

- **Go to Definition (F12)**: Jump to where a variable, constant, procedure, or label is declared
- **Find All References (Shift+F12)**: See all places where a symbol is used
- **Peek Definition (Alt+F12)**: View definition inline without leaving your current location

### Variable Limits Linter

The extension tracks your variable usage and warns you when approaching IntyBASIC's memory limits:
- **8-bit variables**: 228 maximum (warning at 80%)
- **16-bit variables**: 110 maximum (warning at 80%)
- Counts both single variables and arrays from `DIM` statements
- Real-time diagnostics as you type

---

## 🐞 Known Issues

* Compilation requires the **active file** in the editor to be the `.bas` source file you intend to build.
* Debug integration with jzIntv is terminal-based; there is no integrated graphical debugger UI within VS Code.

## 🤝 Contribution

This extension is community-driven. If you find any issues, have suggestions for improvements, or want to contribute code, please check out the GitHub repository (if applicable) or file an issue on the marketplace page.

---

*Enjoy developing for the Intellivision!*

