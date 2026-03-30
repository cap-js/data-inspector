# Performance Testing Strategy — @cap-js/data-inspector

## 1. Overview

This document describes the performance testing strategy for the `@cap-js/data-inspector` CAP plugin. The strategy focuses on **local processing benchmarks** — measuring the CPU/memory cost of in-process data transformations performed by the plugin's core classes, with external I/O (database, network) stubbed out.

### Why not end-to-end?

`data-inspector` is a CDS plugin that is consumed by host CAP applications. End-to-end latency depends heavily on the host application's database, network, and authentication stack — none of which are under this plugin's control. Testing at the class/method level isolates the plugin's own computational work and produces **stable, reproducible, CI-friendly** measurements.

## 2. Product Standards Coverage

This testing strategy addresses the following SAP Performance Product Standards:

| Standard    | Title                               | How Addressed                                                                                                                                                                                     |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PERF-01** | Prohibit quadratic or worse scaling | Slope-ratio analysis across 5 input sizes (10→1000) detects O(n²) growth patterns. R² coefficient verifies linearity.                                                                             |
| **PERF-03** | Monitor for performance regressions | Baseline comparison with configurable regression threshold (default 30%). CI workflow runs on every PR.                                                                                           |
| **PERF-05** | Avoid hidden allocations            | Memory delta tracking (heap usage before/after) per benchmark identifies unexpected allocation growth.                                                                                            |
| **PERF-11** | Use caching where appropriate       | Caching effectiveness is indirectly validated via EntityDefinitionReader benchmarks — repeated entity reads exercise the WeakMap cache in CsnRuntimeExtensions; per-item cost should remain flat. |

### Standards not applicable to first release

| Standard    | Title                           | Reason                                                                                                  |
| ----------- | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **PERF-07** | Network round-trip optimization | Plugin does not make outbound network calls; DB access is delegated to the CAP runtime.                 |
| **PERF-09** | Concurrent request handling     | As a CDS service handler plugin, concurrency is managed by the CAP Node.js runtime, not by this plugin. |

## 3. Architecture

### 3.1 Test location

```
test/performance/
├── .mocharc.performance.json       # Mocha config (perf tests only)
├── ProcessingPerformance.test.ts   # All benchmarks
├── performance-baseline.json       # Local developer baseline (gitignored)
├── performance-baseline.ci.json    # CI baseline (committed to repo)
└── PERFORMANCE-TESTING-STRATEGY.md # This file
```

### 3.2 What is benchmarked

| Group  | Benchmark                                              | What it measures                                                                                                                  |
| ------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | `EntityDefinitionReader.read (collection)`             | Full collection read: iterate entities, build element metadata, filter hidden entities, paginate, sort, construct response        |
| **A2** | `EntityDefinitionReader.read (filtered)`               | Same as A1 but with `$filter=contains(name, ...)` to measure filter parsing overhead                                              |
| **A3** | `EntityDefinitionReader._getEntityElements (via read)` | Element extraction scaling: one entity with N elements (N = 10→1000)                                                              |
| **B1** | `DataReader.read (response construction, DB stubbed)`  | Response loop after DB query: entity resolution, key construction, record transformation. DB returns pre-built synthetic records. |
| **B2** | `DataReader._emitAuditlogs (stubbed audit-log)`        | Audit log emission with sensitive data fields. Audit-log service is stubbed; measures per-record processing overhead.             |

### 3.3 Measurement methodology

For each benchmark, measurements are taken across 5 input sizes: **10, 50, 100, 500, 1000**.

For each size:
1. **Warmup** — 10 runs (configurable) to stabilize JIT
2. **Measurement** — 30 total runs (20 kept + 10 extra for outlier trimming)
3. **Outlier removal** — Runs are sorted by distance from preliminary mean; the 50% extra runs furthest from the mean are discarded
4. **Statistics** — Median, mean, standard deviation, 95% confidence interval, CV%

### 3.4 Scaling analysis

Three complementary metrics detect non-linear scaling:

| Metric                                | What it detects                                            | Threshold                            |
| ------------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| **Slope ratio**                       | Ratio of last slope segment to first. O(n) = ~1.0          | 🟢 ≤ 2.0 / 🟡 2.0–4.0 / 🔴 > 4.0        |
| **R² (coefficient of determination)** | How well medians fit a straight line. 1.0 = perfect linear | 🟢 ≥ 0.995 / 🟡 0.98–0.995 / 🔴 < 0.98  |
| **Per-item time**                     | Time per item at max size; detects absolute overhead       | Compared to baseline (30% tolerance) |

### 3.5 Baseline management

Two baselines are maintained, following the same pattern as `ai-log-analyzer`:

| File                           | Git status     | Purpose                                     |
| ------------------------------ | -------------- | ------------------------------------------- |
| `performance-baseline.json`    | **gitignored** | Local developer baseline (machine-specific) |
| `performance-baseline.ci.json` | **committed**  | CI baseline (shared, versioned reference)   |

- **Local**: Run `npm run test:performance:update-baseline` to create `performance-baseline.json` for your machine
- **CI**: The rebaseline workflow (`performance-rebaseline.yml`) runs benchmarks on CI hardware and commits `performance-baseline.ci.json` back to the repo. The PR workflow reads this committed file via `PERF_BASELINE_FILE=performance-baseline.ci.json`
- Local baselines are **machine-specific** (gitignored) because absolute timings vary by hardware
- The CI baseline is **committed** so it is reproducible, auditable via `git log`, and immune to cache eviction
- The first run without a baseline gracefully skips (no failure)

