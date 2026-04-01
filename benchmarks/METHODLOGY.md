# Unbiased Mikk Benchmark Methodology

## Overview

This document defines how to benchmark Mikk **fairly and without bias**. The key principle: **test what Mikk actually does, not what you wish it did**.

## Core Principle: The Right Benchmark

Mikk is a **pre-edit intelligence layer** — it provides architectural context *before* you write code. Benchmarking it on end-to-end coding tasks (like SWE-bench) is like testing a map by asking "did you reach the destination?" instead of "was the route accurate?".

### What Mikk Does (Measure These)

| Capability | Description |
|------------|-------------|
| **Impact Analysis** | Given a file change, what will break? |
| **Dead Code Detection** | Which functions are truly unused? |
| **Function Search** | Find relevant functions by keyword/semantic query |
| **Constraint Checking** | Do imports respect architectural rules? |
| **Context Building** | Distill relevant code into token budgets |

### What Mikk Does NOT Do (Don't Measure These)

- **Code generation** — Mikk provides context, not patches
- **Test execution** — Mikk analyzes structure, not runtime behavior
- **Bug fixing** — Mikk finds impact, doesn't suggest fixes

## Benchmark Architecture

### 1. Ground Truth Validation

Every benchmark compares against **manually verified ground truth**:

```
Test Project (ts-express-api)
├── src/
│   ├── auth/jwt.ts         # verifyToken() [has 3 callers]
│   ├── utils/helpers.ts    # oldHelper() [truly dead]
│   └── ...
├── GROUND_TRUTH.md         # Human-verified correct answers
└── mikk.lock.json          # Mikk's analysis
```

**Ground truth includes:**
- Dead functions (verified: no importers, not tests, not constructors)
- Impact chains (verified: trace actual call graphs)
- Search relevance (human-curated: these functions answer this query)

### 2. Metrics That Matter

| Metric | Formula | Why It Matters |
|--------|---------|----------------|
| **Precision** | TP / (TP + FP) | Of functions flagged as dead, how many truly are? |
| **Recall** | TP / (TP + FN) | Of truly dead functions, how many did we find? |
| **F1 Score** | 2 * (P * R) / (P + R) | Balanced measure of accuracy |
| **Token Efficiency** | Coverage / Tokens | How much relevant context per token |

### 3. Baseline Comparisons

Compare against realistic alternatives, not strawmen:

| Approach | Description | Fair Comparison? |
|----------|-------------|------------------|
| **Text Search** (`grep`) | String matching on function names | Yes — baseline everyone has |
| **Manual Analysis** | Human reading files | Yes — ground truth |
| **RAG/Semantic** | Vector search embeddings | Yes — competitor approach |
| **Compiler API** | TS compiler type checking | Yes — precision comparison |
| **End-to-end agent** | Full SWE-bench | **No** — tests coding, not context |

## Test Suite Structure

### Test A: Dead Code Detection

**Ground Truth Creation:**
1. Find all functions with zero `calledBy` in lock file
2. **Manual verification:** Exclude tests, constructors, exports, route handlers
3. Result: Hand-curated list of "truly dead" functions

**Benchmark Run:**
```
Mikk detects: [oldHelper, unusedUtil, ...]
Ground truth: [oldHelper, unusedUtil, formatBytes, ...]

Precision = 2/2 = 100% (no false positives)
Recall = 2/3 = 67% (missed formatBytes)
F1 = 0.80
```

### Test B: Impact Analysis

**Ground Truth Creation:**
1. Pick 5 significant functions across the codebase
2. **Manual verification:** Trace all call chains (forward + reverse)
3. Document: "If X changes, Y, Z, W will break"

**Benchmark Run:**
```
Change: verifyToken() in auth/jwt.ts
Mikk impacts: [middleware/auth.ts, users/controller.ts, admin/routes.ts]
Ground truth: [middleware/auth.ts, users/controller.ts, admin/routes.ts]

Precision = 3/3 = 100%
Recall = 3/3 = 100%
```

### Test C: Function Search

**Ground Truth Creation:**
1. Create 10 natural language queries
2. **Manual curation:** Rank functions by relevance (exact → related → unrelated)
3. Document: For query "verify jwt", these 5 functions are relevant

**Benchmark Run:**
```
Query: "verify jwt token"
Mikk top 5: [verifyToken, validateToken, checkAuth, signToken, formatDate]
Ground truth: [verifyToken, validateToken, checkAuth, signToken]

Precision@5 = 4/5 = 80% (formatDate is false positive)
Recall@5 = 4/4 = 100% (found all relevant)
```

