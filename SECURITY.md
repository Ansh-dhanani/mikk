# Security Policy

## Supported Versions

Mikk follows semantic versioning. Security fixes are backported to the current stable release only.

| Version | Security Updates |
|---------|-----------------|
| Latest stable (`npm install -g @getmikk/cli`) | ✅ Yes |
| Older versions | ❌ No — update to latest |

## Reporting a Vulnerability

If you find a security issue in Mikk, please **do not open a public GitHub issue**.

Report privately via:

- **GitHub**: Use the [Security Advisories](https://github.com/getmikk/mikk/security/advisories) tab (preferred)
- **Email**: security@getmikk.dev (if the repo link is unavailable)

Please include:
- A description of the vulnerability
- Steps to reproduce
- The affected version (`mikk --version`)
- Any suggested mitigations

You can expect an acknowledgement within 48 hours and a status update within 7 days.

## Security Notes

Mikk is a local-only tool. All analysis runs on your machine:

- **No telemetry.** No data is sent to external servers.
- **No cloud storage.** `mikk.lock.json` and all artifacts stay on your filesystem.
- **File access is path-guarded.** The MCP server only reads files inside the declared `projectRoot`. Path traversal attempts are rejected.
- **Semantic search embeddings** are computed locally via `@xenova/transformers` if installed. No API keys required.

The security scanner (`mikk_security_scan` / `mikk security-scan`) is a static pattern matcher. It is not a substitute for a professional security audit.
