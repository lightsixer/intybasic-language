# 🤖 IntyBasic Development Suite for VS Code



This extension provides comprehensive language support and integrated build tools for developing games and applications for the **Mattel Intellivision** using the **IntyBasic** dialect of BASIC.

## ✨ Features

* **Syntax Highlighting:** Accurate syntax coloration for all IntyBasic keywords, operators, control flow, built-in functions, and data types (including 16-bit variables like `#A` and binary/hex literals).
* **Integrated Build Chain:** Seamlessly compile your `.bas` files to `.asm` using the **IntyBasic cross-compiler** and assemble them into a runable `.bin` ROM file using **AS1600**.
* **Emulator Launch:** Directly launch and run your compiled ROM files in the **jzIntv emulator** from within VS Code.
* **Debug Support:** Build with source maps and symbol files, then launch jzIntv's debugger with your IntyBASIC source code visible alongside the disassembly.
* **JLP & Intellivoice:** Optional JLP savegame support (uses ROM name + `.sav` for FLASH persistence) and optional Intellivoice configuration.
* **Error Reporting:** Display build errors from the IntyBasic cross-compiler directly in the VS Code **Problems Panel**, linking errors back to the correct line in your source file.
* **Clean Command:** Remove all build artifacts (both regular and debug) with a single command.
* **Cross-Platform:** Works on Windows, macOS, and Linux.

---

## 🚀 Getting Started

### 1. Prerequisites

You must have the following external command-line tools installed and accessible on your system:

* **IntyBasic Cross-Compiler** (The `intybasic` executable)
* **AS1600 Assembler** (The `as1600` executable, often included with jzIntv tools)
* **jzIntv Emulator** (The `jzintv` executable)
* The **IntyBasic library files** (`intybasic_prologue.asm`, etc.)
* The **jzIntv ROM files** (`exec.bin` and `grom.bin`)

### 2. Extension Configuration

After installing the extension, you must configure the paths to your tools.

1.  Go to **Settings** (`Ctrl+,` or `Cmd+,`).
2.  Search for **`IntyBasic`**.
3.  Configure the following paths and settings:

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

### Build Output

* **Regular builds**: Compiled files go to `asm/` (assembly) and `bin/` (ROM) folders relative to your source file.
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

## 🐞 Known Issues

* Compilation requires the **active file** in the editor to be the `.bas` source file you intend to build.
* Debug integration with jzIntv is terminal-based; there is no integrated graphical debugger UI within VS Code.

## 🤝 Contribution

This extension is community-driven. If you find any issues, have suggestions for improvements, or want to contribute code, please check out the GitHub repository (if applicable) or file an issue on the marketplace page.

---

*Enjoy developing for the Intellivision!*

---
What else do you need assistance with regarding your extension project?