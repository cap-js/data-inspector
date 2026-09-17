#!/usr/bin/env node
// check-baseline-drift.js
//
// Detects gradual drift in the CI performance baseline across git commits.
//
// Background: each developer keeps a local `performance-baseline.json` (gitignored)
// calibrated to their own machine. The CI-managed baseline is
// `performance-baseline.ci.json`, which is committed and updated only via the
// manual `performance-rebaseline` GitHub Actions workflow. Because it lives in git,
// its history captures every time the CI environment was re-baselined, making it
// possible to detect gradual cost drift even when no single update exceeded the
// single-run regression threshold.
//
// This script reads those commits and warns when:
//   - The total per-item cost increase across the examined window exceeds
//     DRIFT_MAX_TOTAL_INCREASE (default 20%).
//   - There are DRIFT_CONSECUTIVE_WARN (default 3) consecutive increases.
//
// Run:
//   npm run test:performance:check-drift          (uses CI baseline history)
//   node test/performance/check-baseline-drift.js
//
// Options (env vars):
//   DRIFT_BASELINE_FILE        (default "test/performance/performance-baseline.ci.json"):
//                              git path of the baseline file to inspect.
//   DRIFT_WINDOW               (default 10): number of recent commits to examine.
//   DRIFT_MAX_TOTAL_INCREASE   (default 0.20): max allowed total increase across
//                              the window as a fraction (0.20 = 20%).
//   DRIFT_CONSECUTIVE_WARN     (default 3): number of consecutive per-item cost
//                              increases before emitting a warning.

/* eslint-disable no-console */
"use strict";

const { execSync } = require("child_process");

const BASELINE_GIT_PATH =
  process.env.DRIFT_BASELINE_FILE ?? "test/performance/performance-baseline.ci.json";
const DRIFT_WINDOW = Number(process.env.DRIFT_WINDOW ?? "10");
const DRIFT_MAX_TOTAL = Number(process.env.DRIFT_MAX_TOTAL_INCREASE ?? "0.20");
const DRIFT_CONSECUTIVE = Number(process.env.DRIFT_CONSECUTIVE_WARN ?? "3");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Returns commits that touched the baseline file, most recent first.
 * Each entry: { hash: string, date: string }
 */
function getCommitHistory() {
  const raw = run(`git log --follow --format="%H %aI" -- ${BASELINE_GIT_PATH}`);
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => {
      const cleaned = line.replace(/"/g, "");
      const spaceIdx = cleaned.indexOf(" ");
      if (spaceIdx === -1) return null;
      return {
        hash: cleaned.slice(0, spaceIdx),
        date: cleaned.slice(spaceIdx + 1),
      };
    })
    .filter((c) => c && c.hash && c.date);
}

/**
 * Reads and parses performance-baseline.ci.json at the given commit hash.
 */
