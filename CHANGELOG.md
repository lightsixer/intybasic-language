# Change Log

All notable changes to the "intybasic-language" extension will be documented in this file.

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