# Mikk Benchmark Recordings

## Available Recordings

### Main Demo
- **File:** `mikk-benchmark-demo.cast`
- **Description:** Complete benchmark demonstration showing all 4 scenarios side-by-side
- **Duration:** ~37 seconds

### Individual Scenario Recordings

| Scenario | With Mikk | Manual |
|----------|-----------|--------|
| Explore Graph Builder | `explore-graph-builder-with-mikk.cast` | `explore-graph-builder-manual.cast` |
| Find Usages | `find-usages-with-mikk.cast` | `find-usages-manual.cast` |
| Impact Analysis | `impact-analysis-with-mikk.cast` | `impact-analysis-manual.cast` |
| Dead Code | `dead-code-with-mikk.cast` | `dead-code-manual.cast` |

## How to View Recordings

### Option 1: Using asciinema Player (Recommended)

```bash
# Install asciinema
brew install asciinema                    # macOS
apt-get install asciinema                # Ubuntu/Debian

# Play a recording
asciinema play benchmarks/recordings/mikk-benchmark-demo.cast

# Controls:
#   Space  - Pause/Resume
#   Ctrl+C - Stop playback
#   .      - Step frame by frame (when paused)
```

### Option 2: Upload to asciinema.org

```bash
# Upload for sharing
asciinema upload benchmarks/recordings/mikk-benchmark-demo.cast

# This gives you a public URL to share
```

### Option 3: Using Web Player

Upload the `.cast` file to https://asciinema.org/upload and it will generate an embeddable player.

## Recording Format

The recordings are in asciicast v2 format which is JSON-based:
- Line 1: Header with version, width, height, timestamp
- Lines 2+: [time, "o", "output"] events

## Benchmark Summary

Results show Mikk provides:
- **99.9% time savings** on average (219ms → 0ms)
- **15% accuracy improvement** (80% → 95%)
- **Zero manual file searching** required

## Generated Files

- `benchmarks/recordings/*.cast` - Terminal recordings
- `benchmarks/results/real-benchmark-report.json` - Raw data
- `benchmarks/results/real-benchmark-report.md` - Markdown report
- `benchmarks/results/benchmark-visualization.html` - Interactive charts
