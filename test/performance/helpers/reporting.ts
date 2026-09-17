/**
 * Performance report generation.
 *
 * Builds a human-readable Markdown report from benchmark results,
 * including environment info, configuration, results table with
 * emoji-coded indicators, and a legend.
 */

import type { Report } from "./types";

// ---------------------------------------------------------------------------
// Emoji indicators for report table cells
// ---------------------------------------------------------------------------

/** Slope ratio: 🟢 ≤2.0 (linear), 🟡 2–4 (suspicious), 🔴 >4 (non-linear). */
export const slopeRatioEmoji = (ratio: number): string => {
  if (ratio <= 2.0) return "🟢";
  if (ratio <= 4.0) return "🟡";
  return "🔴";
};

/** R²: 🟢 ≥0.995 (excellent), 🟡 0.98–0.995, 🔴 <0.98. */
export const r2Emoji = (r2: number): string => {
  if (r2 >= 0.995) return "🟢";
  if (r2 >= 0.98) return "🟡";
  return "🔴";
};

/** CV%: 🟢 ≤5% (stable), 🟡 5–15%, 🔴 >15% (noisy). */
export const cvEmoji = (cv: number): string => {
  if (cv <= 5) return "🟢";
  if (cv <= 15) return "🟡";
  return "🔴";
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format a number to fixed decimal places. */
const formatNumber = (value: number, digits: number): string => value.toFixed(digits);

/** Format an array of numbers as a comma-separated string. */
const formatList = (values: number[], digits: number): string =>
  values.map((v) => formatNumber(v, digits)).join(", ");

// ---------------------------------------------------------------------------
// Markdown report builder
// ---------------------------------------------------------------------------

/**
 * Builds a complete Markdown performance report.
 *
 * Sections: Environment, Test Configuration, System Warnings,
 * Results table (with baseline comparison columns), and Legend.
 */
export const buildMarkdownReport = (report: Report): string => {
  const lines: string[] = [];
  lines.push(`# Performance Report (${report.timestamp})`);
  lines.push("");

  // --- Environment ---
  lines.push("## Environment");
  lines.push("");
  lines.push(`- Node: ${report.environment.node}`);
  lines.push(`- Platform: ${report.environment.platform}`);
  lines.push(`- CPU: ${report.environment.cpus}`);
  lines.push(`- Memory: ${report.environment.totalMemoryGB.toFixed(1)} GB`);
  lines.push(`- CPU Load: ${report.environment.cpuLoad.map((l) => l.toFixed(2)).join(", ")}`);
  lines.push("");

  // --- Test Configuration ---
  lines.push("## Test Configuration");
  lines.push("");
  lines.push(`- Warmup runs: ${report.testConfig.warmupRuns}`);
  lines.push(`- Measurement runs: ${report.testConfig.measurementRuns}`);
  lines.push(
    `- Outlier trim: ${(report.testConfig.outlierTrimPercent * 100).toFixed(0)}% extra (${report.testConfig.totalRunsPerSize - report.testConfig.measurementRuns} trimmed)`
  );
  lines.push(`- Total runs per size: ${report.testConfig.totalRunsPerSize}`);

  // --- System Warnings ---
  if (report.systemWarnings.length > 0) {
    lines.push("");
    lines.push("### System Warnings");
    lines.push("");
    report.systemWarnings.forEach((w) => lines.push(`- ${w}`));
  }

  // --- Results table ---
  lines.push("");
  lines.push("## Results");
  lines.push("");
  lines.push(
    "| Benchmark | Timings ms (median) | Variance (CV%) | Per-item ms | Memory ΔMB | Slope ratio | R² | Baseline per-item max | Baseline slope ratio | Baseline R² |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

  for (const result of report.results) {
    const baseline = report.baseline?.[result.name];
    const baselinePerItem = baseline ? formatNumber(baseline.perItemMsAtMax, 7) : "n/a";
    const baselineSlope = baseline ? formatNumber(baseline.slopeRatio, 4) : "n/a";
    const baselineR2 = baseline?.r2 !== undefined ? formatNumber(baseline.r2, 4) : "n/a";
    const avgCV =
      result.timingStats.map((s) => (s.stdDev / s.mean) * 100).reduce((sum, cv) => sum + cv, 0) /
      result.timingStats.length;

    lines.push(
      [
        result.name,
        formatList(result.timingsMs, 2),
        formatNumber(avgCV, 1) + "% " + cvEmoji(avgCV),
        formatList(result.perItemMs, 7),
        formatList(result.memoryDeltaMB, 2),
        formatNumber(result.slopeRatio, 4) + " " + slopeRatioEmoji(result.slopeRatio),
        formatNumber(result.r2, 4) + " " + r2Emoji(result.r2),
        baselinePerItem,
        baselineSlope,
        baselineR2,
      ].join(" | ")
    );
  }

  // --- Legend ---
  lines.push("");
  lines.push("## Legend");
  lines.push("");
  lines.push("### Slope ratio");
  lines.push("");
  lines.push(
    "Ratio of the last slope segment to the first. A perfectly linear O(n) function scores 1.0."
  );
  lines.push("");
  lines.push("| Indicator | Range | Meaning |");
  lines.push("| --- | --- | --- |");
  lines.push("| 🟢 | ≤ 2.0 | Consistent with O(n) linear scaling |");
  lines.push("| 🟡 | 2.0 – 4.0 | Suspicious — possible mild super-linear growth |");
  lines.push("| 🔴 | > 4.0 | Clearly non-linear (O(n²) or worse) |");
  lines.push("");
  lines.push("### CV% (Coefficient of Variation)");
  lines.push("");
  lines.push("Average CV across all measured sizes. Measures measurement stability.");
  lines.push("");
  lines.push("| Indicator | Range | Meaning |");
  lines.push("| --- | --- | --- |");
  lines.push("| 🟢 | ≤ 5% | Stable — measurements are repeatable |");
  lines.push("| 🟡 | 5% – 15% | Acceptable for Node.js |");
  lines.push("| 🔴 | > 15% | High noise — results unreliable |");
  lines.push("");
  lines.push("### R² (Coefficient of Determination)");
  lines.push("");
  lines.push("1.0 = medians fall perfectly on a straight line.");
  lines.push("");
  lines.push("| Indicator | Range | Meaning |");
  lines.push("| --- | --- | --- |");
  lines.push("| 🟢 | ≥ 0.995 | Excellent linear fit |");
  lines.push("| 🟡 | 0.980 – 0.995 | Minor deviation from linearity |");
  lines.push("| 🔴 | < 0.980 | Clearly non-linear scaling |");

  return lines.join("\n");
};
