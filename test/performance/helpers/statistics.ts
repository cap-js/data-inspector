/**
 * Statistical functions for performance measurement analysis.
 *
 * Provides basic descriptive statistics (median, mean, standard deviation),
 * composite stats calculation, and system health checks.
 */

import os from "os";
import type { MeasurementStats } from "./types";

/** Returns the median of a numeric array. */
export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/** Returns the arithmetic mean of a numeric array. */
export const mean = (values: number[]): number =>
  values.reduce((sum, val) => sum + val, 0) / values.length;

/** Returns the population standard deviation of a numeric array. */
export const stdDev = (values: number[]): number => {
  const avg = mean(values);
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
};

/**
 * Computes full descriptive statistics for a set of timing values.
 * Includes median, mean, stdDev, min, max, and 95% confidence interval.
 */
export const calculateStats = (values: number[]): MeasurementStats => {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = mean(values);
  const sd = stdDev(values);
  const ci = 1.96 * (sd / Math.sqrt(values.length));
  return {
    median: median(values),
    mean: avg,
    stdDev: sd,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    confidenceInterval: ci,
  };
};

/**
 * Checks current system state and returns warnings if conditions
 * may produce unreliable benchmark results (high CPU load, high memory pressure).
 */
export const checkSystemState = (): string[] => {
  const warnings: string[] = [];
  const loadAvg = os.loadavg();
  const cpuCount = os.cpus().length;
  if (loadAvg[0] > cpuCount * 0.7) {
    warnings.push(
      `High CPU load detected: ${loadAvg[0].toFixed(2)} (${cpuCount} CPUs). Results may be unreliable.`
    );
  }
  const freeMemGB = os.freemem() / 1024 ** 3;
  const totalMemGB = os.totalmem() / 1024 ** 3;
  const memUsagePercent = ((totalMemGB - freeMemGB) / totalMemGB) * 100;
  if (memUsagePercent > 85) {
    warnings.push(
      `High memory usage: ${memUsagePercent.toFixed(1)}% (${freeMemGB.toFixed(1)}GB free of ${totalMemGB.toFixed(1)}GB).`
    );
  }
  return warnings;
};
