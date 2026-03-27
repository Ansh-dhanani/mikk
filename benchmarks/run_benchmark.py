"""
Mikk Aggressive Benchmark Suite
================================
Tests every observable dimension of Mikk CLI + MCP:
  - Accuracy (ground truth vs returned data)
  - Token efficiency
  - Latency
  - Completeness (how much of the known graph is captured)
  - Edge case handling
  - Cross-language correctness (TS + Go + JS)
  - Regression (re-run determinism)

Produces a comprehensive matrix TSV + PNG charts.

Usage:
    python benchmarks/run_benchmark.py
    python benchmarks/run_benchmark.py --output benchmarks/results
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── Try charting deps ─────────────────────────────────────────────────────────
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from matplotlib.gridspec import GridSpec
    from matplotlib.ticker import FuncFormatter, MaxNLocator
    import numpy as np
    HAS_CHARTS = True
except ImportError:
    HAS_CHARTS = False
    print("NOTE: matplotlib/numpy not found — skipping charts. pip install matplotlib numpy")

# =============================================================================
# Ground truth  (derived from the ts-express-api lock file we read)
# =============================================================================
GT = {
    # ── Module membership ──────────────────────────────────────────────────────
    "module_count": 7,
    "modules": {"auth", "users", "payments", "middleware", "routes", "utils", "db"},
    "module_function_counts": {
        "auth": 12,      # jwt(4) + password(3) + session(5)
        "users": 11,     # repo(7) + service(5) → overlap because service is in service.ts
        "payments": 8,
        "middleware": 4,
        "routes": 0,     # routes have generics/consts, not tracked as fn
        "utils": 7,
        "db": 3,
    },

    # ── Known functions ────────────────────────────────────────────────────────
    "total_functions": 47,
    "exported_functions": {
        "signToken", "verifyToken", "decodeToken", "refreshToken",
        "hashPassword", "comparePassword", "validatePasswordStrength",
        "createSession", "validateSession", "revokeSession",
        "getUserActiveSessions", "purgeExpiredSessions",
        "connectDatabase", "isConnected", "disconnectDatabase",
        "requireAuth", "requireAdmin", "errorHandler", "requestLogger",
        "createInvoice", "chargeInvoice", "markInvoicePaid", "refundInvoice",
        "createPaymentIntent", "confirmPayment", "refundPayment", "createCustomer",
        "createUser", "findUserById", "findUserByEmail", "updateUser",
        "deleteUser", "listUsers", "countUsers",
        "loginUser", "registerUser", "getUserProfile", "promoteToAdmin", "removeUser",
        "checkRateLimit", "resetRateLimitForIp", "getRateLimitStats",
        "isValidEmail", "isValidUuid", "sanitizeString", "clamp",
        "bootstrap",
    },

    # ── Dead code (ground truth from lock comments) ────────────────────────────
    "dead_functions": {"resetRateLimitForIp"},   # explicitly noted in lock

    # ── Known call edges (function → called function) ──────────────────────────
    "call_edges": {
        "bootstrap":        {"connectDatabase"},
        "refreshToken":     {"verifyToken", "signToken"},
        "requireAuth":      {"validateSession"},
        "createInvoice":    {"findUserById"},
        "chargeInvoice":    {"createPaymentIntent"},
        "markInvoicePaid":  {"confirmPayment"},
        "refundInvoice":    {"refundPayment"},
        "createUser":       {"findUserByEmail", "hashPassword"},
        "updateUser":       {"findUserById"},
        "loginUser":        {"findUserByEmail", "comparePassword", "signToken", "createSession"},
        "registerUser":     {"createUser"},
        "getUserProfile":   {"findUserById"},
        "promoteToAdmin":   {"updateUser"},
        "removeUser":       {"deleteUser"},
        "validateSession":  {"verifyToken"},
    },

    # ── Callers of key functions ───────────────────────────────────────────────
    "callers_of": {
        "verifyToken":      {"refreshToken", "validateSession"},
        "signToken":        {"refreshToken", "loginUser"},
        "findUserById":     {"createInvoice", "updateUser", "getUserProfile"},
        "hashPassword":     {"createUser"},
        "validateSession":  {"requireAuth"},
    },

    # ── Routes ────────────────────────────────────────────────────────────────
    "routes": [
        {"method": "USE", "path": "*"},
        {"method": "USE", "path": "/auth"},
        {"method": "USE", "path": "/users"},
        {"method": "USE", "path": "/payments"},
    ],

    # ── Files ─────────────────────────────────────────────────────────────────
    "total_files": 17,
    "auth_files": {"src/auth/jwt.ts", "src/auth/password.ts", "src/auth/session.ts"},

    # ── Types/interfaces ──────────────────────────────────────────────────────
    "interfaces": {"JwtPayload", "Invoice", "User", "LoginResult"},
}

# =============================================================================
# CLI runner
# =============================================================================
MIKK_ROOT = Path("C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api")

def run_mikk_cli(args: list[str], cwd: Path = MIKK_ROOT) -> tuple[str, float, int]:
    """Run mikk CLI, return (stdout, elapsed_s, exit_code)."""
    t0 = time.perf_counter()
    try:
        result = subprocess.run(
            ["mikk"] + args,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=60,
        )
        elapsed = time.perf_counter() - t0
        return result.stdout + result.stderr, elapsed, result.returncode
    except subprocess.TimeoutExpired:
        return "TIMEOUT", 60.0, -1
    except FileNotFoundError:
        # Try npx
        result = subprocess.run(
            ["npx", "@getmikk/cli"] + args,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=60,
        )
        elapsed = time.perf_counter() - t0
        return result.stdout + result.stderr, elapsed, result.returncode

def token_count(text: str) -> int:
    """Rough token count: 1 token ≈ 4 chars."""
    return max(1, len(text) // 4)

# =============================================================================
# Test result container
# =============================================================================
@dataclass
class TestResult:
    category: str        # e.g. "CLI Accuracy"
    test_id: str         # e.g. "cli-01"
    name: str
    description: str

    # Execution
    command: str = ""
    raw_output: str = ""
    exit_code: int = 0
    latency_ms: float = 0.0

    # Quality metrics (0–100)
    accuracy: float = 0.0        # % of ground-truth facts present in output
    completeness: float = 0.0    # % of expected items returned
    precision: float = 0.0       # % of returned items that are correct
    token_count: int = 0
    false_positives: int = 0

    # Pass/fail
    passed: bool = False
    notes: str = ""

    # Details
    expected: list[str] = field(default_factory=list)
    found: list[str] = field(default_factory=list)
    missed: list[str] = field(default_factory=list)
    extra: list[str] = field(default_factory=list)

    @property
    def f1(self) -> float:
        p = self.precision / 100
        r = self.completeness / 100
        if p + r == 0:
            return 0.0
        return round(2 * p * r / (p + r) * 100, 1)

    @property
    def grade(self) -> str:
        s = self.accuracy
        if s >= 95: return "A+"
        if s >= 85: return "A"
        if s >= 75: return "B"
        if s >= 60: return "C"
        if s >= 40: return "D"
        return "F"

# =============================================================================
# Scoring helpers
# =============================================================================
def score_set(output: str, expected: set[str], case_insensitive: bool = True) -> tuple[float, float, list, list, list]:
    """
    Returns completeness%, precision%, found, missed, extra.
    'extra' compares against a broad set; here we just track found vs missed.
    """
    if case_insensitive:
        out_lower = output.lower()
        found = [e for e in expected if e.lower() in out_lower]
    else:
        found = [e for e in expected if e in output]
    missed = [e for e in expected if e not in found]

    completeness = len(found) / len(expected) * 100 if expected else 100.0
    # Precision: harder to measure without knowing full returned set, use completeness as proxy
    precision = completeness
    return completeness, precision, found, missed, []

def score_number(output: str, expected_value: Any, label: str = "") -> float:
    """Check if expected_value appears in output."""
    patterns = [str(expected_value), f"{label}.*{expected_value}", f"{expected_value}.*{label}"]
    for p in patterns:
        if re.search(str(p), output, re.IGNORECASE):
            return 100.0
    # Partial: within ±10%
    try:
        nums = re.findall(r'\d+', output)
        if any(abs(int(n) - int(expected_value)) <= int(expected_value) * 0.1 for n in nums):
            return 80.0
    except Exception:
        pass
    return 0.0

def make_result(category: str, test_id: str, name: str, description: str,
                command: str, output: str, elapsed: float, exit_code: int,
                expected_set: set[str], extra_score: float = 0.0,
                notes: str = "") -> TestResult:
    completeness, precision, found, missed, extra = score_set(output, expected_set)
    accuracy = (completeness + precision + extra_score) / (2 + (1 if extra_score else 0)) * (3 if extra_score else 1)
    if extra_score:
        accuracy = (completeness + precision + extra_score) / 3
    else:
        accuracy = (completeness + precision) / 2

    r = TestResult(
        category=category,
        test_id=test_id,
        name=name,
        description=description,
        command=command,
        raw_output=output[:2000],
        exit_code=exit_code,
        latency_ms=elapsed * 1000,
        accuracy=round(accuracy, 1),
        completeness=round(completeness, 1),
        precision=round(precision, 1),
        token_count=token_count(output),
        passed=accuracy >= 70 and exit_code == 0,
        notes=notes,
        expected=sorted(expected_set),
        found=sorted(found),
        missed=sorted(missed),
    )
    return r

# =============================================================================
# TEST SUITE DEFINITIONS
# =============================================================================
results: list[TestResult] = []

def run_all_tests():

    # =========================================================================
    # CATEGORY 1: CLI — STATS / OVERVIEW
    # =========================================================================

    # T01: mikk stats — correct function count
    out, t, code = run_mikk_cli(["stats"])
    r = TestResult(
        category="CLI Accuracy",
        test_id="cli-01",
        name="stats — function count",
        description="mikk stats must report 47 functions",
        command="mikk stats",
        raw_output=out[:2000],
        exit_code=code,
        latency_ms=t*1000,
        token_count=token_count(out),
    )
    fn_score = score_number(out, 47, "function")
    r.accuracy = fn_score
    r.completeness = fn_score
    r.precision = fn_score
    r.passed = fn_score >= 80 and code == 0
    r.expected = ["47 functions"]
    r.found = ["47 functions"] if fn_score > 0 else []
    r.missed = [] if fn_score > 0 else ["47 functions"]
    r.notes = f"Returned: {re.findall(r'\\d+ function', out)[:3]}"
    results.append(r)

    # T02: mikk stats — correct module count
    r2 = TestResult(
        category="CLI Accuracy",
        test_id="cli-02",
        name="stats — module count",
        description="mikk stats must report 7 modules",
        command="mikk stats",
        raw_output=out[:2000],
        exit_code=code,
        latency_ms=t*1000,
        token_count=token_count(out),
    )
    mod_score = score_number(out, 7, "module")
    r2.accuracy = mod_score
    r2.completeness = mod_score
    r2.precision = mod_score
    r2.passed = mod_score >= 80 and code == 0
    r2.expected = ["7 modules"]
    r2.found = ["7 modules"] if mod_score > 0 else []
    r2.missed = [] if mod_score > 0 else ["7 modules"]
    results.append(r2)

    # T03: mikk stats — correct file count
    r3 = TestResult(
        category="CLI Accuracy",
        test_id="cli-03",
        name="stats — file count",
        description="mikk stats must report 17 files",
        command="mikk stats",
        raw_output=out[:2000],
        exit_code=code,
        latency_ms=t*1000,
        token_count=token_count(out),
    )
    file_score = score_number(out, 17, "file")
    r3.accuracy = file_score
    r3.completeness = file_score
    r3.precision = file_score
    r3.passed = file_score >= 80 and code == 0
    r3.expected = ["17 files"]
    results.append(r3)

    # =========================================================================
    # CATEGORY 2: CLI — MODULE LISTING
    # =========================================================================

    # T04: All 7 module IDs present in output
    out2, t2, code2 = run_mikk_cli(["context", "list"])
    r = make_result(
        "CLI Accuracy", "cli-04",
        "context list — all module IDs",
        "mikk context list must show all 7 module IDs",
        "mikk context list", out2, t2, code2,
        GT["modules"],
    )
    results.append(r)

    # T05: mikk context list latency < 5s
    r5 = TestResult(
        category="CLI Performance",
        test_id="cli-05",
        name="context list — latency",
        description="mikk context list must complete under 5000ms",
        command="mikk context list",
        raw_output=out2[:500],
        exit_code=code2,
        latency_ms=t2*1000,
        token_count=token_count(out2),
    )
    r5.accuracy = 100.0 if t2 < 5 else max(0, 100 - (t2 - 5) * 20)
    r5.passed = t2 < 5 and code2 == 0
    r5.notes = f"Took {t2*1000:.0f}ms"
    results.append(r5)

    # =========================================================================
    # CATEGORY 3: CLI — DEAD CODE
    # =========================================================================

    # T06: dead-code detects resetRateLimitForIp
    out3, t3, code3 = run_mikk_cli(["dead-code"])
    r = make_result(
        "CLI Accuracy", "cli-06",
        "dead-code — finds resetRateLimitForIp",
        "mikk dead-code must flag resetRateLimitForIp (confirmed dead in lock)",
        "mikk dead-code", out3, t3, code3,
        GT["dead_functions"],
    )
    results.append(r)

    # T07: dead-code does NOT flag exported functions incorrectly
    out_lower = out3.lower()
    false_positive_fns = [fn for fn in ["signtoken", "verifytoken", "hashpassword", "loginuser", "createuser"]
                          if fn in out_lower]
    r7 = TestResult(
        category="CLI Accuracy",
        test_id="cli-07",
        name="dead-code — no false positives on exported",
        description="Exported + called functions must NOT appear in dead-code output",
        command="mikk dead-code",
        raw_output=out3[:1000],
        exit_code=code3,
        latency_ms=t3*1000,
        token_count=token_count(out3),
        false_positives=len(false_positive_fns),
    )
    r7.accuracy = 100.0 if not false_positive_fns else max(0, 100 - len(false_positive_fns) * 20)
    r7.passed = not false_positive_fns and code3 == 0
    r7.extra = false_positive_fns
    r7.notes = f"False positives: {false_positive_fns}"
    results.append(r7)

    # T08: dead-code output token efficiency (should be < 2000 tokens)
    r8 = TestResult(
        category="CLI Performance",
        test_id="cli-08",
        name="dead-code — token efficiency",
        description="dead-code output should be concise (<2000 tokens)",
        command="mikk dead-code",
        raw_output=out3[:500],
        exit_code=code3,
        latency_ms=t3*1000,
        token_count=token_count(out3),
    )
    r8.accuracy = 100.0 if r8.token_count < 2000 else max(0, 100 - (r8.token_count - 2000) / 50)
    r8.passed = r8.token_count < 2000
    r8.notes = f"{r8.token_count} tokens"
    results.append(r8)

    # =========================================================================
    # CATEGORY 4: CLI — CI / BOUNDARY CHECK
    # =========================================================================

    # T09: mikk ci exits 0 (no violations if constraints are satisfied)
    out4, t4, code4 = run_mikk_cli(["ci"])
    r9 = TestResult(
        category="CLI Accuracy",
        test_id="cli-09",
        name="ci — exit code",
        description="mikk ci must exit 0 when no constraint violations exist",
        command="mikk ci",
        raw_output=out4[:1000],
        exit_code=code4,
        latency_ms=t4*1000,
        token_count=token_count(out4),
    )
    # ci passes if it exits 0 OR reports pass
    r9.passed = code4 == 0 or "pass" in out4.lower() or "no violations" in out4.lower() or "0 error" in out4.lower()
    r9.accuracy = 100.0 if r9.passed else 0.0
    r9.notes = f"exit={code4}"
    results.append(r9)

    # T10: mikk ci latency
    r10 = TestResult(
        category="CLI Performance",
        test_id="cli-10",
        name="ci — latency",
        description="mikk ci must complete under 3000ms",
        command="mikk ci",
        raw_output=out4[:300],
        exit_code=code4,
        latency_ms=t4*1000,
        token_count=token_count(out4),
    )
    r10.accuracy = 100.0 if t4 < 3 else max(0, 100 - (t4 - 3) * 30)
    r10.passed = t4 < 3
    r10.notes = f"{t4*1000:.0f}ms"
    results.append(r10)

    # =========================================================================
    # CATEGORY 5: CLI — CONTEXT QUERY
    # =========================================================================

    # T11: context query returns auth-related functions
    out5, t5, code5 = run_mikk_cli(["context", "query", "How does authentication work?"])
    auth_fns = {"signToken", "verifyToken", "requireAuth", "validateSession", "loginUser"}
    r = make_result(
        "CLI Accuracy", "cli-11",
        "context query — auth functions surfaced",
        "Querying 'authentication' must surface core auth functions",
        "mikk context query 'How does authentication work?'",
        out5, t5, code5, auth_fns,
    )
    results.append(r)

    # T12: context query token efficiency
    r12 = TestResult(
        category="CLI Performance",
        test_id="cli-12",
        name="context query — token count",
        description="Context query output should be under 8000 tokens (focused)",
        command="mikk context query 'auth'",
        raw_output=out5[:500],
        exit_code=code5,
        latency_ms=t5*1000,
        token_count=token_count(out5),
    )
    r12.accuracy = 100.0 if r12.token_count < 8000 else max(0, 100 - (r12.token_count - 8000)/200)
    r12.passed = r12.token_count < 8000
    r12.notes = f"{r12.token_count} tokens"
    results.append(r12)

    # T13: context for payments returns payment functions
    out6, t6, code6 = run_mikk_cli(["context", "query", "payment billing invoice stripe"])
    pay_fns = {"createInvoice", "chargeInvoice", "createPaymentIntent", "refundPayment"}
    r = make_result(
        "CLI Accuracy", "cli-13",
        "context query — payment functions",
        "Querying payments must surface billing/stripe functions",
        "mikk context query 'payment billing'",
        out6, t6, code6, pay_fns,
    )
    results.append(r)

    # T14: context for users — completeness
    out7, t7, code7 = run_mikk_cli(["context", "query", "user management create delete"])
    user_fns = {"createUser", "findUserById", "updateUser", "deleteUser", "registerUser"}
    r = make_result(
        "CLI Accuracy", "cli-14",
        "context query — user functions",
        "Querying users must surface repository + service functions",
        "mikk context query 'user management'",
        out7, t7, code7, user_fns,
    )
    results.append(r)

    # =========================================================================
    # CATEGORY 6: CLI — CONTEXT IMPACT
    # =========================================================================

    # T15: impact of src/auth/jwt.ts — should hit requireAuth, validateSession, loginUser
    out8, t8, code8 = run_mikk_cli(["context", "impact", "src/auth/jwt.ts"])
    impact_expected = {"requireAuth", "validateSession", "loginUser", "refreshToken"}
    r = make_result(
        "CLI Accuracy", "cli-15",
        "context impact — jwt.ts blast radius",
        "Changing jwt.ts must impact requireAuth, validateSession, loginUser, refreshToken",
        "mikk context impact src/auth/jwt.ts",
        out8, t8, code8, impact_expected,
    )
    results.append(r)

    # T16: impact of validate.ts — should be low (few callers)
    out9, t9, code9 = run_mikk_cli(["context", "impact", "src/utils/validate.ts"])
    r16 = TestResult(
        category="CLI Accuracy",
        test_id="cli-16",
        name="context impact — validate.ts (low-blast file)",
        description="validate.ts has few callers — impact count should be low",
        command="mikk context impact src/utils/validate.ts",
        raw_output=out9[:1000],
        exit_code=code9,
        latency_ms=t9*1000,
        token_count=token_count(out9),
    )
    # validate.ts is only imported by routes/auth.ts — expect small impact
    impact_nums = re.findall(r'(\d+)\s*(?:impacted|functions|nodes)', out9, re.IGNORECASE)
    if impact_nums:
        count = int(impact_nums[0])
        r16.accuracy = 100.0 if count <= 10 else max(0, 100 - (count - 10) * 5)
    else:
        r16.accuracy = 50.0  # partial credit — command ran
    r16.passed = code9 == 0 and r16.accuracy >= 60
    r16.notes = f"Impact nums found: {impact_nums[:3]}"
    results.append(r16)

    # =========================================================================
    # CATEGORY 7: CLI — DOCTOR / HEALTH CHECK
    # =========================================================================

    # T17: mikk doctor passes
    out10, t10, code10 = run_mikk_cli(["doctor"])
    r17 = TestResult(
        category="CLI Accuracy",
        test_id="cli-17",
        name="doctor — passes for valid project",
        description="mikk doctor must report healthy project (has mikk.json, mikk.lock.json, graph)",
        command="mikk doctor",
        raw_output=out10[:1000],
        exit_code=code10,
        latency_ms=t10*1000,
        token_count=token_count(out10),
    )
    health_keywords = ["mikk.json", "mikk.lock", "function", "module"]
    found_kw = [k for k in health_keywords if k.lower() in out10.lower()]
    r17.accuracy = len(found_kw) / len(health_keywords) * 100
    r17.passed = code10 == 0 and r17.accuracy >= 50
    r17.notes = f"Found: {found_kw}"
    results.append(r17)

    # =========================================================================
    # CATEGORY 8: CLI — ANALYZE (re-run idempotency)
    # =========================================================================

    # T18: mikk analyze completes without error
    out11, t11, code11 = run_mikk_cli(["analyze"])
    r18 = TestResult(
        category="CLI Accuracy",
        test_id="cli-18",
        name="analyze — exits clean",
        description="mikk analyze must exit 0 and report functions analyzed",
        command="mikk analyze",
        raw_output=out11[:1000],
        exit_code=code11,
        latency_ms=t11*1000,
        token_count=token_count(out11),
    )
    fn_found = any(c.isdigit() and int(c) > 0 for c in re.findall(r'\d+', out11))
    r18.accuracy = 100.0 if code11 == 0 else 0.0
    r18.passed = code11 == 0
    r18.notes = f"exit={code11}, {t11*1000:.0f}ms"
    results.append(r18)

    # T19: Post-analyze function count still correct
    out12, t12, code12 = run_mikk_cli(["stats"])
    fn_score2 = score_number(out12, 47, "function")
    r19 = TestResult(
        category="CLI Accuracy",
        test_id="cli-19",
        name="analyze — post-reanalyze count stable",
        description="Function count must stay 47 after re-analysis (idempotency)",
        command="mikk stats (after analyze)",
        raw_output=out12[:500],
        exit_code=code12,
        latency_ms=t12*1000,
        token_count=token_count(out12),
        accuracy=fn_score2,
        completeness=fn_score2,
        precision=fn_score2,
    )
    r19.passed = fn_score2 >= 80 and code12 == 0
    results.append(r19)

    # T20: analyze latency (performance)
    r20 = TestResult(
        category="CLI Performance",
        test_id="cli-20",
        name="analyze — full parse latency",
        description="mikk analyze must complete under 30s on a 17-file project",
        command="mikk analyze",
        raw_output="",
        exit_code=code11,
        latency_ms=t11*1000,
        token_count=token_count(out11),
    )
    r20.accuracy = 100.0 if t11 < 30 else max(0, 100 - (t11 - 30) * 3)
    r20.passed = t11 < 30 and code11 == 0
    r20.notes = f"{t11*1000:.0f}ms"
    results.append(r20)

    # =========================================================================
    # CATEGORY 9: MCP SIMULATION (via context query JSON output)
    # =========================================================================
    # We can't call the live MCP server over stdio in this script, so we
    # test MCP through the CLI's --provider generic flag which exercises the
    # same ContextBuilder + lock-reader path.

    # T21: context query provider=generic — JSON-like structure
    out13, t13, code13 = run_mikk_cli(["context", "query", "authentication", "--provider", "generic"])
    r21 = TestResult(
        category="MCP Accuracy",
        test_id="mcp-01",
        name="context query generic — structured output",
        description="Generic provider must produce structured module/function output",
        command="mikk context query 'authentication' --provider generic",
        raw_output=out13[:2000],
        exit_code=code13,
        latency_ms=t13*1000,
        token_count=token_count(out13),
    )
    structure_keywords = ["Module", "function", "auth", "signToken", "verifyToken"]
    found_sk = [k for k in structure_keywords if k.lower() in out13.lower()]
    r21.accuracy = len(found_sk) / len(structure_keywords) * 100
    r21.completeness = r21.accuracy
    r21.precision = r21.accuracy
    r21.passed = r21.accuracy >= 60 and code13 == 0
    r21.found = found_sk
    r21.missed = [k for k in structure_keywords if k not in found_sk]
    r21.notes = f"Found: {found_sk}"
    results.append(r21)

    # T22: context for — includes function bodies when asked
    out14, t14, code14 = run_mikk_cli(["context", "for", "implement login flow",
                                        "--provider", "generic"])
    body_fns = {"loginUser", "hashPassword", "comparePassword", "signToken"}
    r = make_result(
        "MCP Accuracy", "mcp-02",
        "context for — login flow completeness",
        "context for login must surface loginUser + related auth functions",
        "mikk context for 'implement login flow' --provider generic",
        out14, t14, code14, body_fns,
    )
    results.append(r)

    # T23: context token budget respected (default 6000)
    r23 = TestResult(
        category="MCP Performance",
        test_id="mcp-03",
        name="context query — token budget compliance",
        description="Default context query must stay under 6000 tokens",
        command="mikk context query 'everything'",
        raw_output=out13[:500],
        exit_code=code13,
        latency_ms=t13*1000,
        token_count=token_count(out13),
    )
    r23.accuracy = 100.0 if r23.token_count <= 6000 else max(0, 100 - (r23.token_count - 6000) / 100)
    r23.passed = r23.token_count <= 6000
    r23.notes = f"{r23.token_count} tokens (budget: 6000)"
    results.append(r23)

    # T24: context query latency
    r24 = TestResult(
        category="MCP Performance",
        test_id="mcp-04",
        name="context query — latency",
        description="context query must complete under 3000ms",
        command="mikk context query 'auth'",
        raw_output="",
        exit_code=code13,
        latency_ms=t13*1000,
        token_count=r23.token_count,
    )
    r24.accuracy = 100.0 if t13 < 3 else max(0, 100 - (t13 - 3) * 20)
    r24.passed = t13 < 3
    r24.notes = f"{t13*1000:.0f}ms"
    results.append(r24)

    # =========================================================================
    # CATEGORY 10: CROSS-LANGUAGE (Go project)
    # =========================================================================

    go_root = Path("C:/Users/Ansh/Desktop/web/mikk-test/go-service")
    go_lock_path = go_root / "mikk.lock.json"
    has_go = go_lock_path.exists()

    out_go, t_go, code_go = run_mikk_cli(["stats"], cwd=go_root) if has_go else ("", 0, -1)

    r25 = TestResult(
        category="Cross-Language",
        test_id="lang-01",
        name="Go project — stats parsed",
        description="mikk stats must work on a Go service project",
        command="mikk stats (go-service)",
        raw_output=out_go[:1000],
        exit_code=code_go,
        latency_ms=t_go*1000,
        token_count=token_count(out_go),
    )
    if has_go:
        has_fns = bool(re.search(r'\d+.*function', out_go, re.IGNORECASE))
        r25.accuracy = 100.0 if has_fns and code_go == 0 else 50.0
        r25.passed = code_go == 0
        r25.notes = "Go project analyzed"
    else:
        r25.accuracy = 0.0
        r25.passed = False
        r25.notes = "go-service/mikk.lock.json not found — run mikk analyze first"
    results.append(r25)

    # T26: Go dead-code
    if has_go:
        out_gd, t_gd, code_gd = run_mikk_cli(["dead-code"], cwd=go_root)
        r26 = TestResult(
            category="Cross-Language",
            test_id="lang-02",
            name="Go project — dead-code runs",
            description="mikk dead-code must execute on Go project without crash",
            command="mikk dead-code (go-service)",
            raw_output=out_gd[:500],
            exit_code=code_gd,
            latency_ms=t_gd*1000,
            token_count=token_count(out_gd),
            accuracy=100.0 if code_gd == 0 else 0.0,
            passed=code_gd == 0,
        )
    else:
        r26 = TestResult(
            category="Cross-Language", test_id="lang-02",
            name="Go project — dead-code runs", description="Skipped: no lock file",
            command="mikk dead-code (go-service)", accuracy=0.0, passed=False,
            notes="go-service not analyzed",
        )
    results.append(r26)

    # T27: JS project
    js_root = Path("C:/Users/Ansh/Desktop/web/mikk-test/js-utility")
    has_js = (js_root / "mikk.lock.json").exists()
    out_js, t_js, code_js = run_mikk_cli(["stats"], cwd=js_root) if has_js else ("", 0, -1)
    r27 = TestResult(
        category="Cross-Language",
        test_id="lang-03",
        name="JS project — stats parsed",
        description="mikk stats must work on a JS (non-TypeScript) project",
        command="mikk stats (js-utility)",
        raw_output=out_js[:500],
        exit_code=code_js,
        latency_ms=t_js*1000,
        token_count=token_count(out_js),
        accuracy=100.0 if code_js == 0 and has_js else 0.0,
        passed=code_js == 0 and has_js,
        notes="js-utility" if has_js else "js-utility not analyzed",
    )
    results.append(r27)

    # =========================================================================
    # CATEGORY 11: GRAPH ACCURACY
    # =========================================================================

    # T28: Call graph accuracy — verifyToken callers
    # We know from GT: verifyToken is called by refreshToken and validateSession
    out15, t15, code15 = run_mikk_cli(["context", "query", "who calls verifyToken"])
    vt_callers = {"refreshToken", "validateSession"}
    r = make_result(
        "Graph Accuracy", "graph-01",
        "call graph — verifyToken callers",
        "Query for verifyToken callers must return refreshToken and validateSession",
        "mikk context query 'who calls verifyToken'",
        out15, t15, code15, vt_callers,
    )
    results.append(r)

    # T29: Call graph — loginUser call chain
    out16, t16, code16 = run_mikk_cli(["context", "query", "loginUser call chain dependencies"])
    login_deps = {"findUserByEmail", "comparePassword", "signToken", "createSession"}
    r = make_result(
        "Graph Accuracy", "graph-02",
        "call graph — loginUser dependencies",
        "loginUser calls: findUserByEmail, comparePassword, signToken, createSession",
        "mikk context query 'loginUser call chain'",
        out16, t16, code16, login_deps,
    )
    results.append(r)

    # T30: Import graph — billing.ts imports
    out17, t17, code17 = run_mikk_cli(["context", "query", "what does billing.ts import"])
    billing_imports = {"stripe", "repository", "findUserById"}
    r = make_result(
        "Graph Accuracy", "graph-03",
        "import graph — billing.ts imports",
        "billing.ts imports stripe.ts and users/repository.ts",
        "mikk context query 'billing.ts imports'",
        out17, t17, code17, billing_imports,
    )
    results.append(r)

    # =========================================================================
    # CATEGORY 12: EDGE CASES
    # =========================================================================

    # T31: Query for non-existent function
    out18, t18, code18 = run_mikk_cli(["context", "query", "xyzNonExistentFunction12345"])
    r31 = TestResult(
        category="Edge Cases",
        test_id="edge-01",
        name="query — non-existent function",
        description="Querying for a made-up function must not crash (graceful fallback)",
        command="mikk context query 'xyzNonExistentFunction12345'",
        raw_output=out18[:500],
        exit_code=code18,
        latency_ms=t18*1000,
        token_count=token_count(out18),
    )
    # Just needs to not crash with exit code > 1 or empty output
    r31.accuracy = 100.0 if code18 in (0, 1) else 0.0
    r31.passed = code18 in (0, 1)  # graceful exit
    r31.notes = f"exit={code18}"
    results.append(r31)

    # T32: Empty query string
    out19, t19, code19 = run_mikk_cli(["context", "query", ""])
    r32 = TestResult(
        category="Edge Cases",
        test_id="edge-02",
        name="query — empty string",
        description="Empty query must either give a useful error or return top-level context",
        command="mikk context query ''",
        raw_output=out19[:500],
        exit_code=code19,
        latency_ms=t19*1000,
        token_count=token_count(out19),
    )
    r32.accuracy = 100.0 if code19 in (0, 1) else 50.0
    r32.passed = code19 in (0, 1)
    r32.notes = f"exit={code19}"
    results.append(r32)

    # T33: impact on non-existent file
    out20, t20, code20 = run_mikk_cli(["context", "impact", "src/doesnotexist.ts"])
    r33 = TestResult(
        category="Edge Cases",
        test_id="edge-03",
        name="impact — non-existent file",
        description="impact on missing file must not crash — should warn gracefully",
        command="mikk context impact src/doesnotexist.ts",
        raw_output=out20[:500],
        exit_code=code20,
        latency_ms=t20*1000,
        token_count=token_count(out20),
    )
    r33.accuracy = 100.0 if code20 in (0, 1) else 0.0
    r33.passed = code20 in (0, 1)
    r33.notes = f"exit={code20}"
    results.append(r33)

    # T34: stats with --json flag (machine-readable output)
    out21, t21, code21 = run_mikk_cli(["stats", "--json"])
    r34 = TestResult(
        category="Edge Cases",
        test_id="edge-04",
        name="stats --json — valid JSON output",
        description="mikk stats --json must produce valid parseable JSON",
        command="mikk stats --json",
        raw_output=out21[:500],
        exit_code=code21,
        latency_ms=t21*1000,
        token_count=token_count(out21),
    )
    try:
        parsed = json.loads(out21.strip())
        r34.accuracy = 100.0
        r34.passed = True
        r34.notes = "Valid JSON"
    except json.JSONDecodeError:
        # Might not support --json, check if it ran
        r34.accuracy = 50.0 if code21 in (0, 1) else 0.0
        r34.passed = False
        r34.notes = "Not valid JSON or flag unsupported"
    results.append(r34)

    # =========================================================================
    # CATEGORY 13: REGRESSION (run key tests twice, check determinism)
    # =========================================================================

    # T35: Two consecutive stats — same output
    out_r1, t_r1, _ = run_mikk_cli(["stats"])
    out_r2, t_r2, _ = run_mikk_cli(["stats"])
    fn1 = re.findall(r'\d+', out_r1)
    fn2 = re.findall(r'\d+', out_r2)
    r35 = TestResult(
        category="Regression",
        test_id="reg-01",
        name="stats determinism",
        description="Two consecutive stats calls must return identical numbers",
        command="mikk stats (x2)",
        raw_output=out_r1[:300],
        exit_code=0,
        latency_ms=(t_r1 + t_r2) * 500,  # avg ms
        token_count=token_count(out_r1),
    )
    r35.accuracy = 100.0 if fn1 == fn2 else 50.0
    r35.passed = fn1 == fn2
    r35.notes = f"Run1={fn1[:5]}, Run2={fn2[:5]}"
    results.append(r35)

    # T36: Re-analyze then stats — still correct
    run_mikk_cli(["analyze"])
    out_ra, t_ra, code_ra = run_mikk_cli(["stats"])
    fn_ra = score_number(out_ra, 47, "function")
    r36 = TestResult(
        category="Regression",
        test_id="reg-02",
        name="analyze → stats idempotency",
        description="After re-analyze, function count must remain 47",
        command="mikk analyze; mikk stats",
        raw_output=out_ra[:500],
        exit_code=code_ra,
        latency_ms=t_ra*1000,
        token_count=token_count(out_ra),
        accuracy=fn_ra,
        completeness=fn_ra,
        precision=fn_ra,
    )
    r36.passed = fn_ra >= 80 and code_ra == 0
    results.append(r36)

# =============================================================================
# Output
# =============================================================================
def print_matrix(results: list[TestResult]) -> None:
    cats = sorted(set(r.category for r in results))
    SEP = "─" * 120

    print("\n" + "═"*120)
    print(" MIKK AGGRESSIVE BENCHMARK MATRIX")
    print("═"*120)
    print(f" {'ID':<10} {'Test Name':<45} {'Category':<18} {'Acc%':>5} {'Cmpl%':>6} {'Prec%':>6} {'F1':>5} {'Latency':>9} {'Tokens':>7} {'Grade':>6} {'Pass':>5}")
    print(SEP)

    category_scores: dict[str, list[float]] = {}
    for r in results:
        cat = r.category
        if cat not in category_scores:
            category_scores[cat] = []
        category_scores[cat].append(r.accuracy)

        flag = "✓" if r.passed else "✗"
        print(
            f" {r.test_id:<10} {r.name[:44]:<45} {r.category[:17]:<18} "
            f"{r.accuracy:>5.1f} {r.completeness:>6.1f} {r.precision:>6.1f} "
            f"{r.f1:>5.1f} {r.latency_ms:>8.0f}ms {r.token_count:>7,} "
            f"{r.grade:>6} {flag:>5}"
        )

    print(SEP)
    print("\n CATEGORY SUMMARIES:")
    print(f" {'Category':<25} {'Tests':>6} {'Avg Acc%':>9} {'Passed':>7} {'Pass%':>7}")
    print("─"*60)
    overall_acc = []
    for cat in sorted(category_scores.keys()):
        cat_results = [r for r in results if r.category == cat]
        avg = sum(r.accuracy for r in cat_results) / len(cat_results)
        passed = sum(1 for r in cat_results if r.passed)
        overall_acc.extend(r.accuracy for r in cat_results)
        pct = passed/len(cat_results)*100
        print(f" {cat:<25} {len(cat_results):>6} {avg:>9.1f} {passed:>7} {pct:>6.1f}%")

    grand_avg = sum(overall_acc) / len(overall_acc)
    total_passed = sum(1 for r in results if r.passed)
    print("─"*60)
    print(f" {'OVERALL':<25} {len(results):>6} {grand_avg:>9.1f} {total_passed:>7} {total_passed/len(results)*100:>6.1f}%")
    print("═"*120)

    # Failures
    failed = [r for r in results if not r.passed]
    if failed:
        print(f"\n FAILURES ({len(failed)}):")
        for r in failed:
            print(f"  [{r.test_id}] {r.name}")
            if r.missed:
                print(f"       Missed: {', '.join(r.missed[:5])}")
            if r.notes:
                print(f"       Note:   {r.notes}")

def save_json(results: list[TestResult], out_dir: Path) -> Path:
    data = {
        "generated": datetime.now().isoformat(),
        "summary": {
            "total": len(results),
            "passed": sum(1 for r in results if r.passed),
            "avg_accuracy": round(sum(r.accuracy for r in results) / len(results), 1),
        },
        "results": [asdict(r) for r in results],
    }
    path = out_dir / "benchmark_raw.json"
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"\n  JSON -> {path}")
    return path

def save_tsv(results: list[TestResult], out_dir: Path) -> Path:
    path = out_dir / "benchmark_matrix.tsv"
    headers = ["test_id", "category", "name", "accuracy", "completeness", "precision",
               "f1", "latency_ms", "token_count", "grade", "passed", "notes"]
    lines = ["\t".join(headers)]
    for r in results:
        lines.append("\t".join([
            r.test_id, r.category, r.name,
            f"{r.accuracy:.1f}", f"{r.completeness:.1f}", f"{r.precision:.1f}",
            f"{r.f1:.1f}", f"{r.latency_ms:.0f}", str(r.token_count),
            r.grade, str(r.passed), r.notes,
        ]))
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  TSV  -> {path}")
    return path

# =============================================================================
# Chart generation
# =============================================================================
PALETTE = {
    "bg": "#0d1117", "surface": "#161b22", "border": "#21262d",
    "text": "#e6edf3", "muted": "#8b949e",
    "pass": "#2ea043", "fail": "#da3633", "warn": "#d29922",
    "blue": "#388bfd", "purple": "#8957e5", "grid": "#1c2128",
}

def apply_dark(fig, axes):
    fig.patch.set_facecolor(PALETTE["bg"])
    for ax in axes:
        ax.set_facecolor(PALETTE["surface"])
        ax.tick_params(colors=PALETTE["muted"])
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.spines["bottom"].set_color(PALETTE["border"])
        ax.spines["left"].set_color(PALETTE["border"])
        ax.yaxis.grid(True, color=PALETTE["grid"], lw=0.5, ls="--", alpha=0.7)
        ax.set_axisbelow(True)
        for lbl in ax.get_xticklabels() + ax.get_yticklabels():
            lbl.set_color(PALETTE["muted"])

def save_chart(fig, path):
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"  PNG  -> {path}")

def generate_charts(results: list[TestResult], out_dir: Path) -> None:
    if not HAS_CHARTS:
        return

    cats = sorted(set(r.category for r in results))
    colors = [PALETTE["pass"] if r.passed else PALETTE["fail"] for r in results]

    # ── Chart 1: Accuracy by test (horizontal bar) ───────────────────────────
    fig, ax = plt.subplots(figsize=(16, max(8, len(results) * 0.4)))
    apply_dark(fig, [ax])
    y = np.arange(len(results))
    bars = ax.barh(y, [r.accuracy for r in results], color=colors, alpha=0.9, zorder=3)
    ax.axvline(70, color=PALETTE["warn"], lw=1.5, ls="--", label="Pass threshold (70%)")
    ax.axvline(90, color=PALETTE["pass"], lw=1, ls=":", alpha=0.5, label="Excellent (90%)")
    for i, r in enumerate(results):
        ax.text(r.accuracy + 0.5, y[i], f"{r.accuracy:.0f}%",
                va="center", fontsize=7, color=PALETTE["text"])
    ax.set_yticks(y)
    ax.set_yticklabels([f"[{r.test_id}] {r.name[:35]}" for r in results], fontsize=7.5)
    ax.set_xlim(0, 110)
    ax.set_xlabel("Accuracy %", color=PALETTE["muted"])
    ax.legend(fontsize=8, facecolor=PALETTE["surface"], edgecolor=PALETTE["border"],
              labelcolor=PALETTE["muted"])
    ax.set_title("Accuracy by Test  —  Mikk Benchmark Suite", fontsize=13,
                 fontweight="bold", color=PALETTE["text"], pad=10)
    fig.tight_layout()
    save_chart(fig, out_dir / "bench_accuracy.png")

    # ── Chart 2: Category heatmap ─────────────────────────────────────────────
    cat_data = {}
    for cat in cats:
        cr = [r for r in results if r.category == cat]
        cat_data[cat] = {
            "avg_acc": np.mean([r.accuracy for r in cr]),
            "pass_rate": sum(r.passed for r in cr) / len(cr) * 100,
            "avg_latency": np.mean([r.latency_ms for r in cr]),
            "avg_tokens": np.mean([r.token_count for r in cr]),
            "count": len(cr),
        }

    fig, axes = plt.subplots(1, 4, figsize=(20, max(5, len(cats) * 0.8)))
    apply_dark(fig, list(axes))
    metrics = [("avg_acc", "Avg Accuracy %", PALETTE["pass"]),
               ("pass_rate", "Pass Rate %", PALETTE["blue"]),
               ("avg_latency", "Avg Latency ms", PALETTE["warn"]),
               ("avg_tokens", "Avg Tokens", PALETTE["purple"])]

    for ax, (key, label, color) in zip(axes, metrics):
        vals = [cat_data[c][key] for c in cats]
        y = np.arange(len(cats))
        ax.barh(y, vals, color=color, alpha=0.85, zorder=3)
        for i, v in enumerate(vals):
            fmt = f"{v:.0f}"
            ax.text(v + max(vals)*0.01, y[i], fmt, va="center",
                    fontsize=8, color=PALETTE["text"])
        ax.set_yticks(y)
        ax.set_yticklabels([c for c in cats] if ax is axes[0] else [], fontsize=9)
        ax.set_title(label, fontsize=9, color=PALETTE["text"], pad=5)
        ax.set_xlim(0, max(vals) * 1.15)

    fig.suptitle("Category Metrics  —  Mikk Benchmark Suite", fontsize=13,
                 fontweight="bold", color=PALETTE["text"], y=1.02)
    fig.tight_layout()
    save_chart(fig, out_dir / "bench_categories.png")

    # ── Chart 3: Latency distribution ────────────────────────────────────────
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))
    apply_dark(fig, [ax1, ax2])
    latencies = [r.latency_ms for r in results]
    bins = np.linspace(0, max(latencies) * 1.1, 20)
    ax1.hist(latencies, bins=bins, color=PALETTE["blue"], alpha=0.8, zorder=3)
    ax1.axvline(np.mean(latencies), color=PALETTE["warn"], lw=2,
                label=f"Mean: {np.mean(latencies):.0f}ms")
    ax1.axvline(np.median(latencies), color=PALETTE["pass"], lw=2, ls="--",
                label=f"Median: {np.median(latencies):.0f}ms")
    ax1.set_xlabel("Latency (ms)", color=PALETTE["muted"])
    ax1.set_ylabel("Count", color=PALETTE["muted"])
    ax1.set_title("Latency Distribution", fontsize=11, color=PALETTE["text"], pad=6)
    ax1.legend(fontsize=8, facecolor=PALETTE["surface"], edgecolor=PALETTE["border"],
               labelcolor=PALETTE["muted"])

    # Token scatter
    tokens = [r.token_count for r in results]
    acc = [r.accuracy for r in results]
    scatter_colors = [PALETTE["pass"] if r.passed else PALETTE["fail"] for r in results]
    ax2.scatter(tokens, acc, c=scatter_colors, alpha=0.8, s=60, zorder=3)
    for i, r in enumerate(results):
        ax2.annotate(r.test_id, (tokens[i], acc[i]), fontsize=6,
                     color=PALETTE["muted"], xytext=(3, 3), textcoords="offset points")
    ax2.axhline(70, color=PALETTE["warn"], lw=1, ls="--", alpha=0.7)
    ax2.set_xlabel("Token Count", color=PALETTE["muted"])
    ax2.set_ylabel("Accuracy %", color=PALETTE["muted"])
    ax2.set_title("Token Count vs Accuracy", fontsize=11, color=PALETTE["text"], pad=6)

    fig.suptitle("Performance Analysis  —  Mikk Benchmark Suite",
                 fontsize=13, fontweight="bold", color=PALETTE["text"], y=1.02)
    fig.tight_layout()
    save_chart(fig, out_dir / "bench_performance.png")

    # ── Chart 4: Pass/Fail overview card ─────────────────────────────────────
    fig, axes = plt.subplots(1, 3, figsize=(18, 7))
    apply_dark(fig, list(axes))

    # Pie
    passed = sum(r.passed for r in results)
    failed = len(results) - passed
    axes[0].pie([passed, failed],
                labels=["Pass", "Fail"],
                colors=[PALETTE["pass"], PALETTE["fail"]],
                autopct="%1.0f%%", startangle=90,
                textprops={"color": PALETTE["text"], "fontsize": 11},
                wedgeprops={"edgecolor": PALETTE["bg"], "linewidth": 2})
    axes[0].set_title(f"Pass Rate\n{passed}/{len(results)} tests",
                      fontsize=11, color=PALETTE["text"], pad=10)

    # Grade distribution
    grades = [r.grade for r in results]
    grade_order = ["A+", "A", "B", "C", "D", "F"]
    grade_colors = [PALETTE["pass"], "#3fb950", PALETTE["blue"],
                    PALETTE["warn"], "#e3b341", PALETTE["fail"]]
    grade_counts = [grades.count(g) for g in grade_order]
    x = np.arange(len(grade_order))
    axes[1].bar(x, grade_counts,
                color=[gc for gc, gv in zip(grade_colors, grade_counts) if gv >= 0],
                alpha=0.9, zorder=3)
    # Use actual colors
    for xi, (cnt, gc) in enumerate(zip(grade_counts, grade_colors)):
        axes[1].bar(xi, cnt, color=gc, alpha=0.9, zorder=3)
        if cnt > 0:
            axes[1].text(xi, cnt + 0.1, str(cnt), ha="center",
                         fontsize=10, color=PALETTE["text"])
    axes[1].set_xticks(x)
    axes[1].set_xticklabels(grade_order, fontsize=10)
    axes[1].set_ylabel("Tests", color=PALETTE["muted"])
    axes[1].set_title("Grade Distribution", fontsize=11, color=PALETTE["text"], pad=6)

    # F1 by category
    cat_f1 = {cat: np.mean([r.f1 for r in results if r.category == cat]) for cat in cats}
    axes[2].barh(list(cat_f1.keys()),
                 list(cat_f1.values()),
                 color=PALETTE["purple"], alpha=0.9, zorder=3)
    for i, (cat, f1v) in enumerate(cat_f1.items()):
        axes[2].text(f1v + 0.5, i, f"{f1v:.1f}",
                     va="center", fontsize=8, color=PALETTE["text"])
    axes[2].set_xlim(0, 110)
    axes[2].set_title("F1 Score by Category", fontsize=11, color=PALETTE["text"], pad=6)

    fig.suptitle("Mikk Benchmark Summary", fontsize=14, fontweight="bold",
                 color=PALETTE["text"], y=1.02)
    fig.tight_layout()
    save_chart(fig, out_dir / "bench_summary.png")

# =============================================================================
# Main
# =============================================================================
def main():
    parser = argparse.ArgumentParser(description="Mikk aggressive benchmark suite")
    parser.add_argument("--output", default="benchmarks/results",
                        help="Output directory")
    parser.add_argument("--no-charts", action="store_true")
    args = parser.parse_args()

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("  MIKK AGGRESSIVE BENCHMARK — running all tests...")
    print("=" * 60)
    t_start = time.perf_counter()

    run_all_tests()

    elapsed = time.perf_counter() - t_start
    print(f"\n  Completed {len(results)} tests in {elapsed:.1f}s\n")

    print_matrix(results)
    save_json(results, out_dir)
    save_tsv(results, out_dir)

    if not args.no_charts:
        generate_charts(results, out_dir)

    print(f"\n  Results -> {out_dir.resolve()}")

if __name__ == "__main__":
    main()