### Test D: Token Efficiency

**Measurement:**
```
Task: "Explain authentication flow"

Naive approach: Read 10 files × 200 lines × 5 tokens/line = 10,000 tokens
Mikk approach: BFS traversal with 4000 token budget = 4,000 tokens
Coverage: Mikk includes 80% of relevant functions

Efficiency: 80% coverage / 4000 tokens = 0.0002 coverage/token
Baseline: 100% coverage / 10000 tokens = 0.0001 coverage/token

Mikk is 2x more efficient
```

## Projects for Testing

| Project | Language | Size | Ground Truth | Purpose |
|---------|----------|------|--------------|---------|
| `ts-express-api` | TypeScript | Small | Full | Baseline accuracy |
| `go-service` | Go | Small | Full | Multi-language |
| `mikk` (self) | TypeScript | Large | Sample | Scale test |

## Running the Benchmark

```bash
# 1. Ensure all test projects are initialized
cd mikk-test/ts-express-api && mikk init
cd ../go-service && mikk init

# 2. Run ground truth validation
cd ../../Mesh/benchmarks
bun run unbiased-benchmark-suite.ts

# 3. Results are in results/unbiased-benchmark-results.json
```

## Interpreting Results

### What "Good" Looks Like

| Metric | Good | Excellent | Notes |
|--------|------|-----------|-------|
| Dead Code Precision | >90% | >95% | Few false positives |
| Dead Code Recall | >85% | >95% | Finds most dead code |
| Impact Precision | >85% | >95% | Doesn't over-predict |
| Impact Recall | >90% | >98% | Doesn't miss breaks |
| Search Precision@5 | >80% | >90% | Top results relevant |
| Token Efficiency | >1.5x | >3x | Vs naive file reading |

### What "Bad" Looks Like

- **Precision <70%**: Too many false positives
- **Recall <70%**: Missing real issues
- **Efficiency <1.0x**: Worse than naive approach

## Avoiding Benchmark Gaming

### Don't Do These

1. **Cherry-pick test cases** — Use representative samples
2. **Tune on test data** — Hyperparameters should be fixed
3. **Compare to strawmen** — Use real tools as baselines
4. **Report only F1** — Show precision AND recall separately
5. **Single project testing** — Test across different codebases

### Do These

1. **Publish raw results** — JSON output with all test cases
2. **Manual verification** — Ground truth is human-reviewed
3. **Confidence intervals** — Run multiple times, report variance
4. **Ablation studies** — Show which features contribute
5. **Replication package** — Others can run the same benchmark

## Comparison with Other Tools

### How to Compare Fairly

| Tool | Mikk's Advantage | Mikk's Disadvantage |
|------|------------------|---------------------|
| **Grep/Text Search** | Understands call graphs, not just text | Slower initial analysis |
| **GitNexus** | Local, deterministic, no cloud dependency | Smaller community |
| **RAG (Vector Search)** | Precise AST edges, not semantic similarity | Requires re-analysis on change |
| **IDE Language Server** | Cross-file impact, architectural constraints | Less granular than LSP |
| **SWE-bench Agent** | Pre-edit safety vs post-edit failure | Different problem scope |

## Publishing Results

### Minimum Viable Report

```
# Mikk Benchmark Results

Date: 2024-03-15
Mikk Version: 2.0.10
Test Projects: ts-express-api, go-service, mikk (sample)

## Dead Code Detection
- Precision: 94.2% (confidence: ±3.1%)
- Recall: 88.7% (confidence: ±4.2%)
- F1: 91.3%

## Impact Analysis
- Precision: 91.5% (confidence: ±2.8%)
- Recall: 96.2% (confidence: ±2.1%)
- F1: 93.8%

## Token Efficiency
- Naive baseline: 12,450 tokens
- Mikk: 3,200 tokens
- Efficiency gain: 3.9x

## Raw Data
- See: results/unbiased-benchmark-results.json
- Ground truth: ground-truth.ts
```

## Conclusion

Fair benchmarking requires:
1. **Ground truth** — Human-verified correct answers
2. **Appropriate metrics** — Precision/recall for detection tasks
3. **Real baselines** — Compare to actual alternatives
4. **Multiple projects** — Not just one codebase
5. **Transparency** — Publish raw results and methodology

This methodology ensures Mikk is evaluated on what it actually does: providing accurate, efficient, architectural intelligence before you edit code.