### 3.6 Regression detection

When a baseline exists, each benchmark result is compared:

1. **Per-item time** at maximum size must not exceed `baseline × (1 + MAX_REGRESSION)` (default: +30%)
2. **Slope ratio** must not exceed `baseline × (1 + MAX_SLOPE_VARIANCE)` (default: +30%)

#### Warn-only behavior (by design)

Regressions are surfaced via `console.warn` — **they do not fail the test**. The test only fails if no benchmarks run at all. This is intentional and consistent with [ai-log-analyzer](https://github.tools.sap/erp4sme/ai-log-analyzer)'s approach, for the following reasons:

- **CI hardware variance**: GitHub Actions shared runners have noisy neighbors, variable CPU clock speeds, and occasional GC pauses. Even with a 30% threshold and outlier trimming, hard failures would produce flaky CI.
- **Primary value is scaling detection**: The slope ratio and R² metrics detect O(n²) bugs, which produce dramatic regressions (10x+). These are obvious even in warn-only mode.
- **Per-item regression is informational**: Absolute timing depends on hardware; a 30% regression on CI may not reproduce locally.

Warnings appear in the CI console output and in the performance report files (`coverage/performance-report.md`), so PR reviewers can investigate if they see them.

#### Evolving to a hard gate (future)

If a hard gate is desired in the future:
1. Change `console.warn` to `expect` assertions in the regression checks
2. Consider increasing the threshold to 50% for CI to absorb more noise
3. Alternatively, add a separate CI job with `continue-on-error: true` so it shows as a yellow check (not a red X) — signaling "review needed" without blocking merge

## 4. Running the Tests

### Local development

```bash
# First time: create your machine's baseline
npm run test:performance:update-baseline

# Subsequent runs: compare against baseline
npm run test:performance
```

### Environment variables

| Variable                    | Default                     | Description                                    |
| --------------------------- | --------------------------- | ---------------------------------------------- |
| `PERF_TESTS`                | `0`                         | Set to `1` to enable performance tests         |
| `PERF_UPDATE_BASELINE`      | `0`                         | Set to `1` to write new baseline after run     |
| `PERF_MAX_REGRESSION`       | `0.3`                       | Maximum allowed per-item time regression (30%) |
| `PERF_MAX_SLOPE_VARIANCE`   | `0.3`                       | Maximum allowed slope ratio increase (30%)     |
| `PERF_WARMUP_RUNS`          | `10`                        | Warmup iterations before measurement           |
| `PERF_MEASUREMENT_RUNS`     | `20`                        | Measurement iterations (kept after trimming)   |
| `PERF_OUTLIER_TRIM_PERCENT` | `0.5`                       | Extra runs as fraction of measurement runs     |
| `PERF_BASELINE_FILE`        | `performance-baseline.json` | Baseline filename                              |

### CI workflows

| Workflow                     | Trigger                                                  | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `performance-tests.yml`      | PR to `main` (when srv/, lib/, test/performance/ change) | Run benchmarks, compare to committed CI baseline, log warnings |
| `performance-rebaseline.yml` | Manual dispatch                                          | Run benchmarks on CI and commit `performance-baseline.ci.json` |

## 5. Reports

After each run, two report files are generated in `coverage/`:

- **`performance-report.json`** — Machine-readable full results
- **`performance-report.md`** — Human-readable markdown with emoji indicators

The markdown report includes:
- Environment details (Node version, CPU, memory, load)
- Test configuration (warmup, measurement, trim settings)
- System warnings (high CPU load, memory pressure)
- Results table with timing medians, CV%, per-item times, memory deltas, slope ratios, R², and baseline comparisons
- Legend explaining all indicators

## 6. Synthetic Data Design

All benchmarks use **synthetic data** rather than real CDS models:

- **Entities**: Generated with configurable element counts, including keys, typed fields, hidden elements, associations, and various annotations (`@HideFromDataInspector`, `@PersonalData.IsPotentiallySensitive`, `@Core.Computed`)
- **Records**: Generated with configurable field counts, simulating realistic DB query results with UUIDs, strings, integers, and booleans
- **CDS Runtime**: `cds.model.all()`, `cds.services.db.run()`, `cds.parse.expr()`, and `cds.connect.to()` are monkey-patched per benchmark to return synthetic data, isolating the plugin's processing from actual CDS bootstrapping

This approach ensures:
- No dependency on database state
- Deterministic, reproducible inputs
- Configurable scaling (the `sizes` array can be adjusted)
- Fast execution (no CDS server boot required)

## 7. Future Enhancements

As the plugin evolves, consider adding:

1. **Memory profiling benchmarks** — Track heap growth across repeated operations to detect memory leaks (PERF-05 deeper coverage)
2. **Concurrent simulation** — If the plugin adds stateful processing, add benchmarks that simulate concurrent request patterns
3. **Larger scale tests** — Extend the sizes array to [100, 500, 1000, 5000, 10000] if real-world deployments involve very large CDS models
4. **UI rendering benchmarks** — If the SAPUI5 frontend becomes a performance concern, add browser-based benchmarks using Puppeteer