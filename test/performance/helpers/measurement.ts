/**
 * Benchmark measurement infrastructure.
 *
 * Provides timing functions (sync/async), outlier trimming, slope computation,
 * R² linear fit analysis, and high-level benchmark runners that orchestrate
 * warmup → measure → analyze across multiple input sizes.
 */

import { performance } from "perf_hooks";
import type { MeasurementStats, BenchmarkResult } from "./types";
import { mean, calculateStats } from "./statistics";

// ---------------------------------------------------------------------------
// Configuration (env-overridable defaults)
// ---------------------------------------------------------------------------
const MEASUREMENT_RUNS = Number(process.env.PERF_MEASUREMENT_RUNS ?? "20");
const OUTLIER_TRIM_PERCENT = Number(process.env.PERF_OUTLIER_TRIM_PERCENT ?? "0.5");
const WARMUP_RUNS = Number(process.env.PERF_WARMUP_RUNS ?? "10");

/** Default input sizes used across all benchmarks. */
export const sizes = [10, 50, 100, 500, 1000];

// ---------------------------------------------------------------------------
// Low-level timing
// ---------------------------------------------------------------------------

/** Result of a single measurement pass (one input size). */
type MeasurementResult = {
  timings: number[];
  stats: MeasurementStats;
  /** Heap delta in MB across all runs. */
  memoryDeltaMB: number;
};

/**
 * Times an async function `runs` times (plus extra runs for outlier trimming).
 * Returns trimmed timings, descriptive stats, and heap memory delta.
 */
export const measureAsync = async (
  fn: () => Promise<void>,
  runs: number = MEASUREMENT_RUNS
): Promise<MeasurementResult> => {
  const extraRuns = Math.ceil(runs * OUTLIER_TRIM_PERCENT);
  const totalRuns = runs + extraRuns;
  const allTimings: number[] = [];
  const memBefore = process.memoryUsage();

  for (let i = 0; i < totalRuns; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    allTimings.push(end - start);
  }

  const memAfter = process.memoryUsage();
  const memoryDeltaMB = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024);

  return { ...trimOutliers(allTimings, runs), memoryDeltaMB };
};

/**
 * Times a synchronous function `runs` times (plus extra runs for outlier trimming).
 * Returns trimmed timings, descriptive stats, and heap memory delta.
 */
export const measureSync = (fn: () => void, runs: number = MEASUREMENT_RUNS): MeasurementResult => {
  const extraRuns = Math.ceil(runs * OUTLIER_TRIM_PERCENT);
  const totalRuns = runs + extraRuns;
  const allTimings: number[] = [];
  const memBefore = process.memoryUsage();

  for (let i = 0; i < totalRuns; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    allTimings.push(end - start);
  }

  const memAfter = process.memoryUsage();
  const memoryDeltaMB = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024);

  return { ...trimOutliers(allTimings, runs), memoryDeltaMB };
};

/**
 * Removes outliers by keeping the `keep` values closest to the preliminary mean.
 * Returns the trimmed, sorted timings and their stats.
 */
function trimOutliers(
  allTimings: number[],
  keep: number
): { timings: number[]; stats: MeasurementStats } {
  const preliminaryMean = mean(allTimings);
  const timingsWithDistance = allTimings.map((timing) => ({
    timing,
    distance: Math.abs(timing - preliminaryMean),
  }));
  timingsWithDistance.sort((a, b) => a.distance - b.distance);
  const trimmedTimings = timingsWithDistance
    .slice(0, keep)
    .map((t) => t.timing)
    .sort((a, b) => a - b);

  return { timings: trimmedTimings, stats: calculateStats(trimmedTimings) };
}

// ---------------------------------------------------------------------------
// Scaling analysis
// ---------------------------------------------------------------------------

/**
 * Computes the slope (Δtime / Δsize) between each consecutive pair of sizes.
 * Returns an array of length `times.length - 1`.
 */
export const computeSlopes = (times: number[], sizeValues: number[]): number[] => {
  const slopes: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const deltaT = times[i] - times[i - 1];
    const deltaN = sizeValues[i] - sizeValues[i - 1];
    slopes.push(deltaT / deltaN);
  }
  return slopes;
};

/**
 * Computes R² (coefficient of determination) for a linear least-squares fit
 * of `times` vs `sizeValues`. Returns 1.0 for a perfect straight line.
 */
