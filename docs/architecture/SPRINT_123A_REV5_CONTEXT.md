# Sprint 123A Revision 5 — Working Context

## Git Audit Trail
- Baseline SHA: `71789f0` (Sprint 123A: Architecture Amendment — 14 design documents)
- Rev 2 SHA: `d582563`
- Rev 3 SHA: `2d7f1b0`
- Rev 4 SHA: `6b05ff1`
- Rev 4 final SHA: `d485851` (Sprint 123A: Apply all 10 Gate G0 Contract and Version Reconciliation corrections)
- All changed files between `71789f0..d485851` are under `docs/` — ZERO non-docs files changed

## Document SHA256 Hashes (at d485851)
- ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md: `68195b821814a51b`
- ATLAS_DATA_SOURCE_AUTHORITY_MATRIX.md: `20c1b6a373b201ab`
- ATLAS_EFFECTIVELY_ONCE_PROCESSING.md: `3164aa0826c10a2c`
- BDE_CAPABILITY_STATUS.md: `0d13b39020f857ec`
- BEHAVIOUR_SYSTEM_MIGRATION_PLAN.md: `7d034ec882b9584c`
- DATABENTO_CONTRACT_MAPPING_AND_ROLL_POLICY.md: `8d0f97174970503`
- DATABENTO_DEPLOYMENT_TOPOLOGY.md: `b823b212e74764510`
- DATABENTO_NO_TRADE_AND_GAP_POLICY.md: `f329fe15a83b8351`
- DATABENTO_PARITY_CERTIFICATION_SPEC.md: `f6d15ba75f06cca8`
- DATABENTO_PYTHON_FEED_SERVICE_SPEC.md: `3e0ccaa2cc790f87`
- SPRINT_123A_AMENDED_IMPLEMENTATION_PLAN.md: `41e0dc8132e89e1d`
- SPRINT_123A_AMENDMENT_REPORT.md: `e771026be94bab24`
- SPRINT_123A_DEPENDENCY_DIAGRAM.md: `1cf05d79fdc541ba`
- SPRINT_123A_GATE_G0_CONTRACT_RECONCILIATION.md: `cd283005da77c058`
- SPRINT_123A_GATE_G0_CORRECTION_REPORT.md: `f5d8a956ca8417b5`
- SPRINT_123A_GATE_G0_FINAL_RECONCILIATION.md: `b6b0d8dcdb06ce4a`
- SPRINT_123A_GATE_G0_FINAL_VERIFICATION.md: `9e85a87ac5eb95c1`
- SPRINT_123A_GATE_MATRIX.md: `df169cd319981f7a`
- SPRINT_123A_RISK_REGISTER.md: `d462b8f53abb83e7`
- SPRINT_123A_TEST_MANIFEST.md: `f66f76abe88676725`

## Revision 5 Corrections Required
1. Replace "pending Revision 4 commit" placeholder with actual SHA `d485851` in CONTRACT_RECONCILIATION.md
2. Correction 2: ns→ms conversion rule (Python: `barOpenTsMs = tsEventNs // 1_000_000`; TypeScript: `Number(tsEventNs / 1_000_000n)`; PROHIBIT `Math.floor(Number(tsEventNs) / 1_000_000)`)
3. Correction 3: WebSocket wire format — `tsEventNs` and `tsRecvNs` as decimal strings; BigInt reconstruction via `BigInt(payload.tsEventNs)`; 6 new bridge tests
4. Correction 4: Section A normalised composite scoring (all metrics on 0.0–1.0 scale, formula: sum/8)
5. Correction 5: Feed availability = connection health + Python service health + bridge health + receipt of live trade/quote/heartbeat. NOT ohlcv-1m receipt.

## Current Test Total: 67 (machine-verified)
## Documents to update: ATLAS_CANONICAL_MARKET_EVENT_CONTRACTS.md, DATABENTO_PARITY_CERTIFICATION_SPEC.md, SPRINT_123A_TEST_MANIFEST.md, DATABENTO_PYTHON_FEED_SERVICE_SPEC.md, SPRINT_123A_GATE_G0_CONTRACT_RECONCILIATION.md
## New document to create: docs/reports/SPRINT_123A_GATE_G0_FINAL_APPROVAL_SUBMISSION.md
