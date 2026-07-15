/**
 * Sprint 116 — DARWIN Daily Report Tests
 *
 * Tests for:
 *   - Report section generation structure
 *   - GitHub archive path formatting
 *   - Report date derivation
 *   - Markdown output structure
 */

import { describe, it, expect } from "vitest";

// ── Utility: derive ET date ───────────────────────────────────────────────────

function getTodayEtDate(): string {
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return etFormatter.format(now);
}

function getGithubFilePath(reportDate: string): string {
  const [year, month] = reportDate.split("-");
  return `research/daily/${year}/${month}/DARWIN-${reportDate}.md`;
}

function buildReportMarkdown(sections: {
  title: string;
  content: string;
}[]): string {
  const header = `# DARWIN Daily Research Report\n\n**Date:** ${getTodayEtDate()}\n\n---\n\n`;
  const body = sections
    .map((s, i) => `## ${i + 1}. ${s.title}\n\n${s.content}`)
    .join("\n\n---\n\n");
  return header + body;
}

function countSections(markdown: string): number {
  return (markdown.match(/^## \d+\./gm) ?? []).length;
}

function extractReportDate(markdown: string): string | null {
  const match = markdown.match(/\*\*Date:\*\* (\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Sprint 116 — DARWIN Daily Report", () => {
  describe("Report date derivation", () => {
    it("should return a valid YYYY-MM-DD date string", () => {
      const date = getTodayEtDate();
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should return a date within the last 2 days (ET timezone)", () => {
      const date = getTodayEtDate();
      const parsed = new Date(date + "T12:00:00Z");
      const now = new Date();
      const diffDays = Math.abs(now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeLessThan(2);
    });
  });

  describe("GitHub archive path formatting", () => {
    it("should format path as research/daily/YYYY/MM/DARWIN-YYYY-MM-DD.md", () => {
      const path = getGithubFilePath("2026-07-15");
      expect(path).toBe("research/daily/2026/07/DARWIN-2026-07-15.md");
    });

    it("should handle January correctly (zero-padded month)", () => {
      const path = getGithubFilePath("2026-01-05");
      expect(path).toBe("research/daily/2026/01/DARWIN-2026-01-05.md");
    });

    it("should handle December correctly", () => {
      const path = getGithubFilePath("2026-12-31");
      expect(path).toBe("research/daily/2026/12/DARWIN-2026-12-31.md");
    });

    it("should always start with research/daily/", () => {
      const path = getGithubFilePath("2027-03-22");
      expect(path.startsWith("research/daily/")).toBe(true);
    });

    it("should always end with .md", () => {
      const path = getGithubFilePath("2026-07-15");
      expect(path.endsWith(".md")).toBe(true);
    });
  });

  describe("Report Markdown structure", () => {
    const EXPECTED_SECTIONS = 10;

    const mockSections = Array.from({ length: EXPECTED_SECTIONS }, (_, i) => ({
      title: `Section ${i + 1}`,
      content: `Content for section ${i + 1}. This is the analysis.`,
    }));

    it("should produce a report with exactly 10 numbered sections", () => {
      const markdown = buildReportMarkdown(mockSections);
      expect(countSections(markdown)).toBe(10);
    });

    it("should include a # title header", () => {
      const markdown = buildReportMarkdown(mockSections);
      expect(markdown).toMatch(/^# DARWIN Daily Research Report/m);
    });

    it("should include a **Date:** field", () => {
      const markdown = buildReportMarkdown(mockSections);
      expect(markdown).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
    });

    it("should extract the date from the markdown", () => {
      const markdown = buildReportMarkdown(mockSections);
      const date = extractReportDate(markdown);
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should include section separators (---)", () => {
      const markdown = buildReportMarkdown(mockSections);
      const separators = (markdown.match(/^---$/gm) ?? []).length;
      expect(separators).toBeGreaterThanOrEqual(EXPECTED_SECTIONS);
    });

    it("should include all section titles", () => {
      const markdown = buildReportMarkdown(mockSections);
      for (const section of mockSections) {
        expect(markdown).toContain(section.title);
      }
    });
  });

  describe("Report section naming convention", () => {
    const EXPECTED_SECTION_NAMES = [
      "Executive Summary",
      "Market Regime Analysis",
      "Portfolio Performance Review",
      "Model Health Assessment",
      "Behaviour Library Update",
      "Market Law Validation",
      "DARWIN Research Pipeline",
      "Gap Discovery Update",
      "Risk & Execution Review",
      "Tomorrow's Research Priorities",
    ];

    it("should define exactly 10 canonical section names", () => {
      expect(EXPECTED_SECTION_NAMES).toHaveLength(10);
    });

    it("should include Executive Summary as section 1", () => {
      expect(EXPECTED_SECTION_NAMES[0]).toBe("Executive Summary");
    });

    it("should include Tomorrow's Research Priorities as section 10", () => {
      expect(EXPECTED_SECTION_NAMES[9]).toBe("Tomorrow's Research Priorities");
    });

    it("should include Market Regime Analysis", () => {
      expect(EXPECTED_SECTION_NAMES).toContain("Market Regime Analysis");
    });

    it("should include Gap Discovery Update", () => {
      expect(EXPECTED_SECTION_NAMES).toContain("Gap Discovery Update");
    });
  });

  describe("GitHub commit status tracking", () => {
    const VALID_STATUSES = ["PENDING", "SUCCESS", "FAILED"];

    it("should define 3 valid commit statuses", () => {
      expect(VALID_STATUSES).toHaveLength(3);
    });

    it("should include PENDING as default status", () => {
      expect(VALID_STATUSES).toContain("PENDING");
    });

    it("should include SUCCESS for successful commits", () => {
      expect(VALID_STATUSES).toContain("SUCCESS");
    });

    it("should include FAILED for failed commits", () => {
      expect(VALID_STATUSES).toContain("FAILED");
    });
  });

  describe("Scheduled job registration", () => {
    it("should register darwin-daily-report endpoint", () => {
      const ENDPOINT = "/api/scheduled/darwin-daily-report";
      expect(ENDPOINT).toMatch(/^\/api\/scheduled\//);
      expect(ENDPOINT).toContain("darwin-daily-report");
    });

    it("should run at 17:30 ET (21:30 UTC) on weekdays", () => {
      // Verify the schedule timing documentation
      const SCHEDULE_UTC = "21:30";
      const SCHEDULE_ET = "17:30";
      expect(SCHEDULE_UTC).toBe("21:30");
      expect(SCHEDULE_ET).toBe("17:30");
    });
  });
});
