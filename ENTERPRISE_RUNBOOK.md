# Mikk Enterprise Runbook

Date: 2026-04-03
Owner: Core + CLI + MCP maintainers
Status: Active

## Purpose

This runbook defines production rollout, operational guardrails, and incident handling for Mikk in engineering teams using CI-gated architecture workflows.

## Rollout Phases

### Phase 0: Baseline Validation (1-2 days)

Goals:
- Confirm all mandatory gates are green on main.
- Confirm parser runtime dependencies are available in CI and dev environments.

Required checks:
1. bun run build
2. bun run test
3. bun run check:mcp-consistency
4. mikk doctor
5. mikk analyze --strict-parsing
6. mikk ci --strict

Exit criteria:
- 3 consecutive green runs on default branch.
- No MCP docs/registry drift.
- No strict parsing failures.

### Phase 1: Team Pilot (3-7 days)

Goals:
- Enable Mikk workflows for one or two repositories.
- Validate onboarding and refactor workflows with real PR traffic.

Required team workflow:
1. mikk analyze after code changes
2. mikk intent before high-risk refactors
3. mikk context query/context for before large AI-assisted edits
4. mikk ci --strict as PR gate

Exit criteria:
- No pipeline instability introduced by Mikk gates.
- No unresolved architectural drift incidents.

### Phase 2: Wider Adoption (1-2 weeks)

Goals:
- Apply workflow standards across target repositories.
- Track quality trends using dashboard metrics.

Required governance:
- Add this runbook link in team engineering standards.
- Require strict parsing and architecture gate in protected branches.

Exit criteria:
- Dashboard metrics reported at least weekly.
- Incident response tested at least once (tabletop or real).

## Required CI Gates

These checks are required for merge on protected branches:
1. Build and tests pass
2. MCP consistency gate passes
3. Strict parsing profile passes
4. Architecture gate passes (mikk ci --strict)

Recommended command sequence:

```bash
bun run build
bun run test
bun run check:mcp-consistency
node packages/cli/dist/index.js doctor
node packages/cli/dist/index.js analyze --strict-parsing
node packages/cli/dist/index.js ci --strict
```

## Incident Playbook

### Severity Levels

- SEV-1: CI-wide blocking failures (strict parsing gate always failing, lock write corruption risk).
- SEV-2: Partial workflow degradation (single language runtime unavailable, intermittent gate failures).
- SEV-3: Documentation/tooling drift without production impact.

### Triage Steps

1. Identify failing gate and first bad commit.
2. Run local reproduction:
   - mikk doctor
   - mikk analyze --strict-parsing
   - bun test relevant package tests
3. Check lock and contract freshness:
   - mikk diff
   - mikk get_changes (MCP)
4. If write-path issue suspected, run transaction recovery on startup path by rerunning analyze/init and verify lock integrity.

### Containment

- For SEV-1, temporarily block merges while keeping existing deployed artifacts unchanged.
- For parser runtime outages, pin environment and restore known-good parser dependencies.
- For docs/registry drift, fix and re-enable gate in same PR.

### Resolution and Postmortem

- Patch with tests first.
- Re-run all required gates.
- Record root cause and prevention action in ADR or incident notes.

## Parser Runtime Troubleshooting

If doctor reports parser runtime missing:
1. Confirm runtime deps are installed in the active environment.
2. Rebuild package artifacts:
   - bun run build
3. Re-run preflight:
   - mikk doctor
4. Validate strict path:
   - mikk analyze --strict-parsing

If still failing:
- Verify language-specific Tree-sitter runtime availability.
- Fallback to scoped impact mitigation (limit non-critical changes) until runtime is restored.

## Upgrade Procedure

1. Create upgrade branch.
2. Update dependencies and build artifacts.
3. Run required CI gates locally.
4. Run dashboard metrics command and compare baseline.
5. Open PR with:
   - Gate outputs
   - Metric deltas
   - Rollback plan

Rollback plan:
- Revert upgrade commit(s).
- Re-run required gates.
- Confirm lock/contract integrity and MCP consistency.

## Operational Checklist

Before each release candidate:
1. Gates green (all required checks).
2. Dashboard metrics reviewed.
3. No unresolved SEV-1/SEV-2 incidents.
4. ADRs updated for major architectural changes.

After each release:
1. Monitor first CI cycle and workflow logs.
2. Confirm no parser/runtime regressions.
3. Capture lessons into this runbook.
