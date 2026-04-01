# Performance Testing Strategy — @cap-js/data-inspector

## 1. Overview

This document describes the performance testing strategy for the `@cap-js/data-inspector` CAP plugin. The strategy focuses on **local processing benchmarks** — measuring the CPU/memory cost of in-process data transformations performed by the plugin's core classes, with external I/O (database, network) stubbed out.

### Why not end-to-end?

`data-inspector` is a CDS plugin that is consumed by host CAP applications. End-to-end latency depends heavily on the host application's database, network, and authentication stack — none of which are under this plugin's control. Testing at the class/method level isolates the plugin's own computational work and produces **stable, reproducible, CI-friendly** measurements.

## 2. Product Standards Coverage

The SAP Performance Product Standards comprise 7 requirements: PERF-01, PERF-03, PERF-04, PERF-11, PERF-13, PERF-20, PERF-21. This section maps each standard to how it is addressed (or why it is not applicable) for this plugin.

### Standards addressed by this testing strategy

| Standard    | Title                                                                                                                             | How Addressed                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PERF-01** | A performance test strategy shall be in place                                                                                     | **This document itself** fulfils PERF-01. It defines the test environment (local Node.js with synthetic data, CI via GitHub Actions), test data (synthetic CDS models and records), test cases (5 benchmarks across scaling sizes), test types (unit-level regression and scaling tests), test tools (Mocha + custom measurement helpers), and test results (JSON + Markdown reports in `coverage/`). |
| **PERF-04** | Competitive average and maximum throughput or end-to-end response time for a UIS shall be planned, recorded, and verified         | Per-item processing time is recorded at each input size and compared against baseline targets. As a plugin (not a standalone UI), we measure **server-side processing time** contributed by the plugin's handlers. The benchmarks record median, mean, CI, and per-item cost, providing the "planned, recorded, and verified" data required by PERF-04.                                               |
| **PERF-11** | As long as the functionality remains identical there shall be no regression of the resource consumption for subsequent deliveries | Baseline comparison with configurable regression threshold (default 30%) for both per-item time and slope ratio. CI workflow runs on every PR. Memory delta (heap usage before/after) is tracked per benchmark to detect resource consumption regressions. Baseline drift detection script analyses git history of CI baselines to catch gradual degradation.                                         |
| **PERF-13** | Enable throughput and response time optimization by utilizing available resources for scale up and scale out                      | Slope-ratio analysis across 5 input sizes (10→1000) verifies that processing scales linearly — i.e., CPU and memory consumption grow at most linearly with input size (O(n)). R² coefficient of determination confirms linearity. This proves the plugin's processing will not become a bottleneck as CDS models grow, supporting the scalability requirement.                                        |

### Standards not applicable to this plugin (first release)

| Standard    | Title                                                                                                                               | Reason                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PERF-03** | An application or service shall be cost- and resource-consumption aware; a procedure for capacity modelling/sizing shall be defined | As a CDS plugin, `data-inspector` does not provision or consume cloud infrastructure independently. It runs within the host CAP application's process. Capacity modelling and sizing are the responsibility of the host application. The plugin's own resource footprint is characterised by the benchmarks (per-item time, memory delta), but a standalone sizing procedure is not applicable. |
| **PERF-20** | Enforce and support quota management                                                                                                | The plugin does not manage tenants, users, or request quotas. It runs as an in-process CDS service handler. Quota management (rate limiting, resource limits) is the responsibility of the host CAP application and the cloud platform (e.g., BTP). The plugin does not make independent outbound network calls that would require rate limiting.                                               |
| **PERF-21** | Enable elastic scale out/in based on demand levels, in and among clouds                                                             | Elastic scalability is an infrastructure and platform concern. The plugin is stateless and runs within the host application's Node.js process. It does not manage instances, scaling rules, or cloud resources. Horizontal/vertical scaling is handled by the CAP runtime and the deployment platform.                                                                                          |

## 3. Architecture

### 3.1 Test location

