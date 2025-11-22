# 🤖 IntyBasic Development Suite for VS Code



This extension provides comprehensive language support and integrated build tools for developing games and applications for the **Mattel Intellivision** using the **IntyBasic** dialect of BASIC.

## ✨ Features

* **Syntax Highlighting:** Accurate syntax coloration for all IntyBasic keywords, operators, control flow, built-in functions, and data types (including 16-bit variables like `#A` and binary/hex literals).
* **Integrated Build Chain:** Seamlessly compile your `.bas` files to `.asm` using the **IntyBasic cross-compiler** and assemble them into a runable `.bin` ROM file using **AS1600**.
* **Emulator Launch:** Directly launch and run your compiled ROM files in the **jzIntv emulator** from within VS Code.
* **Error Reporting:** Display build errors from the IntyBasic cross-compiler directly in the VS Code **Problems Panel**, linking errors back to the correct line in your source file.
* **IntelliSense:** Provides code snippets and auto-completion for common IntyBasic keywords.

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
| **Optional Flags** | Enable JLP/CC3 memory features and set program title. |

---

## ⌨️ Usage

The extension provides two primary commands accessible through the **Command Palette** (`Ctrl+Shift+P` or `Cmd+Shift+P`):

| Command | Description |
| :--- | :--- |
| **IntyBasic: Build ROM** | Runs the complete process: `intybasic` (transpile) then `as1600` (assemble), creating the final `.bin` file in your configured output directory. |
| **IntyBasic: Run ROM in Emulator** | Launches your compiled `.bin` file using the configured `jzintv` emulator. |
| **IntyBasic: Build and Run** | Combines the two above commands for quick iteration. |

### Build Output

Compiled `.asm` and `.bin` files are placed in the folder specified by the `intybasic.outputDirectory` setting (default is `bin/` relative to your source file).

---

## 🐞 Known Issues

* Error reporting currently relies on the task context to determine the filename, as the $\text{IntyBasic}$ compiler output omits the source filename.
* Compilation requires the **active file** in the editor to be the `.bas` source file you intend to build.

## 🤝 Contribution

This extension is community-driven. If you find any issues, have suggestions for improvements, or want to contribute code, please check out the GitHub repository (if applicable) or file an issue on the marketplace page.

---

*Enjoy developing for the Intellivision!*

---
What else do you need assistance with regarding your extension project?