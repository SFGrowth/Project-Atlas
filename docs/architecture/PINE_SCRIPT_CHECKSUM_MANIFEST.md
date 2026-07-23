# Pine Script Checksum Manifest
## Canonical Source Provenance for Atlas Unified Portfolio Strategy

**Generated:** 2026-07-23  
**Sprint:** 123A.7 (Gate G7 correction)  
**Purpose:** Single authoritative record of Pine Script source provenance. All reports and tests must reference this manifest.

---

## Canonical Source File

| Field | Value |
|-------|-------|
| Repository path | `tradingview/atlas-unified-portfolio/atlas_portfolio_v1.pine` |
| File size | 15,510 bytes |
| Line count | 353 |
| **SHA-256** | `d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb` |
| Git blob SHA | `d7caa8be59afc3d3569b7f09c0caddc9edbfb76e` |
| Source commit | `dd3f3795123c9e6a84023e7da2f4159380160f50` |
| Pine Script version | `@version=6` |
| Strategy version | `1.0.2` |
| Strategy name | `Atlas Unified Portfolio Strategy` |
| Short title | `ATLAS-PORT` |
| Rule hash (strategy() block SHA-256) | `4aadda159b46940bbf88bac62608f754e04e740c79022b2965a1a8b52b3946b5` |

---

## Commission Semantics (from Pine source)

```pine
commission_type=strategy.commission.cash_per_contract
commission_value=0.62
```

TradingView applies `cash_per_contract` **per contract per order** (not per round trip). This means:
- Entry order: $0.62 × n contracts
- Exit order: $0.62 × n contracts
- Round trip total: $1.24 × n contracts

This must be verified against TradingView's actual commission application in the bar-by-bar reconciliation (Sprint 123A.8 Phase 1).

---

## Incorrect Checksums (Superseded)

The following checksums appeared in earlier Sprint 123A.7 reports and are **incorrect**:

| Incorrect Value | Source | Status |
|----------------|--------|--------|
| `d40b6e2f8a1c3b9e7d4f0a2c5e8b1d4f7a0c3e6b9d2f5a8c1e4b7d0f3a6c9e2` | `SPRINT_123A7_GATE_G7_AUTONOMOUS_RESEARCH_EVIDENCE.md` Field 4 (original) | **SUPERSEDED** |

The correct SHA-256 is `d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb` (computed directly from the committed file using `sha256sum`).

---

## Automated Verification

An automated test in `server/market-data/tests/darwin-g7-pine-checksum.test.ts` verifies:
1. The Pine Script file exists at the canonical path
2. Its SHA-256 matches this manifest
3. The test fails if the file or manifest changes without a version update

To manually verify:
```bash
sha256sum tradingview/atlas-unified-portfolio/atlas_portfolio_v1.pine
# Expected: d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb
```

---

## Version History

| Version | SHA-256 | Commit | Date | Change |
|---------|---------|--------|------|--------|
| 1.0.2 | `d40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb` | `dd3f3795123c9e6a84023e7da2f4159380160f50` | 2026-07-21 | Initial commit to repo |

---

*This manifest is the single source of truth for Pine Script provenance. Do not use checksums from any other document.*
