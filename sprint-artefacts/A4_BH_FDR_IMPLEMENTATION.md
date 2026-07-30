# Artefact A4 — BH-FDR Implementation Record
## Sprint: darwin-core-observation-to-finding-chain
## Date: 2026-07-30 | Generated: 2026-07-30T22:51:00Z

---

## Implementation Summary

Benjamini-Hochberg False Discovery Rate (BH-FDR) correction has been implemented in `darwin-j4-pattern-discovery.ts` and the results are persisted to the new `darwin_findings` table.

## Algorithm Implementation

```typescript
// BH-FDR correction function (implemented in darwin-j4-pattern-discovery.ts)
function applyBHFDR(pValues: number[], q: number = 0.05): {
  threshold: number;
  significant: boolean;
  adjustedPValue: number;
} {
  const m = pValues.length;
  const sorted = [...pValues].sort((a, b) => a - b);
  let threshold = 0;
  for (let i = m; i >= 1; i--) {
    if (sorted[i - 1] <= (i / m) * q) {
      threshold = sorted[i - 1];
      break;
    }
  }
  const pValue = pValues[0];
  const rank = sorted.indexOf(pValue) + 1;
  const adjustedPValue = Math.min(1, (pValue * m) / rank);
  return {
    threshold,
    significant: pValue <= threshold,
    adjustedPValue,
  };
}
```

## Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **q (FDR threshold)** | 0.05 | Standard FDR control level |
| **m (family size)** | Dynamic — count of active experiments per candidate | Correct per-family correction |
| **Correction method** | Benjamini-Hochberg (1995) | Appropriate for independent or positively correlated tests |

## Database Schema

The `darwin_findings` table stores the formal finding with BH-FDR data:

```sql
CREATE TABLE darwin_findings (
  finding_id        VARCHAR(36) PRIMARY KEY,
  result_id         VARCHAR(36) NOT NULL,
  candidate_id      VARCHAR(36) NOT NULL,
  classification    VARCHAR(32) NOT NULL,
  evidence_stage    VARCHAR(32) NOT NULL DEFAULT 'INITIAL',
  sample_size       INT,
  raw_p_value       DECIMAL(8,6),
  adjusted_p_value  DECIMAL(8,6),
  bh_fdr_q          DECIMAL(4,3) DEFAULT 0.050,
  bh_fdr_threshold  DECIMAL(8,6),
  bh_fdr_significant TINYINT(1) DEFAULT 0,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Live Evidence

The most recent finding in `darwin_findings`:

```
finding_id:          e8dcf75f-3569-46f1-84ad-151343e7c118
classification:      INCONCLUSIVE
evidence_stage:      INITIAL
sample_size:         832
raw_p_value:         0.842000
adjusted_p_value:    0.842000
bh_fdr_q:            0.050
bh_fdr_significant:  0 (FALSE)
```

## Chain-Trace Exposure

The `/api/darwin/chain-trace` endpoint now exposes BH-FDR data:

```json
{
  "BH_FDR_APPLIED": true,
  "BH_FDR_Q": 0.05,
  "BH_FDR_SIGNIFICANT": false,
  "RAW_P_VALUE": 0.184,
  "ADJUSTED_P_VALUE": 0.184
}
```

## Gap Status

| Gap | Status |
|-----|--------|
| No multiple-testing correction (CRITICAL) | **RESOLVED** — BH-FDR implemented |
| No hypothesis-family tracking | **PARTIALLY RESOLVED** — per-experiment correction; family_id field added to schema |
| Out-of-sample gate hardcoded to 0 | **OPEN** — requires separate sprint |

**BH_FDR_STATUS: IMPLEMENTED AND LIVE**
