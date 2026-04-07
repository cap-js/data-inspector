/**
 * Performance benchmarks for @cap-js/data-inspector.
 *
 * Measures local processing cost of EntityDefinitionReader and DataReader
 * across multiple input sizes (10→1000) to detect non-linear scaling and
 * regressions against a stored baseline.
 *
 * Run:
 *   npm run test:performance              # compare against baseline
 *   npm run test:performance:update-baseline  # create/update baseline
 *
 * See PERFORMANCE-TESTING-STRATEGY.md for full documentation.
 */

import cds from "@sap/cds";
import fs from "fs";
import path from "path";
import os from "os";
import { expect } from "chai";

import { EntityDefinitionReader } from "../../srv/EntityDefinitionReader";
import { DataReader } from "../../srv/DataReader";

import {
  type BenchmarkResult,
  type BaselineData,
  type Report,
  sizes,
  checkSystemState,
  benchmarkSync,
  benchmarkAsync,
  buildMarkdownReport,
  buildSyntheticEntities,
  buildSyntheticRecords,
  buildEntityDefinitionRequest,
  buildDataReadRequest,
} from "./helpers";

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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describePerf("Performance - Data Inspector Processing", function () {
  this.timeout(300000); // 5 minutes

  /** Pre-built synthetic data per size (populated in before hook). */
  const entitiesBySize = new Map<number, any[]>();
  const recordsBySize = new Map<number, any[]>();

  let report: Report;

  // Load CDS model so cds.model, cds.parse, cds.ql are available
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

  // Pre-generate synthetic data for all sizes
  before(() => {
    for (const size of sizes) {
      entitiesBySize.set(size, buildSyntheticEntities(size));
      recordsBySize.set(size, buildSyntheticRecords(size));
    }
  });

  // Write reports and optionally update baseline after all benchmarks
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

    // -------------------------------------------------------------------
    // Group A: EntityDefinitionReader — pure in-memory, no DB
    // -------------------------------------------------------------------

    // A1: Collection read — iterate entities, build metadata, paginate, sort
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

    // A2: Collection read with $filter — measures filter parsing overhead
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

    // A3: Element extraction — one entity with N elements (N = 10→1000)
    results.push(
      benchmarkSync("EntityDefinitionReader._getEntityElements (via read)", (size) => {
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
            query: { SELECT: { columns: ["*"] } },
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

    // -------------------------------------------------------------------
    // Group B: DataReader — response construction (DB stubbed)
    // -------------------------------------------------------------------

    // B1: Response loop — entity resolution, key construction, record transformation
    results.push(
      await benchmarkAsync("DataReader.read (response construction, DB stubbed)", async (size) => {
        const records = recordsBySize.get(size)!;
        const entityName = "perf.test.Entity_0";

        const syntheticEntity = buildSyntheticEntityForDataReader(entityName);

        // Stub cds.model.all
        const originalAll = cds.model.all;
        cds.model.all = ((kind: string) => {
          if (kind === "entity") return [syntheticEntity];
          if (kind === "service") return [];
          return originalAll.call(cds.model, kind);
        }) as any;

        // Stub cds.services.db.run → return synthetic records
        const originalDb = cds.services.db;
        (cds.services as any).db = {
          run: async () => {
            const result = [...records];
            (result as any).$count = records.length;
            return result;
          },
        };

        // Stub cds.ql.SELECT → chainable builder
        const originalQL = cds.ql;
        (cds as any).ql = {
          ...originalQL,
          SELECT: {
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
          },
        };

        // Stub cds.parse.expr
        const originalParse = cds.parse;
        (cds as any).parse = {
          ...originalParse,
          expr: () => ({
            xpr: [{ ref: ["entityName"] }, "=", { val: entityName }],
          }),
        };

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

    // B2: Audit log emission — sensitive data fields, stubbed audit-log service
    results.push(
      await benchmarkAsync("DataReader._emitAuditlogs (stubbed audit-log)", async (size) => {
        const records = recordsBySize.get(size)!;

        const syntheticEntity: any = {
          name: "perf.test.SensitiveEntity",
          "@PersonalData.DataSubjectRole": "Customer",
          elements: {
            id: { type: "cds.UUID", key: true },
            email: { type: "cds.String", key: false, "@PersonalData.IsPotentiallySensitive": true },
            phone: { type: "cds.String", key: false, "@PersonalData.IsPotentiallySensitive": true },
            name: { type: "cds.String", key: false },
          },
          get keyElements4DataInspector() {
            return ["id"];
          },
        };

        const sensitiveRecords = records.map((r: any) => ({
          ...r,
          email: `user_${r.id}@example.com`,
          phone: `+1-555-${String(records.indexOf(r)).padStart(4, "0")}`,
          name: `User ${r.id}`,
        }));

        // Stub cds.env.requires to include audit-log
        const originalEnv = { ...cds.env };
        (cds.env as any).requires = {
          ...cds.env.requires,
          "audit-log": { kind: "audit-log-to-console" },
        };

        // Stub cds.connect.to → return stubbed audit-log service
        const originalConnect = cds.connect;
        (cds as any).connect = {
          ...originalConnect,
          to: async (serviceName: string) => {
            if (serviceName === "audit-log") return { log: async () => {} };
            return originalConnect.to(serviceName);
          },
        };

        try {
          const reader = new DataReader();
          await (reader as any)._emitAuditlogs(syntheticEntity, sensitiveRecords);
        } finally {
          (cds as any).env = originalEnv;
          (cds as any).connect = originalConnect;
        }
      })
    );

    // -------------------------------------------------------------------
    // Build report and check regressions
    // -------------------------------------------------------------------
    report = buildReport(results);

    if (report.systemWarnings.length > 0) {
      console.log("\n    System Warnings:");
      report.systemWarnings.forEach((w) => console.log(`      !  ${w}`));
      console.log("");
    }

    // Load baseline and check for regressions
    let baseline: BaselineData | undefined;
    if (fs.existsSync(BASELINE_PATH)) {
      baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as BaselineData;
      report.baseline = baseline;
    }

    expect(results).to.have.length.greaterThan(0);
    checkRegressions(results, baseline);
  });
});

// ---------------------------------------------------------------------------
// Helpers (test-specific, not reusable across projects)
// ---------------------------------------------------------------------------

/** Builds the Report object from benchmark results and current environment. */
function buildReport(results: BenchmarkResult[]): Report {
  return {
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
}

/**
 * Checks each result against the baseline and emits warnings for regressions.
 * Warnings are advisory only — they do not fail the test (see strategy doc §6).
 */
function checkRegressions(results: BenchmarkResult[], baseline?: BaselineData): void {
  if (!baseline || UPDATE_BASELINE) return;

  for (const result of results) {
    const entry = baseline[result.name];
    if (!entry) {
      console.warn(
        `  ⚠️  WARNING: ${result.name} baseline entry missing — skipping regression check`
      );
      continue;
    }

    // Slope ratio regression
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

    // Per-item time regression
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

/** Builds a synthetic entity definition for DataReader benchmarks (B1). */
function buildSyntheticEntityForDataReader(entityName: string): any {
  return {
    name: entityName,
    "@HideFromDataInspector": false,
    "@cds.query.limit.default": 1000,
    "@cds.query.limit.max": 1000,
    elements: {
      id: { type: "cds.UUID", key: true },
      ...Object.fromEntries(
        Array.from({ length: 9 }, (_, j) => [`field_${j + 1}`, { type: "cds.String", key: false }])
      ),
    },
    get keyElements4DataInspector() {
      return ["id"];
    },
    get dataSource4DataInspector() {
      return "db";
    },
  };
}
