# Changelog

All notable changes to Project Atlas will be documented in this file.

The format is based on clear version history rather than informal memory. Every production-relevant change should be recorded here.

## [Unreleased]

### Added

- Permanent Atlas foundation documentation:
  - `ATLAS.md`
  - `ENGINEERING.md`
  - `ROADMAP.md`
  - `CHANGELOG.md`
  - `CODING_STANDARDS.md`
- Project mission clarified: Atlas exists to maximise the probability of passing and scaling prop firm evaluations while preserving capital.
- Project identity clarified: Atlas assesses; it does not predict.
- Feature admission questions documented.
- Engineering requirements documented.
- Roadmap phases documented.
- Coding standards documented.

### Changed

- Atlas is now explicitly governed as a professional software project rather than a generic TradingView indicator.
- Repository principle clarified: the GitHub repository is the source of truth.

### Security

- Execution boundary clarified: Atlas begins as observer-only and should not connect to live execution before validation.

## [0.0.0] - 2026-07-04

### Added

- GitHub repository created.
- Visual Studio Code configured.
- `atlas-observer` folder created.
- First Pine source file created.
- Development workflow established.
- Project Atlas created in ChatGPT.
- Origin and Constitution document created.

### Notes

This version represents Sprint 0: the birth and constitutional foundation of Project Atlas.

## Versioning Notes

Atlas should use semantic versioning where practical:

```text
MAJOR.MINOR.PATCH
```

Suggested interpretation:

- `MAJOR`: architectural or production-breaking changes
- `MINOR`: new validated modules or capabilities
- `PATCH`: fixes, clarifications, small improvements

Pine Script modules may have their own version numbers, but production-relevant changes should still be reflected here.