```
test/performance/
├── .mocharc.performance.json       # Mocha config (perf tests only)
├── ProcessingPerformance.test.ts   # All benchmarks
├── check-baseline-drift.js         # Long-term drift detection across git history
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

# Check for gradual drift across CI baseline git history
npm run test:performance:check-drift
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

## 7. Baseline Drift Detection

The `check-baseline-drift.js` script detects **gradual performance degradation** that no single run would catch. It reads the git history of `performance-baseline.ci.json` and analyzes how `perItemMsAtMax` values have changed across commits.

### What it detects

| Condition                                               | Default Threshold                | Severity            |
| ------------------------------------------------------- | -------------------------------- | ------------------- |
| Total per-item cost increase across the examined window | 20% (`DRIFT_MAX_TOTAL_INCREASE`) | **FAIL**            |
| Consecutive per-item cost increases                     | 3 (`DRIFT_CONSECUTIVE_WARN`)     | **WARN** (advisory) |

### How it works

1. Queries `git log` for commits that touched `performance-baseline.ci.json`
2. Loads up to 10 historical snapshots (configurable via `DRIFT_WINDOW`)
3. For each benchmark, computes total increase, consecutive-increase streak, and OLS trend slope
4. Outputs a history table and per-benchmark analysis

### Configuration (env vars)

| Variable                   | Default                                         | Description                                   |
| -------------------------- | ----------------------------------------------- | --------------------------------------------- |
| `DRIFT_BASELINE_FILE`      | `test/performance/performance-baseline.ci.json` | Git path of the baseline file to inspect      |
| `DRIFT_WINDOW`             | `10`                                            | Number of recent commits to examine           |
| `DRIFT_MAX_TOTAL_INCREASE` | `0.20`                                          | Max allowed total increase (fraction)         |
| `DRIFT_CONSECUTIVE_WARN`   | `3`                                             | Consecutive increases before advisory warning |

### When to use

- After accumulating 2+ CI baseline snapshots in git history (requires running the rebaseline workflow at least twice)
- As part of periodic performance health checks
- Before major releases, to verify no gradual cost drift has occurred

## 8. Future Enhancements

As the plugin evolves, consider adding:

1. **Memory profiling benchmarks** — Track heap growth across repeated operations to detect memory leaks (deeper PERF-11 resource consumption coverage)
2. **Concurrent simulation** — If the plugin adds stateful processing, add benchmarks that simulate concurrent request patterns
3. **Larger scale tests** — Extend the sizes array to [100, 500, 1000, 5000, 10000] if real-world deployments involve very large CDS models
4. **UI rendering benchmarks** — If the SAPUI5 frontend becomes a performance concern, add browser-based benchmarks using Puppeteer

---

## Appendix: Performance Testing 101 — Concepts & KPIs Explained

This appendix explains every statistical concept and KPI used in this testing strategy from first principles. If you've never done performance benchmarking before, start here.

---

### A.1 Why do we measure performance at all?

Software can be "correct" (produces the right answer) yet still unusable if it's too slow. Performance testing answers two questions:

1. **Does it scale?** — If the input doubles, does the time roughly double (good) or quadruple (bad)?
2. **Did it get slower?** — Compared to last week's version, is the same operation taking longer?

Question 1 is about **algorithmic complexity**. Question 2 is about **regression detection**.

---

### A.2 Big-O Notation

Big-O describes how an algorithm's cost grows as input size *n* increases:

| Notation       | Name       | Example                          | Doubling *n* does what?           |
| -------------- | ---------- | -------------------------------- | --------------------------------- |
| **O(1)**       | Constant   | Hash table lookup                | Time stays the same               |
| **O(n)**       | Linear     | Scanning every item in a list    | Time doubles                      |
| **O(n²)**      | Quadratic  | Nested loop over all pairs       | Time quadruples (4×)              |
| **O(n³)**      | Cubic      | Triple nested loop               | Time increases 8×                 |
| **O(n·log n)** | Log-linear | Good sort algorithms (mergesort) | Time roughly doubles (a bit more) |

**Our goal**: every operation in data-inspector should be **O(n)** or better. If we accidentally introduce an O(n²) algorithm (e.g., a nested loop that compares every entity to every other entity), the benchmarks will catch it.

---

### A.3 Median vs. Mean — Which "average" to use?

Both are measures of central tendency, but they behave differently with outliers:

- **Mean** (arithmetic average): Sum all values, divide by count. Sensitive to outliers — one very slow run pulls the mean up dramatically.
- **Median**: Sort all values, pick the middle one. Robust to outliers — even if one run was 100× slower, the median barely moves.

**Why we use the median for benchmark reporting**: In benchmarking, you occasionally get "hiccup" runs where the garbage collector fires, the OS scheduler intervenes, or the CPU thermal-throttles. The median naturally ignores these glitches without requiring you to manually identify and remove them.

We still report the mean (and use it internally for outlier detection), but the **median is the primary metric** in our results.

---

### A.4 Standard Deviation (σ) and Coefficient of Variation (CV%)

Imagine you time a function 20 times and get these results (in ms):

```
Run 1: 5.1    Run 2: 4.9    Run 3: 5.0    Run 4: 5.2    Run 5: 5.0   ...
```

The **mean** is 5.04ms. But how *consistent* are these numbers? That's what standard deviation tells you.

#### Standard Deviation (σ) — "How spread out are my measurements?"

Think of σ as the "average distance from the mean." Here's the intuition:

1. Take each measurement and ask: "How far is this from the mean?"
   - Run 1: |5.1 - 5.04| = 0.06
   - Run 2: |4.9 - 5.04| = 0.14
   - Run 3: |5.0 - 5.04| = 0.04
   - ...and so on for all 20 runs
2. Square those distances (so negative and positive don't cancel out)
3. Average the squared distances
4. Take the square root (to get back to the original units — milliseconds)

The result is σ. A small σ (say 0.08ms when the mean is 5ms) means your measurements are very consistent. A large σ (say 2.5ms when the mean is 5ms) means they're all over the place.

#### Coefficient of Variation (CV%) — "Is that spread *relatively* big or small?"

Here's the problem with σ alone: is σ = 2ms "good" or "bad"? It depends on context:

- If the mean is **1000ms**, then σ = 2ms is tiny (0.2% of the mean) → very stable
- If the mean is **5ms**, then σ = 2ms is huge (40% of the mean) → extremely noisy

CV% solves this by expressing σ as a percentage of the mean:

```
CV% = (σ / mean) × 100
```

This lets you compare the stability of a 5ms benchmark to a 500ms benchmark on equal footing.

**Real-world example from our tests**:
- Benchmark A: mean = 0.04ms, σ = 0.008ms → CV = 20% 🔴 (noisy — the function is so fast that GC jitter dominates)
- Benchmark B: mean = 3.85ms, σ = 0.12ms → CV = 3.1% 🟢 (stable — the function takes long enough that noise is negligible)

**Our thresholds**:

| CV%   | Indicator | Meaning                                                |
| ----- | --------- | ------------------------------------------------------ |
| ≤ 5%  | 🟢         | Stable — measurements are repeatable                   |
| 5–15% | 🟡         | Acceptable for Node.js (GC pauses cause some variance) |
| > 15% | 🔴         | High noise — consider more warmup or runs              |

---

### A.5 Confidence Interval (CI)

Imagine you measured a function 20 times and got a median of 5.23ms. If you ran those 20 measurements again tomorrow, would you get exactly 5.23ms again? Probably not — maybe 5.18ms, or 5.31ms. The **confidence interval** tells you the range where the "true" value most likely lives.

#### The analogy

Think of it like measuring your height with a wobbly ruler. You measure yourself 5 times and get: 175.2cm, 174.8cm, 175.1cm, 175.5cm, 174.9cm. You're probably not exactly 175.1cm tall, but you're pretty confident you're somewhere between 174.8cm and 175.5cm. That range is your confidence interval.

#### The math (simplified)

```
CI = ±1.96 × (σ / √n)
```

Breaking this down:
- **σ** = standard deviation (how noisy your measurements are — see A.4)
- **√n** = square root of the number of runs (more runs = narrower interval, because more data = more certainty)
- **1.96** = a magic number from statistics that gives you 95% confidence (you can think of it as "about 2")

So the formula says: *"Take the noise level (σ), shrink it by how many measurements you took (√n), and multiply by ~2."*

#### A worked example

- You measured 20 runs. Median = 5.23ms. σ = 0.22ms.
- CI = ±1.96 × (0.22 / √20) = ±1.96 × (0.22 / 4.47) = ±1.96 × 0.049 = **±0.097ms**
- So we report: **5.23ms ±0.10ms**
- Meaning: "We're 95% confident the true typical time is between 5.13ms and 5.33ms."

#### Why it matters for us

When comparing two benchmark results (e.g., before vs. after a code change), if their confidence intervals overlap, the difference is probably just measurement noise — not a real performance change. For example:
- Before: 5.23ms ±0.10ms → range [5.13, 5.33]
- After:  5.28ms ±0.12ms → range [5.16, 5.40]
- The ranges overlap heavily → **no meaningful difference** (don't panic!)

But if:
- Before: 5.23ms ±0.10ms → range [5.13, 5.33]
- After:  6.80ms ±0.15ms → range [6.65, 6.95]
- No overlap at all → **real regression** (investigate!)

---

### A.6 Outlier Trimming

Raw benchmark timings often contain outliers — unusually slow (or fast) runs caused by GC pauses, OS scheduling, background processes, etc.

**Our approach** (mean-distance trimming):
1. Run 30 iterations (20 to keep + 10 extra)
2. Compute the preliminary mean of all 30
3. For each run, compute its distance from the mean
4. Sort by distance (closest to mean first)
5. Keep the 20 closest; discard the 10 furthest

This is more nuanced than simple "remove top/bottom 10%" trimming, because it removes outliers on *both* ends that are far from the central tendency, regardless of which direction they're in.

---

### A.7 Warmup Runs

JavaScript engines (V8 in Node.js) use **Just-In-Time (JIT) compilation**. The first few calls to a function are interpreted (slow), then V8 compiles them to optimized machine code (fast). This process is called "warming up."

If you measure the first 5 runs, you're measuring the interpreter, not the optimized code that will run in production. That's why we run 10 warmup iterations (discarded) before starting measurements.

**Think of it like warming up a car engine** — you don't measure fuel efficiency during the first 30 seconds after a cold start.

---

### A.8 Slope and Slope Ratio

These are the core metrics for detecting whether an algorithm is O(n) or worse. The key idea is surprisingly simple: **if adding more items always costs the same amount of extra time, the algorithm is linear. If adding more items costs *increasingly* more time, it's not.**

#### Slope — "How much extra time does each additional item cost?"

Imagine you're timing a function with different input sizes and you get:

```
Size  10 → took  1ms
Size  50 → took  5ms
Size 100 → took 10ms
Size 500 → took 50ms
Size 1000 → took 100ms
```

The **slope** between any two points is the "price per additional item":

```
slope = (time₂ - time₁) / (size₂ - size₁)
```

For the data above:
- Between size 10→50: slope = (5 - 1) / (50 - 10) = 4 / 40 = **0.1ms per item**
- Between size 500→1000: slope = (100 - 50) / (1000 - 500) = 50 / 500 = **0.1ms per item**

The slope is the same! Each additional item always costs 0.1ms, regardless of whether you have 10 items or 1000. This is classic **O(n) linear** behavior.

Now imagine a *bad* function:

```
Size  10 → took   1ms
Size  50 → took   5ms
Size 100 → took  20ms
Size 500 → took 250ms
Size 1000 → took 1000ms
```

- Between size 10→50: slope = (5 - 1) / 40 = **0.1ms per item**
- Between size 500→1000: slope = (1000 - 250) / 500 = **1.5ms per item**

The slope grew 15× ! Adding items at large scale is much more expensive than at small scale. This screams **O(n²)**.

#### Slope Ratio — "Did the slope stay the same or grow?"

Instead of eyeballing slopes, we compute a single number:

```
slope_ratio = last_slope / first_slope
```

Using the examples above:
- Good function: 0.1 / 0.1 = **1.0** (perfect — the cost per item never changed)
- Bad function: 1.5 / 0.1 = **15.0** (terrible — the cost per item grew 15×)

**Think of it like a road trip**: If driving the first 100km takes 1 hour, and the last 100km also takes 1 hour, the "slope" (time per km) is constant — that's a straight highway (linear). If the last 100km takes 5 hours, the road got progressively worse — that's like a quadratic algorithm bogging down as data grows.

**Interpretation**:

| Slope ratio | What it means                                          | Big-O           |
| ----------- | ------------------------------------------------------ | --------------- |
| ~1.0        | Each additional item costs the same regardless of size | **O(n)**        |
| ~2.0        | Cost per item roughly doubles at larger scale          | **~O(n·log n)** |
| ~4.0+       | Cost per item grows dramatically — likely quadratic    | **O(n²)**       |
| ~10.0+      | Severe super-linear scaling                            | **O(n²)+**      |

**Our thresholds**:

| Range   | Indicator | Assessment                                       |
| ------- | --------- | ------------------------------------------------ |
| ≤ 2.0   | 🟢         | Consistent with O(n) linear scaling              |
| 2.0–4.0 | 🟡         | Suspicious — investigate for hidden nested loops |
| > 4.0   | 🔴         | Clearly non-linear (O(n²) or worse)              |

---

### A.9 R² — Coefficient of Determination

R² answers a simple question: **"If I draw the best possible straight line through my data, how well does it fit?"**

#### The school analogy

Imagine you're a teacher plotting students' study hours (x-axis) vs. exam scores (y-axis). If every student who studied twice as long scored exactly twice as high, all the dots would fall on a perfect straight line — R² = 1.0.

In reality, some students score higher or lower than the line predicts. R² tells you what fraction of the pattern is explained by the straight line vs. what fraction is "random scatter."

#### Visually

```
R² ≈ 1.0 (linear)          R² ≈ 0.7 (curved/noisy)