export const computeR2 = (times: number[], sizeValues: number[]): number => {
  const n = times.length;
  if (n < 2) return 1;
  const meanX = sizeValues.reduce((sum, x) => sum + x, 0) / n;
  const meanY = times.reduce((sum, y) => sum + y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const dx = sizeValues[i] - meanX;
    numerator += dx * (times[i] - meanY);
    denominator += dx * dx;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * sizeValues[i] + intercept;
    ssRes += (times[i] - predicted) ** 2;
    ssTot += (times[i] - meanY) ** 2;
  }
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
};

// ---------------------------------------------------------------------------
// High-level benchmark runners
// ---------------------------------------------------------------------------

/**
 * Runs a synchronous benchmark across all input sizes.
 * For each size: warmup → measure → compute per-item cost, slopes, R².
 * Logs progress to stdout.
 */
export const benchmarkSync = (name: string, runFn: (size: number) => void): BenchmarkResult => {
  const timingsMs: number[] = [];
  const timingStats: MeasurementStats[] = [];
  const memoryDeltaMB: number[] = [];

  console.log(`    Benchmarking ${name}...`);
  for (const size of sizes) {
    const totalRuns = MEASUREMENT_RUNS + Math.ceil(MEASUREMENT_RUNS * OUTLIER_TRIM_PERCENT);
    process.stdout.write(`      Size ${size}: warmup (${WARMUP_RUNS} runs)...`);

    for (let w = 0; w < WARMUP_RUNS; w++) {
      runFn(size);
    }

    process.stdout.write(` measuring (${totalRuns} runs)...`);
    const measurement = measureSync(() => runFn(size), MEASUREMENT_RUNS);

    timingsMs.push(measurement.stats.median);
    timingStats.push(measurement.stats);
    memoryDeltaMB.push(measurement.memoryDeltaMB);

    const cv = (measurement.stats.stdDev / measurement.stats.mean) * 100;
    const cvWarning = cv > 20 ? " ! HIGH VARIANCE" : "";
    console.log(
      ` ✓ (${measurement.stats.median.toFixed(2)}ms ±${measurement.stats.confidenceInterval.toFixed(2)}ms, CV: ${cv.toFixed(1)}%${cvWarning})`
    );
  }

  const perItemMs = timingsMs.map((time, index) => time / sizes[index]);
  const slopes = computeSlopes(timingsMs, sizes);
  const slopeRatio = slopes.length >= 2 ? slopes[slopes.length - 1] / slopes[0] : 1;
  const r2 = computeR2(timingsMs, sizes);

  return {
    name,
    sizes: [...sizes],
    timingsMs,
    timingStats,
    perItemMs,
    slopes,
    slopeRatio,
    r2,
    memoryDeltaMB,
  };
};

/**
 * Runs an async benchmark across all input sizes.
 * For each size: warmup → measure → compute per-item cost, slopes, R².
 * Logs progress to stdout.
 */
export const benchmarkAsync = async (
  name: string,
  runFn: (size: number) => Promise<void>
): Promise<BenchmarkResult> => {
  const timingsMs: number[] = [];
  const timingStats: MeasurementStats[] = [];
  const memoryDeltaMB: number[] = [];

  console.log(`    Benchmarking ${name}...`);
  for (const size of sizes) {
    const totalRuns = MEASUREMENT_RUNS + Math.ceil(MEASUREMENT_RUNS * OUTLIER_TRIM_PERCENT);
    process.stdout.write(`      Size ${size}: warmup (${WARMUP_RUNS} runs)...`);

    for (let w = 0; w < WARMUP_RUNS; w++) {
      await runFn(size);
    }

    process.stdout.write(` measuring (${totalRuns} runs)...`);
    const measurement = await measureAsync(() => runFn(size), MEASUREMENT_RUNS);

    timingsMs.push(measurement.stats.median);
    timingStats.push(measurement.stats);
    memoryDeltaMB.push(measurement.memoryDeltaMB);

    const cv = (measurement.stats.stdDev / measurement.stats.mean) * 100;
    const cvWarning = cv > 20 ? " ! HIGH VARIANCE" : "";
    console.log(
      ` ✓ (${measurement.stats.median.toFixed(2)}ms ±${measurement.stats.confidenceInterval.toFixed(2)}ms, CV: ${cv.toFixed(1)}%${cvWarning})`
    );
  }

  const perItemMs = timingsMs.map((time, index) => time / sizes[index]);
  const slopes = computeSlopes(timingsMs, sizes);
  const slopeRatio = slopes.length >= 2 ? slopes[slopes.length - 1] / slopes[0] : 1;
  const r2 = computeR2(timingsMs, sizes);

  return {
    name,
    sizes: [...sizes],
    timingsMs,
    timingStats,
    perItemMs,
    slopes,
    slopeRatio,
    r2,
    memoryDeltaMB,
  };
};
