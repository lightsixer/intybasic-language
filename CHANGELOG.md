# Change Log

All notable changes to the "intybasic-language" extension will be documented in this file.

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