function readBaselineAtCommit(hash) {
  const raw = run(`git show ${hash}:${BASELINE_GIT_PATH}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Returns the Ordinary Least Squares slope for `values` indexed 0..n-1.
 */
function olsSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (values[i] - meanY);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Returns the length of the trailing run of strictly increasing values.
 * E.g. [1, 2, 1, 3, 4, 5] → 3  (last three entries form an increasing run)
 */
function trailingIncreaseStreak(values) {
  let count = 0;
  for (let i = values.length - 1; i > 0; i--) {
    if (values[i] > values[i - 1]) count++;
    else break;
  }
  return count;
}

/** Left-pad / right-pad helpers for table formatting. */
const rpad = (s, w) => String(s).slice(0, w).padEnd(w);
const lpad = (s, w) => String(s).slice(0, w).padStart(w);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("=== Performance Baseline Drift Check ===\n");

  const commits = getCommitHistory();
  if (commits.length === 0) {
    console.log(`No git history found for: ${BASELINE_GIT_PATH}`);
    console.log(
      "Tip: the CI baseline is created by the `performance-rebaseline` workflow (manual trigger in GitHub Actions)."
    );
    console.log(
      "     Run it at least twice to accumulate history. Until then, drift detection is not possible."
    );
    process.exit(0);
  }

  const window = commits.slice(0, DRIFT_WINDOW); // most recent first
  console.log(
    `Examining ${window.length} most recent commit(s) (${commits.length} total). DRIFT_WINDOW=${DRIFT_WINDOW}\n`
  );

  // Load snapshots in chronological order (oldest first) for trend analysis.
  const snapshots = [];
  for (const commit of [...window].reverse()) {
    const data = readBaselineAtCommit(commit.hash);
    if (data) snapshots.push({ ...commit, data });
  }

  if (snapshots.length < 2) {
    console.log(`Only ${snapshots.length} readable snapshot(s) — need at least 2 to detect drift.`);
    console.log(
      "Trigger the `performance-rebaseline` workflow again to accumulate a second snapshot."
    );
    process.exit(0);
  }

  // Collect all known benchmark names across all snapshots.
  const benchmarkNames = [...new Set(snapshots.flatMap((s) => Object.keys(s.data)))];

  // -------------------------------------------------------------------------
  // History table: perItemMsAtMax per benchmark per commit date
  // -------------------------------------------------------------------------
  const dateHeaders = snapshots.map((s) => s.date.slice(0, 10));
  const nameWidth = 36;
  const colWidth = 14;

  const headerRow =
    rpad("Benchmark (perItemMsAtMax)", nameWidth) +
    dateHeaders.map((d) => lpad(d, colWidth)).join("");
  console.log(headerRow);
  console.log("-".repeat(headerRow.length));

  for (const name of benchmarkNames) {
    const cells = snapshots.map((s) => {
      const v = s.data[name]?.perItemMsAtMax;
      return typeof v === "number" ? v.toExponential(3) : "n/a";
    });
    console.log(rpad(name, nameWidth) + cells.map((c) => lpad(c, colWidth)).join(""));
  }

  // -------------------------------------------------------------------------
  // Drift analysis per benchmark
  // -------------------------------------------------------------------------
  console.log("\n=== Drift Analysis ===\n");
  let hasViolation = false;

  for (const name of benchmarkNames) {
    const values = snapshots
      .map((s) => s.data[name]?.perItemMsAtMax)
      .filter((v) => typeof v === "number");

    if (values.length < 2) continue;

    const oldest = values[0];
    const latest = values[values.length - 1];
    const totalIncrease = oldest > 0 ? (latest - oldest) / oldest : 0;
    const streak = trailingIncreaseStreak(values);
    const slope = olsSlope(values);
    // Normalized slope: fraction of oldest value per commit step.
    const slopeNorm = oldest > 0 ? slope / oldest : 0;

    const issues = [];
    if (totalIncrease > DRIFT_MAX_TOTAL) {
      issues.push(
        `total increase ${(totalIncrease * 100).toFixed(1)}% exceeds DRIFT_MAX_TOTAL_INCREASE=${(DRIFT_MAX_TOTAL * 100).toFixed(0)}%`
      );
      hasViolation = true;
    }
    if (streak >= DRIFT_CONSECUTIVE) {
      // Streak warnings are advisory only — not violations (could be noise).
      issues.push(
        `${streak} consecutive increases (DRIFT_CONSECUTIVE_WARN=${DRIFT_CONSECUTIVE}) — investigate, may be noise`
      );
    }

    const tag =
      issues.length > 0 && totalIncrease > DRIFT_MAX_TOTAL
        ? "FAIL"
        : issues.length > 0
          ? "WARN"
          : slopeNorm > 0
            ? "info"
            : "ok  ";

    console.log(
      `[${tag}] ${rpad(name, nameWidth - 7)}` +
        `  total=${lpad((totalIncrease * 100).toFixed(1) + "%", 7)}` +
        `  streak=${streak}` +
        `  slope=${slopeNorm >= 0 ? "+" : ""}${(slopeNorm * 100).toFixed(2)}%/commit`
    );
    for (const issue of issues) {
      console.log(`       └─ ${issue}`);
    }
  }

  console.log("\n--- Thresholds ---");
  console.log(
    `  DRIFT_MAX_TOTAL_INCREASE = ${(DRIFT_MAX_TOTAL * 100).toFixed(0)}%  (set via env var)`
  );
  console.log(
    `  DRIFT_CONSECUTIVE_WARN   = ${DRIFT_CONSECUTIVE} consecutive increases  (advisory, not a violation)`
  );
  console.log(
    "\nTo re-baseline after an intentional performance change: trigger the `performance-rebaseline` workflow in GitHub Actions."
  );
  console.log(
    "  Developers: keep your local `performance-baseline.json` up to date with `npm run test:performance:update-baseline`."
  );

  if (hasViolation) {
    console.log(
      "\n[WARN] Baseline drift exceeds threshold(s). Either optimize the affected code path" +
        " and update the baseline, or raise DRIFT_MAX_TOTAL_INCREASE if the increase is intentional."
    );
  } else {
    console.log("\n[PASS] No significant drift detected.");
  }
  process.exit(0);
}

main();
