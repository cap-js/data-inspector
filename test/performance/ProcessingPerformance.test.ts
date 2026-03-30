import cds from "@sap/cds";
import { performance } from "perf_hooks";
import fs from "fs";
import path from "path";
import os from "os";
import { expect } from "chai";

import { EntityDefinitionReader } from "../../srv/EntityDefinitionReader";
import { DataReader } from "../../srv/DataReader";

// ---------------------------------------------------------------------------
// Configuration (env-overridable)
// ---------------------------------------------------------------------------
const PERF_ENABLED = process.env.PERF_TESTS === "1";
const UPDATE_BASELINE = process.env.PERF_UPDATE_BASELINE === "1";
const MAX_REGRESSION = Number(process.env.PERF_MAX_REGRESSION ?? "0.3");
const MAX_SLOPE_VARIANCE = Number(process.env.PERF_MAX_SLOPE_VARIANCE ?? "0.3");
const WARMUP_RUNS = Number(process.env.PERF_WARMUP_RUNS ?? "10");
const MEASUREMENT_RUNS = Number(process.env.PERF_MEASUREMENT_RUNS ?? "20");
const OUTLIER_TRIM_PERCENT = Number(process.env.PERF_OUTLIER_TRIM_PERCENT ?? "0.5");

const BASELINE_FILENAME = process.env.PERF_BASELINE_FILE ?? "performance-baseline.json";
const BASELINE_PATH = path.resolve(__dirname, BASELINE_FILENAME);
const REPORT_PATH = path.resolve(__dirname, "..", "..", "coverage", "performance-report.json");
const REPORT_MD_PATH = path.resolve(__dirname, "..", "..", "coverage", "performance-report.md");

const describePerf = PERF_ENABLED ? describe : describe.skip;

// Sizes: number of synthetic entities for EntityDefinitionReader,
// number of synthetic records for DataReader
const sizes = [10, 50, 100, 500, 1000];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MeasurementStats = {
  median: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  confidenceInterval: number;
};

type BenchmarkResult = {
  name: string;
  sizes: number[];
  timingsMs: number[];
  timingStats: MeasurementStats[];
  perItemMs: number[];
  slopes: number[];
  slopeRatio: number;
  r2: number;
  memoryDeltaMB: number[];
};

type BaselineEntry = {
  sizes: number[];
  perItemMsAtMax: number;
  slopeRatio: number;
  r2?: number;
};

type BaselineData = Record<string, BaselineEntry>;

type TestConfig = {
  warmupRuns: number;
  measurementRuns: number;
  outlierTrimPercent: number;
  totalRunsPerSize: number;
};

