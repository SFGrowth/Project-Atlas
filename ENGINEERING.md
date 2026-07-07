# Atlas Engineering Guide

## Purpose

This document defines how Project Atlas is engineered.

Atlas is expected to grow over multiple years. The repository must therefore be structured, documented, versioned, and validated like professional software from day one.

## Engineering Objective

The engineering process exists to protect the Atlas mission:

> Maximise the probability of passing and scaling prop firm evaluations while preserving capital.

Software quality is not separate from trading quality. Poor engineering creates ambiguous rules, fragile systems, bad records, and unnecessary risk.

## Repository Principle

The GitHub repository is the source of truth.

All important decisions, modules, schemas, validation notes, and production changes must be captured in the repository.

Chat discussions are useful, but they are not durable project memory until converted into repository artifacts.

## Recommended Repository Structure

```text
Project-Atlas/
├─ ATLAS.md
├─ ENGINEERING.md
├─ ROADMAP.md
├─ CHANGELOG.md
├─ CODING_STANDARDS.md
├─ README.md
├─ atlas-observer/
│  └─ Atlas_Observer_v0_1.pine
├─ docs/
│  ├─ adr/
│  ├─ architecture.md
│  └─ sprints/
├─ schemas/
├─ research/
├─ validation/
├─ ops/
└─ archive/
```

## Development Modes

Atlas must move through clear maturity stages.

```text
Idea
  -> Documented proposal
  -> Prototype
  -> Replay validation
  -> Statistical review
  -> Paper validation
  -> Production candidate
  -> Production
```

No module should skip these stages without an explicit documented exception.

## Sprint Requirements

Every sprint must produce:

- Repository improvement
- Documentation
- Working code or schema, where applicable
- Validation checklist or validation notes
- Git commit

Every sprint must include a section called `Charter Alignment` answering:

```markdown
## Charter Alignment

This sprint supports the Atlas objective by:

- Improving decision quality:
- Reducing unnecessary trades:
- Enabling objective testing:
- Supporting long-term expectancy:
- Preserving capital:
- Supporting prop firm evaluation survival and scaling:
```

If this section cannot be answered honestly, the sprint should be challenged.

## The Research Cycle

Atlas operates on a research-driven development model. Code is simply the implementation of validated knowledge. Every engine or feature must pass through the 9-step Research Cycle before being merged:

1. **Research Question**: What are we trying to understand?
2. **Hypothesis**: What is the proposed solution or relationship?
3. **Experimental Design**: How will we test this while isolating variables?
4. **Test Harness**: The Python code to run the experiment.
5. **Statistical Validation**: Running against the 2-year dataset (in-sample).
6. **Evidence Review**: Evaluating the 12 robustness metrics.
7. **Accept / Reject**: Decision based purely on evidence, not intuition.
8. **Update Atlas Knowledge Base**: Record the findings in `KNOWLEDGE_BASE.md`.
9. **Commit to Repository**: Only if accepted, merge the implementation to `main`.

## Module Admission Criteria

No module enters production until it has:

- Clear purpose
- Documentation
- Acceptance criteria
- Replay validation
- Version history
- Git commit
- Known limitations
- Promotion criteria
- Rollback path, where relevant

## Definition of Done

A change is done only when:

1. The code or document exists in the repository.
2. The purpose is clear.
3. The acceptance criteria are written.
4. Validation steps are documented.
5. The change supports the Atlas mission.
6. The change is committed to Git.
7. The working tree is clean.

For Pine Script changes, done also requires:

- Script compiles in TradingView
- Script can be added to an MNQ chart
- Visual output is checked
- Alerts, if present, are checked in non-live mode
- No unintended execution behaviour exists

## Branching Model

Recommended branch pattern:

```text
main
feature/<short-description>
sprint/<sprint-number>-<short-description>
fix/<short-description>
docs/<short-description>
```

Examples:

```text
sprint/001-observer-foundation
feature/guardian-risk-engine-prototype
docs/foundation-documentation
fix/observer-alert-payload
```

## Commit Message Standard

Use clear, purposeful commit messages.

Recommended format:

```text
<type>: <short description>
```

Common types:

```text
docs
feat
fix
refactor
test
research
ops
chore
```

Examples:

```text
docs: add Atlas foundation documentation
feat: add observer regime dashboard
research: add replay notes for MNQ trend sessions
fix: correct observer alert payload escaping
```

## Versioning

Atlas should use semantic versioning where practical:

```text
MAJOR.MINOR.PATCH
```

For Pine modules, include version information in the script header:

```pinescript
// Module: Atlas Observer
// Version: 0.1.0
// Mode: Observer only
```

Version changes should be reflected in `CHANGELOG.md`.

## Documentation Requirements

Every meaningful module should have documentation covering:

- Purpose
- Inputs
- Outputs
- Assumptions
- Limitations
- Validation method
- Acceptance criteria
- Version history
- Known risks

## Validation Levels

Atlas validation should become progressively stricter.

### Level 1: Compile Validation

The script compiles without errors.

### Level 2: Visual Validation

The script displays expected values on chart.

### Level 3: Replay Validation

The script is tested through TradingView replay across selected market conditions.

### Level 4: Signal Review

Signals are logged and reviewed for frequency, context, usefulness, and failure modes.

### Level 5: Statistical Review

Signal outputs are evaluated against objective performance metrics.

### Level 6: Paper Execution

Executable logic, when introduced, is tested in paper mode only.

### Level 7: Restricted Live Candidate

Only after documented validation and risk review.

### Level 8: Production

Live use with strict rules, monitoring, and rollback procedures.

## Risk and Execution Boundary

Atlas should begin as observer-only.

No live execution should be enabled until:

- Alert payloads are documented
- TradersPost routing is tested in sandbox or paper mode
- Position sizing is defined
- Daily loss protection is defined
- Prop firm rules are documented
- Rollback process exists
- Explicit promotion decision is committed

## Security Principles

- Do not store credentials in Pine Script.
- Do not put secrets in TradingView alert messages.
- Do not commit API keys.
- Do not expose account numbers in screenshots or logs.
- Use environment-specific configuration outside public code.

## Architecture Decision Records

Major decisions should be captured as ADRs in:

```text
docs/adr/
```

ADR files should use this pattern:

```text
0001-primary-objective.md
0002-observer-before-execution.md
0003-alert-contract-versioning.md
```

## Engineering Bias

Atlas should prefer:

- Small modules
- Explicit contracts
- Simple rules
- Fewer dependencies
- Measurable outputs
- Traceable decisions
- Clear rollback paths
- Documentation before production

Atlas should avoid:

- Hidden logic
- Over-optimised parameters
- Indicator stacking without validation
- Unversioned changes
- Production changes made only in TradingView
- Alerts that cannot be reproduced from the repository
