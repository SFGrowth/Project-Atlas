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

## [0.10.0] - 2026-07-10

### Added

- All 10 Pine Script core modules (M-00 through M-09) compiled and saved in TradingView Pine Editor.
  - M-00: Atlas Configuration (atlas_config.pine) — system-wide constants and configuration table
  - M-01: Atlas Utilities (atlas_utils.pine) — shared utility functions (EMA, ATR, session detection, FIFO queues)
  - M-02: Atlas State Manager (atlas_state_manager.pine) — persistent state machine for session, risk, and trade tracking
  - M-03: Atlas Market State Engine (atlas_market_state_engine.pine) — MarketState UDT builder with EMA, ATR, ADX, volume, overnight analysis
  - M-04: Atlas Model A1 (atlas_model_a1.pine) — AM Session Trend Continuation model
  - M-05: Atlas Model A3 (atlas_model_a3.pine) — Overnight Range Breakout model
  - M-06: Atlas Model B1 (atlas_model_b1.pine) — MVC-003 Apex Combination model
  - M-07: Atlas Decision Engine (atlas_decision_engine.pine) — multi-model candidate evaluation and winner selection
  - M-08: Atlas Risk Intelligence (atlas_risk_intelligence.pine) — position sizing, risk multipliers, capital allocation
  - M-09: Atlas TVL (atlas_tvl.pine) — Trade Verification Layer with 18-rule safety barrier

### Fixed (Pine Script v5 Compatibility)

- `math.mod` replaced with `%` operator (not available in Pine Script v5)
- Unused function parameters resolved by adding no-op expressions to satisfy compiler
- `library()` declaration converted to `indicator()` for stateful modules (Pine Script libraries cannot modify global `var` variables in exported functions)
- `ta.adx()` replaced with `ta.dmi()` destructuring syntax
- Multi-line ternary expressions and `.new()` constructor calls joined to single lines
- Nested function definitions moved to global scope
- `TradeProposal.new()` named arguments converted to positional arguments

### Notes

Sprint 072 objective: compile and verify all foundation modules before building M-10 Execution Engine.
All modules verified running on ATLAS chart (MNQ1! 5m, chart ID: cDPu6HGG).

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
