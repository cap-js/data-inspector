/**
 * Type definitions for the performance testing infrastructure.
 *
 * These types define the shape of measurement results, baseline data,
 * and the final performance report.
 */

/** Descriptive statistics for a set of timing measurements. */
export type MeasurementStats = {
  median: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  /** 95% confidence interval half-width (±value). */
  confidenceInterval: number;
};

/** Result of a single benchmark run across all input sizes. */
export type BenchmarkResult = {
  name: string;
  sizes: number[];
  /** Median timing in ms for each size. */
  timingsMs: number[];
  /** Full statistics for each size. */
  timingStats: MeasurementStats[];
  /** Time per item (timingMs / size) for each size. */
  perItemMs: number[];
  /** Slope between consecutive size pairs (ms per additional item). */
  slopes: number[];
  /** Ratio of last slope to first slope. 1.0 = perfectly linear. */
  slopeRatio: number;
  /** R² coefficient of determination for linear fit. 1.0 = perfect. */
  r2: number;
  /** Heap memory delta in MB for each size. */
  memoryDeltaMB: number[];
};

/** A single entry in the performance baseline file. */
export type BaselineEntry = {
  sizes: number[];
  perItemMsAtMax: number;
  slopeRatio: number;
  r2?: number;
};

/** The full baseline file: benchmark name → baseline entry. */
export type BaselineData = Record<string, BaselineEntry>;

/** Test configuration summary for the report. */
export type TestConfig = {
  warmupRuns: number;
  measurementRuns: number;
  outlierTrimPercent: number;
  totalRunsPerSize: number;
};

/** The complete performance report written to disk after a run. */
export type Report = {
  timestamp: string;
  sizes: number[];
  results: BenchmarkResult[];
  baseline?: BaselineData;
  regressionThreshold: number;
  slopeVarianceThreshold: number;
  testConfig: TestConfig;
  environment: {
    node: string;
    platform: string;
    cpus: string;
    totalMemoryGB: number;
    cpuLoad: number[];
  };
  systemWarnings: string[];
};
