/**
 * DARWIN GitHub Knowledge Archive — Sprint 116
 *
 * Commits DARWIN daily research reports to the GitHub repository:
 *   SFGrowth/Project-Atlas / research/daily / DARWIN_YYYY-MM-DD.md
 *
 * Uses the GitHub API via the ATLAS_WEBHOOK_TOKEN environment variable.
 * Falls back gracefully if the token is unavailable.
 *
 * Commit message format:
 *   "DARWIN Daily Research Report YYYY-MM-DD"
 *
 * If the file already exists (re-run for same date), it updates it.
 */

import { ENV } from "./_core/env.js";

export interface GitArchiveResult {
  success: boolean;
  sha?: string;
  url?: string;
  error?: string;
}

const REPO_OWNER = "SFGrowth";
const REPO_NAME = "Project-Atlas";
const BRANCH = "main";
const BASE_PATH = "research/daily";

// ─── GitHub API helpers ───────────────────────────────────────────────────────

function githubApiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "Atlas-DARWIN/1.0",
  };
}

async function getExistingFileSha(
  token: string,
  path: string
): Promise<string | null> {
  try {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;
    const res = await fetch(url, { headers: githubApiHeaders(token) });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { sha?: string };
    return data.sha ?? null;
  } catch {
    return null;
  }
}

async function commitFileToGitHub(
  token: string,
  path: string,
  content: string,
  message: string,
  existingSha: string | null
): Promise<{ sha: string; url: string }> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch: BRANCH,
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: githubApiHeaders(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    commit?: { sha?: string; html_url?: string };
    content?: { html_url?: string };
  };

  const sha = data.commit?.sha ?? "";
  const htmlUrl = data.commit?.html_url ?? data.content?.html_url ?? "";

  return { sha, url: htmlUrl };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function archiveReportToGitHub(
  reportDate: string,
  markdown: string
): Promise<GitArchiveResult> {
  // Get GitHub token from environment
  // The ATLAS_WEBHOOK_TOKEN is the project's GitHub connector token
  const token = process.env.ATLAS_WEBHOOK_TOKEN ?? process.env.GITHUB_TOKEN ?? "";

  if (!token) {
    const msg = "No GitHub token available (ATLAS_WEBHOOK_TOKEN not set) — skipping GitHub archive";
    console.warn(`[DARWIN Archive] ${msg}`);
    return { success: false, error: msg };
  }

  const filename = `DARWIN_${reportDate}.md`;
  const filePath = `${BASE_PATH}/${filename}`;
  const commitMessage = `DARWIN Daily Research Report ${reportDate}`;

  try {
    console.log(`[DARWIN Archive] Committing ${filename} to ${REPO_OWNER}/${REPO_NAME}...`);

    // Check if file already exists (for update vs create)
    const existingSha = await getExistingFileSha(token, filePath);

    const { sha, url } = await commitFileToGitHub(
      token,
      filePath,
      markdown,
      commitMessage,
      existingSha
    );

    console.log(
      `[DARWIN Archive] ✓ Committed ${filename} — SHA: ${sha.slice(0, 8)} | ${url}`
    );

    return { success: true, sha, url };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[DARWIN Archive] ✗ Failed to commit ${filename}: ${error}`);
    return { success: false, error };
  }
}

/**
 * Ensure the research/daily/ directory exists in the repo by checking
 * for a .gitkeep file and creating it if absent.
 * This is a one-time setup call — safe to call every run.
 */
export async function ensureResearchDirectoryExists(): Promise<void> {
  const token = process.env.ATLAS_WEBHOOK_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
  if (!token) return;

  const keepPath = `${BASE_PATH}/.gitkeep`;
  const existing = await getExistingFileSha(token, keepPath);
  if (existing) return; // Already exists

  try {
    await commitFileToGitHub(
      token,
      keepPath,
      "# DARWIN Daily Research Reports\n\nThis directory contains DARWIN's daily autonomous research reports.\n",
      "chore: initialise research/daily directory for DARWIN reports",
      null
    );
    console.log("[DARWIN Archive] Created research/daily/ directory in GitHub");
  } catch (err) {
    // Non-fatal — directory may already exist or token may lack write access
    console.warn(`[DARWIN Archive] Could not create research/daily/: ${err}`);
  }
}
