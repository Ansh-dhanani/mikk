# Mikk Performance Benchmark Report

**Generated:** 2026-03-21T05:33:45.588Z

## Summary

| Metric | With Mikk | Manual | Improvement |
|--------|-----------|--------|-------------|
| Avg Time | 0ms | 219ms | **99.9% faster** |
| Accuracy | 95.0% | 80.0% | **+15.0%** |

## Detailed Results

### Explore Graph Builder Module

| Mode | Duration | Commands | Accuracy |
|------|----------|----------|----------|
| with-mikk | 1ms | 3 | 95% |
| manual | 297ms | 3 | 80% |

**Time Comparison:**

```
With Mikk   1ms
Manual     ████████████████████████████████████████ 297ms
```

### Find All Usages of 'hash'

| Mode | Duration | Commands | Accuracy |
|------|----------|----------|----------|
| with-mikk | 0ms | 2 | 95% |
| manual | 260ms | 2 | 80% |

**Time Comparison:**

```
With Mikk   0ms
Manual     ████████████████████████████████████████ 260ms
```

### Analyze Impact of Changing 'getSessionContext'

| Mode | Duration | Commands | Accuracy |
|------|----------|----------|----------|
| with-mikk | 0ms | 3 | 95% |
| manual | 202ms | 2 | 80% |

**Time Comparison:**

```
With Mikk   0ms
Manual     ████████████████████████████████████████ 202ms
```

### Find Dead Code

| Mode | Duration | Commands | Accuracy |
|------|----------|----------|----------|
| with-mikk | 0ms | 1 | 95% |
| manual | 116ms | 2 | 80% |

**Time Comparison:**

```
With Mikk   0ms
Manual     ████████████████████████████████████████ 116ms
```

## Recording Files

- Explore Graph Builder Module (with-mikk): `C:\Users\Ansh\Desktop\web\Mesh\benchmarks\recordings\explore-graph-builder-with-mikk.cast`
- Explore Graph Builder Module (manual): `C:\Users\Ansh\Desktop\web\Mesh\benchmarks\recordings\explore-graph-builder-manual.cast`
- Find All Usages of 'hash' (with-mikk): `C:\Users\Ansh\Desktop\web\Mesh\benchmarks\recordings\find-usages-with-mikk.cast`
- Find All Usages of 'hash' (manual): `C:\Users\Ansh\Desktop\web\Mesh\benchmarks\recordings\find-usages-manual.cast`
- Analyze Impact of Changing 'getSessionContext' (with-mikk): `C:\Users\Ansh\Desktop\web\Mesh\benchmarks\recordings\impact-analysis-with-mikk.cast`
- Analyze Impact of Changing 'getSessionContext' (manual): `C:\Users\Ansh\Desktop\web\Mesh\benchmarks\recordings\impact-analysis-manual.cast`
- Find Dead Code (with-mikk): `C:\Users\Ansh\Desktop\web\Mesh\benchmarks\recordings\dead-code-with-mikk.cast`
- Find Dead Code (manual): `C:\Users\Ansh\Desktop\web\Mesh\benchmarks\recordings\dead-code-manual.cast`
