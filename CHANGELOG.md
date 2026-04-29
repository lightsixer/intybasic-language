# Change Log

All notable changes to the "intybasic-language" extension will be documented in this file.

## [0.2.1] - 2026-04-29

### Fixed
- JLP savegame command line syntax in SDK mode now correctly uses `--jlp-savegame=filename.sav` format
- Both INTYRUN and INTYDBUG scripts now properly pass savegame filename

### Changed
- Updated README.md with comprehensive project file documentation and examples
- Clarified that active file requirement only applies when not using project files

## [0.2.0] - 2026-04-22

### Added
- **Project File Support**: Optional `intybasic.json` project files for multi-file project management
  - Specify main .BAS file to build regardless of active editor file
  - Custom ROM output naming via `projectName` field
  - Project-specific compiler settings that override workspace settings
  - Support for custom tool flags per project
- **Tool Flags System**: Add custom command-line flags to tools
  - `toolFlags` for standalone mode (compilerFlags, assemblerFlags, emulatorFlags)
  - `sdkToolFlags` for SDK mode (buildFlags, runFlags, debugFlags)
  - Enables advanced features like custom keyboard mappings, palette files, etc.
- **Intelligent Timestamp Checking**: Only rebuild when necessary
  - Checks ROM timestamp against ALL .bas files in workspace (supports INCLUDE'd files)
  - Checks ROM timestamp against project file modifications
  - Shows "up-to-date" message when no rebuild needed
- **Create Project File Command**: Interactive project file generation
  - Select main .BAS file from workspace
  - Optional custom project name
  - Generates complete configuration with all current settings
  - Includes empty tool flags sections for documentation
- **Create .gitignore Command**: Version control support
  - Generates/updates .gitignore with IntyBASIC build directories
  - Covers both standalone and SDK mode output folders (asm/, asm-debug/, bin/, debug/)
  - Checks for existing entries to avoid duplicates
- **Language Support**: Added missing keywords to autocomplete
  - BORDER command with parameter hints
  - SCROLL command with parameter hints
- **Documentation**: Comprehensive PROJECT_FILE_GUIDE.md with examples and best practices

### Changed
- Build/run/debug commands now check for project file first, fall back to active editor
- Project builds show "Building IntyBASIC ROM (project: ProjectName)..." messages
- All generated project files include both `toolFlags` and `sdkToolFlags` sections

### Fixed
- Project file timestamps now properly trigger rebuilds when modified
- SDK mode tool flags now correctly appended to script commands

## [0.1.6] - 2026-04-21

### Added
- COLOR keyword now appears in autocomplete suggestions for PRINT statements

### Fixed
- Keyword and function suggestions are now suppressed when typing in comments (after ' character)

## [0.1.5] - 2026-01-19

### Added
- New setting "Enable SDK Use BIN Format" to use BIN+CFG output format in SDK mode (requires updated SDK batch files)
- SDK mode now passes -b flag to INTYBUILD.BAT, INTYRUN.BAT, and INTYDBUG.BAT when enabled
- BIN+CFG format required for JLP support in SDK mode

### Changed
- Improved setting display names for better clarity

## [0.1.4] - 2026-01-19

### Fixed
- Settings changes (JLP, Intellivoice) now take effect immediately without requiring VS Code reload
- Configuration values are now read dynamically on each build/run command

## [0.1.3] - 2026-01-19

### Fixed
- JLP compiler flag (--jlp) now properly added during build in both SDK and standalone modes
- JLP emulator flag changed from incorrect --jlp to correct -J3 (JLP mode 3: accelerators + RAM + flash)
- JLP support now works correctly for both compilation and runtime

### Changed
- Updated npm dependencies to latest compatible versions

## [0.1.2] - 2025-11-24

### Added
- Separate "Enable JLP" setting for basic JLP support without savegame

### Changed
- JLP savegame setting now requires JLP to be enabled first
- Improved JLP flag logic to properly handle --jlp and --jlp-savegame independently

### Fixed
- JLP flags were being added unconditionally even when disabled in settings

## [0.1.1] - 2025-11-24

### Fixed
- Commands incorrectly treating Output channel as active editor, causing build failures on Linux
- Terminal windows accumulating instead of being reused for emulator and debugger
- Improved error messages to clarify users need to open or focus a .bas file

## [0.1.0] - 2025-11-23

### Added
- **IntyBASIC SDK Support**: Full integration with the IntyBASIC SDK for streamlined development
  - New dual-mode toolchain: Standalone (individual tools) or SDK (wrapper scripts)
  - SDK wrapper command support: INTYBUILD, INTYRUN, INTYDBUG, INTYNEW
  - "IntyBASIC: New SDK Project" command for scaffolding new projects
  - Automatic SDK project detection (Projects/, Examples/, Contributions/ folders)
  - Cross-platform support: Windows (.BAT scripts) and macOS (Perl scripts)
- Extension icon (icon.png)
- Comprehensive README documentation for both standalone and SDK modes
- macOS-specific setup instructions including Documents folder permissions

### Changed
- Configuration UI improvements: SDK settings prioritized with `order` property
- Enhanced setting descriptions with Markdown formatting
- Moved `vscode-languageclient` from devDependencies to dependencies for proper packaging

### Fixed
- OUTPUT_DIR initialization bug that caused "path must be of type string" error in standalone mode
- Extension activation failure on macOS due to missing vscode-languageclient module
- Cross-platform compatibility for SDK commands on macOS
- .vscodeignore to exclude unnecessary files from VSIX package

## [0.0.4] - 2025-11-23

### Added
- Full Language Server Protocol (LSP) implementation with IntelliSense support
- Code completion for 70+ IntyBASIC keywords, functions, and intrinsic variables
- Hover tooltips with comprehensive documentation and usage examples
- Signature help showing function parameters in real-time as you type
- Go to Definition (F12) for variables, constants, procedures, and labels
- Find All References (Shift+F12) to locate symbol usage throughout code
- Variable limits linter that tracks DIM statements and warns when approaching memory limits
  - 8-bit variables: 228 maximum (warns at 80%)
  - 16-bit variables: 110 maximum (warns at 80%)
- Support for arrays in variable tracking
- Case-insensitive symbol matching (IntyBASIC convention)
- Smart comment filtering in symbol extraction

## [0.0.3] - 2025-11-23

### Added
- JLP savegame support configuration (boolean on/off)
- Intellivoice support configuration
- Experimental Debug Adapter Protocol implementation (non-functional due to jzIntv limitations)
- Documentation for debugger modes and jzIntv debugger commands

### Changed
- Simplified JLP savegame from path configuration to boolean flag
- Savegame now always uses ROM name + `.sav` extension

## [Unreleased]

- Initial release