# Atlas Roadmap

## Roadmap Principle

Atlas will be built one sprint at a time.

The roadmap is directional, not a promise to build complexity. Each phase must pass the Atlas Test before being promoted.

## Atlas Test

Every roadmap item must answer:

1. Does this improve decision quality?
2. Does this reduce unnecessary trades?
3. Can this be objectively tested?
4. Does this improve long-term expectancy?
5. Does this preserve capital and support prop firm evaluation survival?

## Phase 0: Foundation Documentation

### Objective

Create the permanent project memory and engineering standards.

### Deliverables

- `ATLAS.md`
- `ENGINEERING.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `CODING_STANDARDS.md`
- Basic repository structure
- Initial sprint documentation

### Validation

- Documents exist in repository
- Mission is clear
- Engineering standards are defined
- Future work can reference stable project principles

### Status

In progress.

## Phase 1: Market Regime Engine (Research Stream A)

### Objective

Classify the current market before any strategy is allowed to generate signals. Answer the question: "What kind of market is this?"

### Deliverables

- Atlas Regime Engine Python research module
- Validated regime components (e.g., Volatility Compression, VWAP Deviation)
- Regime Score and Tradeability Score outputs
- Pine Script implementation for TradingView

### Validation

- Tested against 2-year MNQ dataset
- Each component tested independently
- Reports across all 12 robustness metrics

### Promotion Gate

Regime Engine must demonstrate a measurable improvement in overall robustness by identifying high-expectancy environments and filtering chop.

## Phase 1.5: Atlas Observer Dashboard

### Objective

Build the first non-execution market assessment dashboard for MNQ futures.

### Deliverables

- Atlas Observer Pine Script module
- Market regime output
- Bias output
- Volatility state
- Risk mode
- Stand-down state
- TradingView validation checklist

### Validation

- Compiles in TradingView
- Runs on MNQ chart
- Regime changes are visible
- No live execution is possible
- Replay notes capture useful and poor behaviours

### Promotion Gate

Observer must improve market-state clarity without encouraging more trades.

## Phase 2: Signal Contract and Alert Validation

### Objective

Define the structured alert payload contract before automation.

### Deliverables

- Alert schema
- Example payloads
- TradingView alert setup guide
- Non-live webhook validation checklist
- TradersPost sandbox notes

### Validation

- Payloads are valid JSON or intentionally documented TradingView-compatible JSON-like messages
- Execution is disabled by default
- Alerts can be received and logged without placing orders

### Promotion Gate

Alerts must improve traceability and testing before they are allowed to become executable.

## Phase 3: Structure Engine

### Objective

Assess market structure in a simple, testable way.

### Candidate Outputs

- Higher-high / lower-low context
- Swing direction
- Break of structure
- Range versus trend state
- Structural invalidation

### Validation

- Replay across trend days, range days, reversal days, and news-like volatility
- Track whether structure labels reduce low-quality trades

### Promotion Gate

Structure Engine must reduce ambiguity and improve stand-down or risk-on classification.

## Phase 4: Pressure Engine

### Objective

Assess directional pressure and momentum quality.

### Candidate Outputs

- Impulse quality
- Pullback quality
- Momentum confirmation
- Exhaustion warning
- Failed continuation warning

### Validation

- Replay validation
- Signal frequency analysis
- False-confidence review
- Comparison against baseline Observer decisions

### Promotion Gate

Pressure Engine must improve timing or reduce unnecessary entries without adding fragile complexity.

## Phase 5: Location Engine

### Objective

Assess whether price location is favourable or dangerous.

### Candidate Outputs

- VWAP relationship
- Prior day high / low context
- Session open context
- Premium / discount context
- Distance from key reference levels

### Validation

- Review whether poor-location trades are filtered
- Review whether high-quality trades are preserved
- Track effect on trade frequency and expectancy

### Promotion Gate

Location Engine must help avoid chasing poor trades.

## Phase 6: Guardian Risk Engine (Research Stream C)

### Objective

Protect capital and enforce prop firm survival logic.

### Candidate Outputs

- Daily risk state
- Max loss proximity
- Consecutive loss warning
- Overtrading warning
- Time-based stand-down
- Volatility-based stand-down
- Evaluation-mode risk rules

### Validation

- Rule documentation
- Replay scenario testing
- Simulated day loss scenarios
- Prop firm rule compatibility review

### Promotion Gate

Guardian must reduce the probability of evaluation failure and account damage.

## Phase 7: Journal and Validation System

### Objective

Create a process for recording, reviewing, and statistically validating Atlas decisions.

### Deliverables

- Replay template
- Trade review template
- Signal review spreadsheet or database schema
- Metrics definitions
- Validation reports

### Candidate Metrics

- Trades avoided
- Signal frequency
- Win rate
- Average win / average loss
- Expectancy
- Maximum drawdown
- Daily rule violation risk
- Time-of-day performance
- Regime performance

### Promotion Gate

Validation system must make Atlas more evidence-driven and less opinion-driven.

## Phase 8: TradersPost Sandbox Integration

### Objective

Connect TradingView alerts to TradersPost in non-live mode.

### Deliverables

- Sandbox payloads
- Webhook setup guide
- Alert routing checklist
- Failure-mode checklist
- Paper-only execution configuration

### Validation

- Alerts received correctly
- No unintended live orders
- Payload fields match repository schema
- Logs can be reconciled against TradingView bars

### Promotion Gate

Routing must be reliable before any executable logic is promoted.

## Phase 9: Paper Execution

### Objective

Test execution logic without capital risk.

### Deliverables

- Paper-only strategy configuration
- Bracket order rules, if used
- Position sizing assumptions
- Execution logs
- Daily review process

### Validation

- Orders match intended alerts
- Position size is correct
- Stop and target handling is correct
- Daily limits are respected
- No unexpected orders occur

### Promotion Gate

Paper execution must demonstrate reliability and risk discipline.

## Phase 10: Evaluation Playbook

### Objective

Define how Atlas is used during prop firm evaluations.

### Deliverables

- Evaluation rules summary
- Daily risk plan
- Trade frequency limits
- Stand-down rules
- Scaling plan
- Review process

### Validation

- Playbook is clear enough to follow under stress
- Rules are compatible with target prop firm constraints
- Atlas outputs support the playbook

### Promotion Gate

Playbook must reduce the probability of emotional or rule-breaking decisions.

## Phase 11: Execution Research (Research Stream B) & Strategy Selection Layer

### Objective

Evaluate multiple validated strategies and dynamically determine which, if any, best suits the current market regime.

### Deliverables

- Strategy classification matrix
- Dynamic execution routing based on Regime Score
- Multi-strategy backtest validation

### Promotion Gate

Selection Layer must prove that dynamically routing strategies based on regime outperforms a static single-strategy approach.

## Phase 12: Restricted Live Candidate

### Objective

Prepare for restricted live deployment only after substantial validation.

### Deliverables

- Production checklist
- Rollback process
- Account risk settings
- Incident process
- Monitoring plan
- Explicit promotion decision

### Validation

- All prior phases completed
- Risks documented
- Live size limited
- Kill-switch plan exists

### Promotion Gate

Restricted live mode requires explicit approval and repository commit.

## Long-Term Vision

Atlas should eventually become a robust decision platform with clear modules, objective validation, and disciplined operational rules.

The goal is not to build the most complex trading system.

The goal is to build the most useful decision-quality system for Phil's prop firm evaluation and scaling journey.