Time ↑                      Time ↑
     |          •                |            •
     |        •                  |        •
     |      •                    |    •
     |    •                      |          •
     |  •                        |  •
     +----------→ Size           +----------→ Size
     Points hug the line         Points curve away from the line
```

#### How it works (no math degree needed)

1. **Draw the best straight line** through your 5 data points (the computer finds the line that minimizes the total distance from all points)
2. **Measure the "misses"**: For each point, how far is it from the line? Square those distances and add them up. Call this **"unexplained scatter."**
3. **Measure the "baseline scatter"**: How far is each point from the simple average (a flat horizontal line)? Square and sum. Call this **"total scatter."**
4. **Compute R²**:

```
R² = 1 - (unexplained scatter / total scatter)
```

- If the line explains everything → unexplained scatter = 0 → R² = 1.0
- If the line explains nothing (data is random) → unexplained = total → R² = 0.0

#### What R² values mean for our benchmarks

| R²         | Meaning                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| 1.000      | All points fall exactly on a straight line — perfectly linear               |
| 0.995+     | Excellent linear fit — minor measurement noise only                         |
| 0.98–0.995 | Mostly linear with some deviation — could be noise or mild non-linearity    |
| < 0.98     | Clearly not linear — the relationship curves (quadratic, exponential, etc.) |

#### Why do we need BOTH slope ratio and R²?

They catch **different types of problems**:

**Slope ratio** only looks at the first and last segments — like checking the start and end of a road trip. **R²** looks at every point along the way.

Consider this scenario:
```
Size:  10   50   100   500   1000
Time:  1ms  5ms  30ms  50ms  100ms
```

- Slope ratio = (100-50)/(1000-500) ÷ (5-1)/(50-10) = 0.1 / 0.1 = **1.0** → looks perfect!
- But R² = **0.93** → wait, something's off!

What happened? The function has a "hump" at size 100 (30ms is way above the straight line). The slope ratio missed it because it only compared the endpoints, but R² caught it because it checks every point.

That's why we use both: **slope ratio catches endpoint divergence, R² catches mid-range curvature.**

---

### A.10 Per-Item Time

This is the simplest metric — just divide total time by input size:

```
per_item_ms = median_time_ms / size
```

For a truly O(n) algorithm, per-item time should be roughly constant regardless of size. If per-item time grows with size, you have a scaling problem.

**Per-item time at max size** (the value stored in the baseline) is the most important data point because it amplifies any scaling issues. At size 10, even an O(n²) algorithm might only add 0.001ms overhead. At size 1000, that same O(n²) adds 1.0ms — visible and measurable.

---

### A.11 Memory Delta (Heap ΔMB)

We measure `process.memoryUsage().heapUsed` before and after each benchmark:

```
ΔMB = (heapAfter - heapBefore) / (1024 × 1024)
```

This catches:
- **Hidden allocations** — Creating intermediate arrays, string concatenations, or object copies that scale with input size
- **Memory leaks** — Objects that survive garbage collection because they're accidentally retained

**Note**: JavaScript GC is non-deterministic, so memory deltas are noisier than timing measurements. They're included as an advisory signal, not a hard gate.

---

### A.12 Baseline and Regression Detection

A **baseline** is a snapshot of your benchmark results at a known-good point in time. It records, for each benchmark:
- `perItemMsAtMax` — per-item time at maximum size
- `slopeRatio` — scaling behavior
- `r2` — linearity score

**Regression detection** compares current results to the baseline:

```
allowed = baseline_value × (1 + threshold)

