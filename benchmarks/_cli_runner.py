def run_mikk_cli(args: list[str], cwd: Path = MIKK_ROOT) -> tuple[str, float, int]:
    """Run mikk CLI, return (stdout+stderr, elapsed_s, exit_code)."""
    t0 = time.perf_counter()

    def _run(cmd):
        return subprocess.run(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=90,
        )

    def _decode(b: bytes | None) -> str:
        if b is None:
            return ""
        try:
            return b.decode("utf-8", errors="replace")
        except Exception:
            return b.decode("latin-1", errors="replace")

    try:
        res = _run(["mikk"] + args)
    except FileNotFoundError:
        try:
            res = _run(["npx", "--yes", "@getmikk/cli"] + args)
        except FileNotFoundError:
            return "ERROR: mikk CLI not found", time.perf_counter() - t0, -2
    except subprocess.TimeoutExpired:
        return "TIMEOUT", 90.0, -1

    elapsed = time.perf_counter() - t0
    out = _decode(res.stdout) + _decode(res.stderr)
    return out, elapsed, res.returncode