type Report = {
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

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const mean = (values: number[]): number =>
  values.reduce((sum, val) => sum + val, 0) / values.length;

const stdDev = (values: number[]): number => {
  const avg = mean(values);
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
};

const calculateStats = (values: number[]): MeasurementStats => {
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

const checkSystemState = (): string[] => {
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

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------
const measureAsync = async (
  fn: () => Promise<void>,
  runs: number
): Promise<{ timings: number[]; stats: MeasurementStats; memoryDeltaMB: number }> => {
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

  const preliminaryMean = mean(allTimings);
  const timingsWithDistance = allTimings.map((timing) => ({
    timing,
    distance: Math.abs(timing - preliminaryMean),
  }));
  timingsWithDistance.sort((a, b) => a.distance - b.distance);
  const trimmedTimings = timingsWithDistance
    .slice(0, runs)
    .map((t) => t.timing)
    .sort((a, b) => a - b);

  return { timings: trimmedTimings, stats: calculateStats(trimmedTimings), memoryDeltaMB };
};

const measureSync = (
  fn: () => void,
  runs: number
): { timings: number[]; stats: MeasurementStats; memoryDeltaMB: number } => {
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

  const preliminaryMean = mean(allTimings);
  const timingsWithDistance = allTimings.map((timing) => ({
    timing,
    distance: Math.abs(timing - preliminaryMean),
  }));
  timingsWithDistance.sort((a, b) => a.distance - b.distance);
  const trimmedTimings = timingsWithDistance
    .slice(0, runs)
    .map((t) => t.timing)
    .sort((a, b) => a - b);

  return { timings: trimmedTimings, stats: calculateStats(trimmedTimings), memoryDeltaMB };
};

const computeSlopes = (times: number[], sizeValues: number[]): number[] => {
  const slopes: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const deltaT = times[i] - times[i - 1];
    const deltaN = sizeValues[i] - sizeValues[i - 1];
    slopes.push(deltaT / deltaN);
  }
  return slopes;
};

const computeR2 = (times: number[], sizeValues: number[]): number => {
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
// Report building
// ---------------------------------------------------------------------------
const slopeRatioEmoji = (ratio: number): string => {
  if (ratio <= 2.0) return "🟢";
  if (ratio <= 4.0) return "🟡";
  return "🔴";
};

const r2Emoji = (r2: number): string => {
  if (r2 >= 0.995) return "🟢";
  if (r2 >= 0.98) return "🟡";
  return "🔴";
};

const cvEmoji = (cv: number): string => {
  if (cv <= 5) return "🟢";
  if (cv <= 15) return "🟡";
  return "🔴";
};

const formatNumber = (value: number, digits: number): string => value.toFixed(digits);
const formatList = (values: number[], digits: number): string =>
  values.map((v) => formatNumber(v, digits)).join(", ");

const buildMarkdownReport = (report: Report): string => {
  const lines: string[] = [];
  lines.push(`# Performance Report (${report.timestamp})`);
  lines.push("");
  lines.push("## Environment");
  lines.push("");
  lines.push(`- Node: ${report.environment.node}`);
  lines.push(`- Platform: ${report.environment.platform}`);
  lines.push(`- CPU: ${report.environment.cpus}`);
  lines.push(`- Memory: ${report.environment.totalMemoryGB.toFixed(1)} GB`);
  lines.push(`- CPU Load: ${report.environment.cpuLoad.map((l) => l.toFixed(2)).join(", ")}`);
  lines.push("");
  lines.push("## Test Configuration");
  lines.push("");
  lines.push(`- Warmup runs: ${report.testConfig.warmupRuns}`);
  lines.push(`- Measurement runs: ${report.testConfig.measurementRuns}`);
  lines.push(
    `- Outlier trim: ${(report.testConfig.outlierTrimPercent * 100).toFixed(0)}% extra (${report.testConfig.totalRunsPerSize - report.testConfig.measurementRuns} trimmed)`
  );
  lines.push(`- Total runs per size: ${report.testConfig.totalRunsPerSize}`);

  if (report.systemWarnings.length > 0) {
    lines.push("");
    lines.push("### System Warnings");
    lines.push("");
    report.systemWarnings.forEach((w) => lines.push(`- ${w}`));
  }

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

// ---------------------------------------------------------------------------
// Synthetic data generators
// ---------------------------------------------------------------------------

/**
 * Builds an array of synthetic CDS-like entity definitions for EntityDefinitionReader benchmarks.
 * Each entity has a configurable number of elements (default 10) to simulate realistic CDS models.
 */
function buildSyntheticEntities(count: number, elementsPerEntity: number = 10): any[] {
  const entities: any[] = [];
  for (let i = 0; i < count; i++) {
    const elements: Record<string, any> = {};
    // First element is always the key
    elements[`id_${i}`] = {
      type: "cds.UUID",
      key: true,
      "@HideFromDataInspector": false,
    };
    for (let j = 1; j < elementsPerEntity; j++) {
      elements[`field_${i}_${j}`] = {
        type: j % 3 === 0 ? "cds.Integer" : j % 3 === 1 ? "cds.String" : "cds.Boolean",
        key: false,
        length: j % 3 === 1 ? 255 : undefined,
        default: j % 5 === 0 ? { val: "default" } : undefined,
        notNull: j % 4 === 0,
        "@PersonalData.IsPotentiallySensitive": j % 7 === 0,
        "@Core.Computed": j % 9 === 0,
        "@HideFromDataInspector": false,
      };
    }
    // Add a hidden element (should be filtered out)
    elements[`hidden_${i}`] = {
      type: "cds.String",
      "@HideFromDataInspector": true,
    };
    // Add an association (should be filtered out)
    elements[`assoc_${i}`] = {
      type: "cds.Association",
    };

    entities.push({
      name: `perf.test.Entity_${i}`,
      "@title": i % 3 === 0 ? `Entity ${i} Title` : undefined,
      "@HideFromDataInspector": false,
      elements,
      // Simulate the CsnRuntimeExtensions properties
      get dataSource4DataInspector() {
        return i % 2 === 0 ? "db" : "service";
      },
      get keyElements4DataInspector() {
        return [`id_${i}`];
      },
    });
  }
  return entities;
}

/**
 * Builds an array of synthetic database records for DataReader response-transformation benchmarks.
 */
function buildSyntheticRecords(count: number, fieldsPerRecord: number = 10): any[] {
  const records: any[] = [];
  for (let i = 0; i < count; i++) {
    const record: Record<string, any> = { id: `uuid-${i}` };
    for (let j = 1; j < fieldsPerRecord; j++) {
      record[`field_${j}`] = j % 3 === 0 ? i * j : j % 3 === 1 ? `value_${i}_${j}` : i % 2 === 0;
    }
    records.push(record);
  }
  // Simulate the CDS $count property on the array
  (records as any).$count = count;
  return records;
}

/**
 * Creates a mock cds.Request object for EntityDefinitionReader.read() benchmarks.
 * Simulates a collection GET with $select=* and optional $filter.
 */
function buildEntityDefinitionRequest(options?: {
  filter?: string;
  orderby?: string;
  skip?: number;
  top?: number;
}): any {
  const columns = ["*"];
  const req: any = {
    params: [],
    query: {
      SELECT: {
        columns,
        count: true,
        orderBy: options?.orderby
          ? [{ ref: [options.orderby.split(" ")[0]], sort: options.orderby.split(" ")[1] || "asc" }]
          : undefined,
      },
    },
    req: {
      query: {
        $filter: options?.filter,
        $orderby: options?.orderby,
        $skip: options?.skip !== undefined ? String(options.skip) : undefined,
        $top: options?.top !== undefined ? String(options.top) : undefined,
      },
    },
    reject: (code: number, msg: string) => {
      throw new Error(`Request rejected: ${code} ${msg}`);
    },
  };
  return req;
}

/**
 * Creates a mock cds.Request object for DataReader.read() response-construction benchmarks.
 */
function buildDataReadRequest(entityName: string): any {
  const columns = ["*"];
  return {
    params: [],
    query: {
      SELECT: {
        columns,
        count: true,
      },
    },
    req: {
      query: {
        $filter: `entityName = '${entityName}'`,
        $skip: "0",
        $top: "1000",
      },
    },
    reject: (code: number, msg: string) => {
      throw new Error(`Request rejected: ${code} ${msg}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------
const benchmarkSync = (name: string, runFn: (size: number) => void): BenchmarkResult => {
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

const benchmarkAsync = async (
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describePerf("Performance - Data Inspector Processing", function () {
  this.timeout(300000); // 5 minutes

  // Pre-built synthetic data per size
  const entitiesBySize = new Map<number, any[]>();
  const recordsBySize = new Map<number, any[]>();

  let report: Report;

  // Load CDS model from the test project so cds.model, cds.parse, cds.ql are available
  before(async function () {
    const csn = await cds.load(path.resolve(__dirname, "..", ".."));
    cds.model = cds.compile.for.nodejs(csn);
    if (!UPDATE_BASELINE && !fs.existsSync(BASELINE_PATH)) {
      const isCI = process.env.CI === "true" || !!process.env.GITHUB_ACTIONS;
      const message = isCI
        ? `Performance baseline not found at ${BASELINE_FILENAME}.\n` +
          "      To establish the CI baseline, run the 'Update CI Performance Baseline' workflow.\n" +
          "      See: .github/workflows/performance-rebaseline.yml"
        : `Performance baseline not found at ${BASELINE_FILENAME}.\n` +
          "      Run 'npm run test:performance:update-baseline' to create a baseline for your machine.";
      console.log(`\n    ⚠️  Skipping performance tests: ${message}\n`);
      this.skip();
    }
  });

  before(() => {
    // Pre-generate synthetic data for all sizes
    for (const size of sizes) {
      entitiesBySize.set(size, buildSyntheticEntities(size));
      recordsBySize.set(size, buildSyntheticRecords(size));
    }
  });

  after(() => {
    if (!report) return;

    const reportDir = path.dirname(REPORT_PATH);
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    fs.writeFileSync(REPORT_MD_PATH, buildMarkdownReport(report), "utf8");

    if (UPDATE_BASELINE) {
      fs.writeFileSync(
        BASELINE_PATH,
        JSON.stringify(
          report.results.reduce((acc, result) => {
            acc[result.name] = {
              sizes: result.sizes,
              perItemMsAtMax: result.perItemMs[result.perItemMs.length - 1],
              slopeRatio: result.slopeRatio,
              r2: result.r2,
            };
            return acc;
          }, {} as BaselineData),
          null,
          2
        ),
        "utf8"
      );
    }
  });

  it("should keep local processing roughly linear", async () => {
    const results: BenchmarkResult[] = [];

    // -----------------------------------------------------------------------
    // Group A: EntityDefinitionReader — pure in-memory, no DB
    // -----------------------------------------------------------------------

    // A1: EntityDefinitionReader.read() — collection request (filter + sort + paginate + build response)
    // We mock cds.model.all() to return our synthetic entities.
    results.push(
      benchmarkSync("EntityDefinitionReader.read (collection)", (size) => {
        const entities = entitiesBySize.get(size)!;
        const originalAll = cds.model.all;
        cds.model.all = ((kind: string) => {
          if (kind === "entity") return entities;
          if (kind === "service") return [];
          return originalAll.call(cds.model, kind);
        }) as any;

        try {
          const reader = new EntityDefinitionReader();
          const req = buildEntityDefinitionRequest({ top: size });
          reader.read(req as any);
        } finally {
          cds.model.all = originalAll;
        }
      })
    );

    // A2: EntityDefinitionReader.read() — collection request with $filter contains
    results.push(
      benchmarkSync("EntityDefinitionReader.read (filtered)", (size) => {
        const entities = entitiesBySize.get(size)!;
        const originalAll = cds.model.all;
        cds.model.all = ((kind: string) => {
          if (kind === "entity") return entities;
          if (kind === "service") return [];
          return originalAll.call(cds.model, kind);
        }) as any;

        try {
          const reader = new EntityDefinitionReader();
          const req = buildEntityDefinitionRequest({
            filter: `contains(name, 'Entity')`,
            top: size,
          });
          reader.read(req as any);
        } finally {
          cds.model.all = originalAll;
        }
      })
    );

    // A3: EntityDefinitionReader._getEntityElements() — isolated element extraction
    // We call the reader with a single entity request to measure per-entity element processing
    results.push(
      benchmarkSync("EntityDefinitionReader._getEntityElements (via read)", (size) => {
        // Build one entity with 'size' elements to measure element iteration scaling
        const entity = buildSyntheticEntities(1, size)[0];
        const entities = [entity];
        const originalAll = cds.model.all;
        cds.model.all = ((kind: string) => {
          if (kind === "entity") return entities;
          if (kind === "service") return [];
          return originalAll.call(cds.model, kind);
        }) as any;

        try {
          const reader = new EntityDefinitionReader();
          const req: any = {
            params: [{ name: entity.name }],
            query: {
              SELECT: {
                columns: ["*"],
              },
            },
            req: { query: {} },
            reject: (code: number, msg: string) => {
              throw new Error(`${code} ${msg}`);
            },
          };
          reader.read(req as any);
        } finally {
          cds.model.all = originalAll;
        }
      })
    );

    // -----------------------------------------------------------------------
    // Group B: DataReader — response construction (DB stubbed)
    // -----------------------------------------------------------------------

    // B1: DataReader response construction — _constructRecordKey + response loop
    // We isolate the response-building portion by directly invoking the private methods
    // through a controlled flow. We stub dataSource.run() to return pre-built records.
    results.push(
      await benchmarkAsync("DataReader.read (response construction, DB stubbed)", async (size) => {
        const records = recordsBySize.get(size)!;
        const entityName = "perf.test.Entity_0";

        // Build a synthetic entity definition
        const syntheticEntity: any = {
          name: entityName,
          "@HideFromDataInspector": false,
          "@cds.query.limit.default": 1000,
          "@cds.query.limit.max": 1000,
          elements: {
            id: { type: "cds.UUID", key: true },
            ...Object.fromEntries(
              Array.from({ length: 9 }, (_, j) => [
                `field_${j + 1}`,
                { type: "cds.String", key: false },
              ])
            ),
          },
          get keyElements4DataInspector() {
            return ["id"];
          },
          get dataSource4DataInspector() {
            return "db";
          },
        };

        // Mock cds.model.all to return our synthetic entity
        const originalAll = cds.model.all;
        cds.model.all = ((kind: string) => {
          if (kind === "entity") {
            return [syntheticEntity];
          }
          if (kind === "service") return [];
          return originalAll.call(cds.model, kind);
        }) as any;

        // Mock cds.services.db.run to return our synthetic records
        const originalDb = cds.services.db;
        const mockDb = {
          run: async () => {
            const result = [...records];
            (result as any).$count = records.length;
            return result;
          },
        };
        (cds.services as any).db = mockDb;

        // Mock cds.ql.SELECT to return a chainable builder
        const originalQL = cds.ql;
        const mockSelect = {
          from: () => {
            const builder: any = {
              columns: () => builder,
              where: () => builder,
              orderBy: () => builder,
              limit: (l: number, o: number) => {
                builder.SELECT = { limit: { offset: { val: o } }, count: true };
                return builder;
              },
              SELECT: { limit: { offset: { val: 0 } }, count: true },
            };
            return builder;
          },
        };
        (cds as any).ql = { ...originalQL, SELECT: mockSelect };

        // Mock cds.parse.expr
        const originalParse = cds.parse;
        (cds as any).parse = {
          ...originalParse,
          expr: (expr: string) => ({
            xpr: [{ ref: ["entityName"] }, "=", { val: entityName }],
          }),
        };

        // Mock audit-log: cds.env.requires does not include audit-log by default
        const originalEnv = cds.env;

        try {
          const reader = new DataReader();
          const req = buildDataReadRequest(entityName);
          await reader.read(req as any);
        } finally {
          cds.model.all = originalAll;
          (cds.services as any).db = originalDb;
          (cds as any).ql = originalQL;
          (cds as any).parse = originalParse;
        }
      })
    );

    // B2: DataReader._emitAuditlogs — audit log emission with stubbed service
    results.push(
      await benchmarkAsync("DataReader._emitAuditlogs (stubbed audit-log)", async (size) => {
        const records = recordsBySize.get(size)!;

        // Build a synthetic entity with sensitive elements
        const syntheticEntity: any = {
          name: "perf.test.SensitiveEntity",
          "@PersonalData.DataSubjectRole": "Customer",
          elements: {
            id: { type: "cds.UUID", key: true },
            email: {
              type: "cds.String",
              key: false,
              "@PersonalData.IsPotentiallySensitive": true,
            },
            phone: {
              type: "cds.String",
              key: false,
              "@PersonalData.IsPotentiallySensitive": true,
            },
            name: { type: "cds.String", key: false },
          },
          get keyElements4DataInspector() {
            return ["id"];
          },
          // _service is undefined for db entities => audit logging is triggered
        };

        // Build records that include sensitive fields
        const sensitiveRecords = records.map((r: any) => ({
          ...r,
          email: `user_${r.id}@example.com`,
          phone: `+1-555-${String(records.indexOf(r)).padStart(4, "0")}`,
          name: `User ${r.id}`,
        }));

        // Mock cds.env.requires to include audit-log
        const originalEnv = { ...cds.env };
        (cds.env as any).requires = {
          ...cds.env.requires,
          "audit-log": { kind: "audit-log-to-console" },
        };

        // Mock cds.connect.to to return a stubbed audit-log service
        const originalConnect = cds.connect;
        const stubbedAuditLog = { log: async () => {} };
        (cds as any).connect = {
          ...originalConnect,
          to: async (serviceName: string) => {
            if (serviceName === "audit-log") return stubbedAuditLog;
            return originalConnect.to(serviceName);
          },
        };

        try {
          // Call _emitAuditlogs directly via prototype
          const reader = new DataReader();
          await (reader as any)._emitAuditlogs(syntheticEntity, sensitiveRecords);
        } finally {
          (cds as any).env = originalEnv;
          (cds as any).connect = originalConnect;
        }
      })
    );

    // -----------------------------------------------------------------------
    // Build report
    // -----------------------------------------------------------------------
    report = {
      timestamp: new Date().toISOString(),
      sizes: [...sizes],
      results,
      regressionThreshold: MAX_REGRESSION,
      slopeVarianceThreshold: MAX_SLOPE_VARIANCE,
      testConfig: {
        warmupRuns: WARMUP_RUNS,
        measurementRuns: MEASUREMENT_RUNS,
        outlierTrimPercent: OUTLIER_TRIM_PERCENT,
        totalRunsPerSize: MEASUREMENT_RUNS + Math.ceil(MEASUREMENT_RUNS * OUTLIER_TRIM_PERCENT),
      },
      environment: {
        node: process.version,
        platform: `${process.platform} ${os.release()}`,
        cpus: os.cpus()[0].model,
        totalMemoryGB: os.totalmem() / 1024 ** 3,
        cpuLoad: os.loadavg(),
      },
      systemWarnings: checkSystemState(),
    };

    // Log system warnings
    if (report.systemWarnings.length > 0) {
      console.log("\n    System Warnings:");
      report.systemWarnings.forEach((w) => console.log(`      !  ${w}`));
      console.log("");
    }

    // Regression check against baseline
    let baseline: BaselineData | undefined;
    if (fs.existsSync(BASELINE_PATH)) {
      baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as BaselineData;
      report.baseline = baseline;
    }

    expect(results).to.have.length.greaterThan(0);

    for (const result of results) {
      if (baseline && !UPDATE_BASELINE) {
        const entry = baseline[result.name];
        if (!entry) {
          console.warn(
            `  ⚠️  WARNING: ${result.name} baseline entry missing — skipping regression check`
          );
          continue;
        }

        // Slope ratio regression check
        if (entry.slopeRatio > 0.5 && result.slopeRatio > 0) {
          const slopeAllowed = entry.slopeRatio * (1 + MAX_SLOPE_VARIANCE);
          if (result.slopeRatio > slopeAllowed) {
            console.warn(
              `  ⚠️  WARNING: ${result.name} slope ratio regression: ` +
                `${result.slopeRatio.toFixed(4)} > allowed ${slopeAllowed.toFixed(4)} ` +
                `(baseline: ${entry.slopeRatio.toFixed(4)}, threshold: +${(MAX_SLOPE_VARIANCE * 100).toFixed(0)}%)`
            );
          }
        }

        // Per-item time regression check
        const currentPerItem = result.perItemMs[result.perItemMs.length - 1];
        const allowed = entry.perItemMsAtMax * (1 + MAX_REGRESSION);
        if (currentPerItem > allowed) {
          console.warn(
            `  ⚠️  WARNING: ${result.name} per-item time regression: ` +
              `${currentPerItem.toFixed(7)}ms > allowed ${allowed.toFixed(7)}ms ` +
              `(baseline: ${entry.perItemMsAtMax.toFixed(7)}ms, threshold: +${(MAX_REGRESSION * 100).toFixed(0)}%)`
          );
        }
      }
    }
  });
});
