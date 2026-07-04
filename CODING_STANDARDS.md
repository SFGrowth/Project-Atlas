# Atlas Coding Standards

## Purpose

This document defines coding standards for Project Atlas.

The goal is not merely to make code work. The goal is to make code understandable, testable, maintainable, and safe enough to support prop firm evaluation and scaling decisions.

## Core Coding Principles

Atlas code should be:

- Clear
- Modular
- Testable
- Documented
- Versioned
- Conservative
- Easy to review
- Easy to disable or roll back

Atlas code should not be:

- Clever for its own sake
- Visually cluttered
- Over-optimised
- Dependent on hidden assumptions
- Difficult to validate
- Capable of unintended execution

## General Standards

### 1. Clarity First

Prefer readable code over compact code.

A future version of Phil or Orion should be able to understand the code quickly.

### 2. Small Modules

Each module should have one main responsibility.

Avoid combining observation, signal generation, risk management, and execution in one uncontrolled script.

### 3. Explicit Names

Use descriptive names.

Good examples:

```text
trendScore
volatilityState
riskMode
sessionOk
bullishRiskOn
```

Poor examples:

```text
ts
x1
flag
condA
magicFilter
```

### 4. No Magic Logic

Important thresholds should be named inputs or constants.

Logic should be explainable and testable.

### 5. Conservative Defaults

Defaults should favour capital preservation.

If a setting is uncertain, the safer default should usually be:

```text
stand_down
caution
execution disabled
lower frequency
manual review required
```

## Pine Script Standards

### Required Header

Every Pine Script file should include a header like this:

```pinescript
//@version=6
indicator("Atlas Observer v0.1", shorttitle="Atlas Observer", overlay=true)

// =============================================================================
// Project Atlas
// Module: Atlas Observer
// Version: 0.1.0
// Mode: Observer only
//
// Purpose:
// Assess MNQ futures market state. This script does not place trades.
// =============================================================================
```

### File Naming

Use clear versioned names:

```text
Atlas_Observer_v0_1.pine
Atlas_Structure_Engine_v0_1.pine
Atlas_Guardian_v0_1.pine
```

Avoid vague names:

```text
indicator.pine
new_script.pine
final_final.pine
mnq_system_test.pine
```

### Section Layout

Pine files should follow this general order:

```text
Header
Inputs
Constants
Core calculations
State classification
Scoring
Risk logic
Visuals
Dashboard / table
Alert conditions
Dynamic alert payloads
Debug tools
```

### Inputs

Inputs should be grouped by purpose:

```pinescript
groupTrend = "Trend"
fastEmaLength = input.int(21, "Fast EMA Length", minval=1, group=groupTrend)
```

Avoid scattering inputs throughout the file.

### State Naming

Use plain state names that can be logged and tested:

```text
bullish
bearish
neutral
risk_on
caution
stand_down
high
normal
low
```

Avoid names that imply certainty or prediction:

```text
guaranteed_long
sure_short
perfect_entry
win_signal
```

Atlas assesses; it does not predict.

### Plotting Standards

Visuals should support decision quality.

Do not add visual elements unless they help the trader answer:

- What state is the market in?
- Is risk justified?
- Should I stand down?
- Is this condition objectively testable?

Avoid unnecessary colours, shapes, labels, and signals.

### Dashboard Standards

Dashboards should be concise.

Preferred dashboard fields:

```text
Regime
Bias
Trend Score
Volatility State
Risk Mode
Session Status
Execution Mode
```

Do not create dashboards that look impressive but increase cognitive load.

### Alert Standards

Alerts must be versioned and structured.

Every alert payload should include:

```text
schema
project
module
mode
ticker
timeframe
price
signal
execution
```

Observer-mode alerts must explicitly disable execution:

```json
"execution": {
  "allowed": false,
  "action": "none",
  "quantity": 0
}
```

### Execution Standards

No Pine script should become execution-capable until execution is explicitly approved in the repository.

Execution-capable logic requires:

- Documentation
- Schema
- Replay validation
- Paper execution validation
- Risk controls
- Prop firm rule review
- Explicit promotion commit

## Comment Standards

Comments should explain why, not merely what.

Good:

```pinescript
// Stand down when volatility is high and directional bias is neutral.
// This reduces chop exposure and protects evaluation capital.
```

Poor:

```pinescript
// Set risk mode to stand_down.
```

## Testing Standards

Every code change should identify how it was validated.

Minimum validation for Pine changes:

```text
[ ] Compiles in TradingView
[ ] Runs on MNQ chart
[ ] Visual output checked
[ ] Replay reviewed
[ ] Alerts checked, if changed
[ ] No unintended execution behaviour
```

## Replay Review Standards

Replay notes should capture:

- Date reviewed
- Market condition
- Timeframe
- Atlas output
- What Atlas helped avoid
- What Atlas missed
- Whether the module improved decision quality
- Whether the module reduced unnecessary trades

## Parameter Standards

Parameters should not be optimised blindly.

Before changing a parameter, document:

- Why it is being changed
- What behaviour should improve
- What market conditions were reviewed
- Whether trade frequency increased or decreased
- Whether capital preservation improved

## Anti-Patterns

Avoid these patterns:

- Adding indicators because they are popular
- Adding filters that cannot be tested
- Increasing signal frequency without evidence
- Using names that imply certainty
- Mixing observer and execution logic too early
- Making changes only inside TradingView without updating the repo
- Optimising for one perfect replay day
- Ignoring losing or choppy sessions during validation

## Production Readiness Standard

Code is not production-ready because it compiles.

Code is production-ready only when it is documented, versioned, validated, and shown to support the Atlas mission.

For Atlas, the best code is often the code that keeps Phil out of unnecessary trades.
