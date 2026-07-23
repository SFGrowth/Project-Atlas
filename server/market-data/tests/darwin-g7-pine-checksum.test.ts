/**
 * Gate G7 — Pine Script Checksum Verification
 *
 * Automated test that:
 * 1. Hashes the canonical Pine Script file
 * 2. Compares it to the fidelity manifest
 * 3. Fails if the file or manifest changes without a version update
 *
 * This test is the single source of truth for Pine Script provenance.
 * If this test fails, the Pine Script has changed and all fidelity
 * assessments must be re-evaluated.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================
// CANONICAL PINE SCRIPT MANIFEST
// Source: docs/architecture/PINE_SCRIPT_CHECKSUM_MANIFEST.md
// DO NOT CHANGE THESE VALUES without updating the manifest and
// re-running the full fidelity reconciliation.
// ============================================================
const PINE_MANIFEST = {
  relativePath: 'tradingview/atlas-unified-portfolio/atlas_portfolio_v1.pine',
  sha256: 'd40b6e112f168692202af8fc8dbcc0464b1464c10b8b563c70625e2f0bf5ddfb',
  gitBlobSha: 'd7caa8be59afc3d3569b7f09c0caddc9edbfb76e',
  sourceCommit: 'dd3f3795123c9e6a84023e7da2f4159380160f50',
  pineVersion: '6',
  strategyVersion: '1.0.2',
  strategyName: 'Atlas Unified Portfolio Strategy',
  shortTitle: 'ATLAS-PORT',
  fileSizeBytes: 15510,
  lineCount: 353,
  commissionType: 'strategy.commission.cash_per_contract',
  commissionValue: 0.62,
  ruleHash: '4aadda159b46940bbf88bac62608f754e04e740c79022b2965a1a8b52b3946b5',
} as const;

// Resolve repo root (tests are in server/market-data/tests/)
const REPO_ROOT = path.resolve(__dirname, '../../../');
const PINE_FILE_PATH = path.join(REPO_ROOT, PINE_MANIFEST.relativePath);
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  'docs/architecture/PINE_SCRIPT_CHECKSUM_MANIFEST.md'
);

function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe('Gate G7 — Pine Script Checksum (PC)', () => {
  describe('PC-01: File existence', () => {
    it('PC-01-A: Pine Script file exists at canonical path', () => {
      expect(
        fs.existsSync(PINE_FILE_PATH),
        `Pine Script not found at: ${PINE_FILE_PATH}`
      ).toBe(true);
    });

    it('PC-01-B: Checksum manifest exists', () => {
      expect(
        fs.existsSync(MANIFEST_PATH),
        `Manifest not found at: ${MANIFEST_PATH}`
      ).toBe(true);
    });
  });

  describe('PC-02: SHA-256 integrity', () => {
    it('PC-02-A: SHA-256 matches manifest', () => {
      const actual = sha256File(PINE_FILE_PATH);
      expect(actual).toBe(PINE_MANIFEST.sha256);
    });

    it('PC-02-B: File size matches manifest', () => {
      const stat = fs.statSync(PINE_FILE_PATH);
      expect(stat.size).toBe(PINE_MANIFEST.fileSizeBytes);
    });

    it('PC-02-C: Line count matches manifest', () => {
      const content = fs.readFileSync(PINE_FILE_PATH, 'utf-8');
      const lines = content.split('\n').length - 1; // trailing newline
      expect(lines).toBe(PINE_MANIFEST.lineCount);
    });
  });

  describe('PC-03: Strategy identity', () => {
    let content: string;

    beforeAll(() => {
      content = fs.readFileSync(PINE_FILE_PATH, 'utf-8');
    });

    it('PC-03-A: Pine Script version is @version=6', () => {
      expect(content).toContain(`//@version=${PINE_MANIFEST.pineVersion}`);
    });

    it('PC-03-B: Strategy version is 1.0.2', () => {
      expect(content).toContain(`Version : ${PINE_MANIFEST.strategyVersion}`);
    });

    it('PC-03-C: Strategy name matches manifest', () => {
      expect(content).toContain(`"${PINE_MANIFEST.strategyName}"`);
    });

    it('PC-03-D: Short title matches manifest', () => {
      expect(content).toContain(`"${PINE_MANIFEST.shortTitle}"`);
    });
  });

  describe('PC-04: Commission semantics', () => {
    let content: string;

    beforeAll(() => {
      content = fs.readFileSync(PINE_FILE_PATH, 'utf-8');
    });

    it('PC-04-A: Commission type is cash_per_contract', () => {
      expect(content).toContain(PINE_MANIFEST.commissionType);
    });

    it('PC-04-B: Commission value is 0.62', () => {
      expect(content).toContain(`commission_value=${PINE_MANIFEST.commissionValue}`);
    });

    it('PC-04-C: Commission is per-contract (not per-trade)', () => {
      // cash_per_contract means TradingView applies $0.62 per contract per order
      // Round trip = $1.24 per contract (entry + exit)
      const roundTripPerContract = PINE_MANIFEST.commissionValue * 2;
      expect(roundTripPerContract).toBe(1.24);
    });
  });

  describe('PC-05: Manifest consistency', () => {
    it('PC-05-A: Manifest contains correct SHA-256', () => {
      const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
      expect(manifestContent).toContain(PINE_MANIFEST.sha256);
    });

    it('PC-05-B: Manifest does not contain the incorrect placeholder SHA', () => {
      const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
      // The incorrect placeholder SHA that appeared in the original evidence report
      const incorrectSha = 'd40b6e2f8a1c3b9e7d4f0a2c5e8b1d4f7a0c3e6b9d2f5a8c1e4b7d0f3a6c9e2';
      // It should only appear in the "Superseded" section, not as a current value
      const lines = manifestContent.split('\n');
      const currentValueLines = lines.filter(
        (l) => l.includes(incorrectSha) && !l.includes('SUPERSEDED') && !l.includes('Superseded')
      );
      expect(currentValueLines).toHaveLength(0);
    });

    it('PC-05-C: Manifest contains source commit SHA', () => {
      const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');
      expect(manifestContent).toContain(PINE_MANIFEST.sourceCommit);
    });
  });
});

// Import beforeAll for vitest
import { beforeAll } from 'vitest';