# Example with 30% threshold:
# If baseline per-item time = 0.005ms
# allowed = 0.005 × 1.30 = 0.0065ms
# If current = 0.007ms → REGRESSION WARNING
```

**Why 30% threshold?** Benchmark noise on shared CI runners (GitHub Actions) typically causes 5–15% variance. A 30% threshold means only genuine code-level regressions trigger warnings, not hardware noise.

---

### A.13 Putting It All Together — Reading a Result Row

Here's how to read a line from the performance report:

```
| EntityDefReader.read | 0.05, 0.19, 0.38, 1.92, 3.85 | 4.2% 🟢 | 0.0050, 0.0038, 0.0038, 0.0038, 0.0039 | 0.12, 0.15, 0.18, 0.22, 0.25 | 1.0234 🟢 | 0.9998 🟢 | 0.0040 | 1.0100 | 0.9995 |
```

Reading left to right:
1. **Timings** [0.05→3.85ms]: Time grows ~77× as input grows 100× → slightly sub-linear (good)
2. **CV% 4.2% 🟢**: Low variance — stable measurements
3. **Per-item** [0.005→0.0039ms]: Cost per item stays flat → O(n) confirmed
4. **Memory** [0.12→0.25MB]: Slight growth — proportional to input (expected)
5. **Slope ratio 1.0234 🟢**: Almost exactly 1.0 → perfectly linear
6. **R² 0.9998 🟢**: Nearly perfect straight line
7. **Baseline columns**: Previous per-item=0.004ms, slope=1.01, R²=0.9995 — no regression

**Verdict**: This benchmark is healthy — linear scaling, stable measurements, no regression.

---

### A.14 Quick Reference: All Emoji Indicators

| Metric      | 🟢 Good  | 🟡 Watch       | 🔴 Problem |
| ----------- | ------- | ------------- | --------- |
| Slope ratio | ≤ 2.0   | 2.0 – 4.0     | > 4.0     |
| R²          | ≥ 0.995 | 0.980 – 0.995 | < 0.980   |
| CV%         | ≤ 5%    | 5% – 15%      | > 15%     |

### A.15 Glossary

| Term                    | Definition                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| **Benchmark**           | A controlled, repeatable experiment measuring one specific operation                                   |
| **Warmup**              | Discarded initial runs that let the JIT compiler optimize the code path                                |
| **Outlier**             | A measurement far from the typical value, usually caused by GC/OS interference                         |
| **Trimming**            | Removing outlier measurements before computing statistics                                              |
| **Median**              | The middle value when measurements are sorted; our primary metric                                      |
| **Mean**                | The arithmetic average of all measurements                                                             |
| **Standard deviation**  | How spread out measurements are from the mean                                                          |
| **CV%**                 | Standard deviation as a percentage of the mean — normalized measure of noise                           |
| **Confidence interval** | Range within which the true value likely falls (95% probability)                                       |
| **Slope**               | Rate of time change per unit of input size between two measurement points                              |
| **Slope ratio**         | Last slope ÷ first slope; 1.0 = perfectly linear growth                                                |
| **R²**                  | Coefficient of determination; 1.0 = data falls perfectly on a straight line                            |
| **Per-item time**       | Total time ÷ input size; should stay constant for O(n) algorithms                                      |
| **Baseline**            | Stored snapshot of benchmark results used as the reference for regression detection                    |
| **Regression**          | A statistically significant increase in cost compared to the baseline                                  |
| **Drift**               | Gradual, incremental performance degradation across many commits (no single commit triggers a warning) |
| **Heap delta**          | Change in V8 heap memory usage during a benchmark run                                                  |
| **JIT**                 | Just-In-Time compilation — V8's process of compiling JavaScript to machine code at runtime             |
| **GC**                  | Garbage Collection — V8's automatic memory reclamation process                                         |
