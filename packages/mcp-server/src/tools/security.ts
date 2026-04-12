import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { loadContractAndLock, isSourceFile } from './shared.js'

// ─── Shared patterns ─────────────────────────────────────────────────────────
// Expanded secrets detection - 50+ patterns covering major cloud providers, databases, and languages
const SECRET_SCAN_PATTERNS = [
    // ═══════════════════════════════════════════════════════════════════════
    // CLOUD PROVIDERS (20+ patterns)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'aws_access_key',    pattern: /AKIA[0-9A-Z]{16}/,                                        severity: 'critical', label: 'AWS Access Key ID',       envVar: 'AWS_ACCESS_KEY_ID' },
    { id: 'aws_secret_key',  pattern: /(?:AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\s*[=:]\s*["'][A-Za-z0-9/+=]{40}["']/i, severity: 'critical', label: 'AWS Secret Access Key', envVar: 'AWS_SECRET_ACCESS_KEY' },
    { id: 'github_token',      pattern: /(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{36,}/,                  severity: 'critical', label: 'GitHub Token',             envVar: 'GITHUB_TOKEN' },
    { id: 'gitlab_token',    pattern: /glpat-[A-Za-z0-9_-]{20,}/,                                  severity: 'critical', label: 'GitLab Token',            envVar: 'GITLAB_TOKEN' },
    { id: 'bitbucket_token',  pattern: /TBi_[A-Za-z0-9_-]{39}/,                                    severity: 'critical', label: 'Bitbucket Token',         envVar: 'BITBUCKET_TOKEN' },
    { id: 'stripe_sk',         pattern: /sk_live_[A-Za-z0-9]{24,}/,                               severity: 'critical', label: 'Stripe Secret Key',        envVar: 'STRIPE_SECRET_KEY' },
    { id: 'stripe_webhook',    pattern: /whsec_[A-Za-z0-9]{32,}/,                                 severity: 'critical', label: 'Stripe Webhook Secret',    envVar: 'STRIPE_WEBHOOK_SECRET' },
    { id: 'openai_key',        pattern: /sk-[A-Za-z0-9]{48,}/,                                    severity: 'critical', label: 'OpenAI API Key',           envVar: 'OPENAI_API_KEY' },
    { id: 'anthropic_key',     pattern: /sk-ant-[A-Za-z0-9_-]{48,}/,                              severity: 'critical', label: 'Anthropic API Key',        envVar: 'ANTHROPIC_API_KEY' },
    { id: 'google_ai_key',     pattern: /AIza[0-9A-Za-z_-]{35}/,                                  severity: 'critical', label: 'Google AI API Key',        envVar: 'GOOGLE_AI_API_KEY' },
    { id: 'firebase_key',       pattern: /AIza[0-9A-Za-z_-]{23}[A-Za-z0-9_-]{27}/,                   severity: 'critical', label: 'Firebase API Key',       envVar: 'FIREBASE_API_KEY' },
    { id: 'google_cloud_key',  pattern: /[0-9]+-[A-Za-z0-9_]{32}\.apps\.googleusercontent\.com/, severity: 'critical', label: 'Google Cloud OAuth',     envVar: 'GOOGLE_CLOUD_OAUTH' },
    { id: 'huggingface',       pattern: /hf_[A-Za-z0-9]{48,}/,                                    severity: 'critical', label: 'HuggingFace Token',        envVar: 'HUGGINGFACE_TOKEN' },
    { id: 'sendgrid_key',      pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/,              severity: 'critical', label: 'SendGrid API Key',         envVar: 'SENDGRID_API_KEY' },
    { id: 'twilio_key',       pattern: /SK[0-9a-f]{32}/,                                       severity: 'critical', label: 'Twilio API Key',           envVar: 'TWILIO_API_KEY' },
    { id: 'slack_token',       pattern: /xox[baprs]-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24,}/,     severity: 'critical', label: 'Slack Token',              envVar: 'SLACK_TOKEN' },
    { id: 'cloudflare_token',  pattern: /[A-Za-z0-9_-]{40}/,                                     severity: 'critical', label: 'Cloudflare API Token',   envVar: 'CLOUDFLARE_TOKEN', needsContext: ['cloudflare', 'cf_token'] },
    { id: 'azure_token',      pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, severity: 'critical', label: 'Azure Client Secret',     envVar: 'AZURE_CLIENT_SECRET', needsContext: ['azure', 'client_secret'] },
    { id: 'digitalocean_token', pattern: /[A-Za-z0-9_-]{64}/,                                     severity: 'critical', label: 'DigitalOcean Token',      envVar: 'DO_ACCESS_TOKEN', needsContext: ['digitalocean'] },
    { id: 'heroku_key',        pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, severity: 'critical', label: 'Heroku API Key',          envVar: 'HEROKU_API_KEY', needsContext: ['heroku'] },
    { id: 'npm_token',        pattern: /npm_[A-Za-z0-9_-]{36}/,                                    severity: 'critical', label: 'NPM Token',               envVar: 'NPM_TOKEN' },

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE KEYS & CREDENTIALS
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'private_key',       pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, severity: 'critical', label: 'Private Key',              envVar: 'PRIVATE_KEY' },
    { id: 'aws_gov_key',      pattern: /AG[0-9A-Z]{20}/,                                       severity: 'critical', label: 'AWS GovCloud Key',       envVar: 'AWS_GOV_ACCESS_KEY_ID' },

    // ═══════════════════════════════════════════════════════════════════════
    // DATABASE CONNECTIONS (10+ patterns)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'mongodb_connection', pattern: /mongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@/i,                    severity: 'critical', label: 'MongoDB Connection',      envVar: 'MONGODB_URI' },
    { id: 'postgres_connection', pattern: /postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/i,                severity: 'critical', label: 'PostgreSQL Connection',  envVar: 'DATABASE_URL' },
    { id: 'mysql_connection',  pattern: /mysql:\/\/[^:\s]+:[^@\s]+@/i,                         severity: 'critical', label: 'MySQL Connection',        envVar: 'MYSQL_URL' },
    { id: 'redis_connection',   pattern: /redis:\/\/[^:\s]+:[^@\s]+@/i,                          severity: 'critical', label: 'Redis Connection',         envVar: 'REDIS_URL' },
    { id: 'mssql_connection',  pattern: /Server=[^;]+;Database=[^;]+;User Id=[^;]+;Password=[^;]+;/i, severity: 'critical', label: 'MSSQL Connection',        envVar: 'MSSQL_CONNECTION', needsContext: ['mssql', 'sqlserver'] },
    { id: 'oracle_connection', pattern: /(?:DATA SOURCE|HOST)=[^;]+;(?:USER ID|UID)=[^;]+;(?:PASSWORD|PWD)=[^;]+/i, severity: 'critical', label: 'Oracle Connection',      envVar: 'ORACLE_CONNECTION', needsContext: ['oracle'] },
    { id: 'elasticsearch',    pattern: /https?:\/\/[A-Za-z0-9_-]+:[^@\s]+@[^,\s"]+/i,                severity: 'critical', label: 'Elasticsearch',         envVar: 'ELASTICSEARCH_URL', needsContext: ['elasticsearch'] },

    // ═══════════════════════════════════════���═══════════════════════════════
    // GENERIC SECRETS (language-agnostic patterns)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'jwt_hardcoded',   pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/, severity: 'high', label: 'Hardcoded JWT', envVar: 'JWT_SECRET', needsContext: ['secret', 'token', 'jwt'] },
    { id: 'generic_api_key', pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*["'][A-Za-z0-9_-]{20,}["']/i, severity: 'high', label: 'Hardcoded API Key', envVar: 'API_KEY' },
    { id: 'generic_secret',  pattern: /(?:secret|password|passwd|pwd)\s*[=:]\s*["'][A-Za-z0-9_\-!@#$%]{8,}["']/i, severity: 'high', label: 'Hardcoded Secret', envVar: 'SECRET', needsContext: ['secret', 'password', 'pass'] },
    { id: 'bearer_token',    pattern: /Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, severity: 'high', label: 'Bearer Token', envVar: 'BEARER_TOKEN', needsContext: ['bearer', 'authorization'] },

    // ═══════════════════════════════════════════════════════════════════════
    // LANGUAGE-SPECIFIC ENV ACCESS (10+ patterns)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'python_secret',   pattern: /os\.environ\.get\(["'][A-Za-z_][A-Za-z0-9_]*["']/i, severity: 'medium', label: 'Python os.environ', envVar: '', needsContext: ['secret', 'key', 'token'] },
    { id: 'python_secrets', pattern: /os\.getenv\(["'][A-Za-z_][A-Za-z0-9_]*["']/i, severity: 'medium', label: 'Python os.getenv', envVar: '', needsContext: ['secret', 'key'] },
    { id: 'go_secret',      pattern: /os\.Getenv\(["'][A-Za-z_][A-Za-z0-9_]*["']/i, severity: 'medium', label: 'Go os.Getenv', envVar: '', needsContext: ['secret', 'key'] },
    { id: 'rust_secret',   pattern: /std::env::var\(["'][A-Za-z_][A-Za-z0-9_]*["']/i, severity: 'medium', label: 'Rust env::var', envVar: '', needsContext: ['secret', 'key'] },
    { id: 'java_secret',   pattern: /System\.getenv\(["'][A-Za-z_][A-Za-z0-9_]*["']/i, severity: 'medium', label: 'Java System.getenv', envVar: '', needsContext: ['secret', 'key'] },
    { id: 'ruby_secret',    pattern: /ENV\[["'][A-Za-z_][A-Za-z0-9_]*["']\]/i, severity: 'medium', label: 'Ruby ENV access', envVar: '', needsContext: ['secret', 'key', 'token'] },
    { id: 'dotnet_secret', pattern: /Environment\.GetEnvironmentVariable\(["'][A-Za-z_][A-Za-z0-9_]*["']/i, severity: 'medium', label: '.NET env var', envVar: '', needsContext: ['secret', 'key'] },
    { id: 'php_secret',    pattern: /getenv\(["'][A-Za-z_][A-Za-z0-9_]*["']/i, severity: 'medium', label: 'PHP getenv', envVar: '', needsContext: ['secret', 'key'] },

    // ═══════════════════════════════════════════════════════════════════════
    // SECURITY VULNERABILITIES
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'sql_injection',     pattern: /`SELECT[\s\S]*?\$\{/,                                     severity: 'critical', label: 'SQL Injection Risk',       envVar: '' },
    { id: 'eval_usage',        pattern: /\beval\s*\(/,                                             severity: 'critical', label: 'Dangerous eval()',          envVar: '' },
    { id: 'inner_html',        pattern: /\.innerHTML\s*=/,                                         severity: 'high',     label: 'XSS via innerHTML',        envVar: '' },
    { id: 'react_xss',         pattern: /dangerouslySetInnerHTML/,                                 severity: 'high',     label: 'React XSS Risk',           envVar: '' },
    { id: 'cors_wildcard',     pattern: /Access-Control-Allow-Origin['":\s]*\*/i,                  severity: 'high',     label: 'CORS Wildcard',            envVar: '' },
    { id: 'hardcoded_crypto',  pattern: /CryptoJS\.AES\.encrypt\([^,]+,\s*["'][^"']+["']/i,              severity: 'high', label: 'Hardcoded Crypto Key',   envVar: '', needsContext: ['crypto', 'encrypt'] },
    { id: 'insecure_protocol',  pattern: /http:\/\/(?!localhost|127\.0\.0\.1)[A-Za-z0-9]/,                severity: 'medium', label: 'Insecure HTTP',            envVar: '' },
    { id: 'debug_enabled',     pattern: /DEBUG\s*[=:]\s*true/i,                                      severity: 'medium', label: 'Debug Mode Enabled',     envVar: '' },

    // ═══════════════════════════════════════════════════════════════════════
    // PII & COMPLIANCE
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'ssn',               pattern: /\b\d{3}-\d{2}-\d{4}\b/,                                  severity: 'high',     label: 'SSN (PII)',                envVar: '' },
    { id: 'credit_card',       pattern: /\b(?:\d{4}[- ]?){3}\d{4}\b/,                             severity: 'high',     label: 'Credit Card (PII)',        envVar: '', needsContext: ['card', 'credit', 'payment'] },
    { id: 'email_pii',         pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,           severity: 'medium', label: 'Email Address (PII)',    envVar: '', needsContext: ['email', 'contact', 'user'] },
    { id: 'phone_pii',         pattern: /\+?1?\d{9,14}/,                                          severity: 'medium', label: 'Phone Number (PII)',      envVar: '', needsContext: ['phone', 'mobile', 'contact'] },
]
const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache', '*.min.js', '*.map', '.env']

function isExcluded(filePath: string, patterns: string[]): boolean {
    const n = filePath.replace(/\\/g, '/')
    return patterns.some(p => p.includes('*') ? new RegExp('^' + p.replace(/\*/g, '.*') + '$').test(n) : n.includes(p))
}

export function registerSecurityTools(server: McpServer, projectRoot: string) {

    // ── mikk_secrets_scan ────────────────────────────────────────────────────
    // Read-only scan — safe in CI/pre-commit. Does NOT modify files.
    ;(server as any).tool(
        'mikk_secrets_scan',
        'Scan for hardcoded secrets, API keys, tokens, connection strings, and security vulnerabilities (SQLi, XSS, eval, CORS wildcards). READ-ONLY — does not modify files. Safe for CI/pre-commit. AFTER THIS: Use mikk_secrets_replace to automatically replace found secrets with process.env references.',
        {
            path: z.string().optional().describe('Directory to scan (relative to project root). Default: all tracked source files.'),
            exclude: z.array(z.string()).optional().describe('Additional patterns to exclude (e.g., ["*.test.ts", "fixtures/"])'),
            severity: z.enum(['critical', 'high', 'medium', 'all']).optional().default('all').describe('Minimum severity to report'),
            recursive: z.boolean().optional().default(true),
        },
        async (args: any): Promise<any> => {
            const { path: scanPath, exclude, severity, recursive } = args as any
            const { lock } = await loadContractAndLock(projectRoot)
            const minSev = SEVERITY_ORDER[severity === 'all' ? 'info' : severity] ?? 0
            const excludePatterns = [...DEFAULT_EXCLUDES, ...(exclude || [])]
            const filesToScan: string[] = []

            if (scanPath) {
                const baseDir = path.join(projectRoot, scanPath)
                const walk = async (dir: string, depth = 0): Promise<void> => {
                    if (depth > 10 || isExcluded(dir, excludePatterns)) return
                    try {
                        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
                            const full = path.join(dir, entry.name)
                            if (entry.isDirectory()) { if (recursive !== false) await walk(full, depth + 1) }
                            else if (entry.isFile() && isSourceFile(full) && !isExcluded(path.relative(projectRoot, full), excludePatterns)) filesToScan.push(path.relative(projectRoot, full))
                        }
                    } catch { /* skip */ }
                }
                await walk(baseDir)
            } else {
                filesToScan.push(...Object.keys(lock.files).filter(f => isSourceFile(f) && !isExcluded(f, excludePatterns)))
            }

            const findings: any[] = []
            for (const relFile of filesToScan) {
                const fullPath = path.join(projectRoot, relFile)
                let content: string
                try { content = await fs.readFile(fullPath, 'utf-8') } catch { continue }
                const lines = content.split(/\r?\n/)
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i]
                    if (/^\s*(\/\/|#|\*|\/\*)/.test(line.trim())) continue  // skip comments
                    if (/process\.env\.|os\.environ\.|import\.meta\.env/.test(line)) continue // already replaced
                    for (const pat of SECRET_SCAN_PATTERNS) {
                        if ((SEVERITY_ORDER[pat.severity] ?? 0) < minSev) continue
                        if ((pat as any).needsContext && !(pat as any).needsContext.some((c: string) => line.toLowerCase().includes(c))) continue
                        const match = line.match(pat.pattern)
                        if (!match) continue
                        const val = match[1] || match[0]
                        if (val?.includes('${') || val?.includes('process.env')) continue
                        findings.push({ file: relFile, line: i + 1, severity: pat.severity, type: pat.label, id: pat.id, envVar: pat.envVar || null, context: line.trim().slice(0, 100), valuePreview: val ? (val.slice(0, 6) + '***') : undefined })
                        break // one finding per line
                    }
                }
            }

            const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
            for (const f of findings) (bySeverity as any)[f.severity] = ((bySeverity as any)[f.severity] || 0) + 1

            return { content: [{ type: 'text' as const, text: JSON.stringify({
                scannedFiles: filesToScan.length,
                totalFindings: findings.length,
                bySeverity,
                details: findings.slice(0, 100),
                warning: findings.length > 0 ? `⚠️ SECURITY: Found ${findings.length} issue(s). Do NOT commit without addressing critical/high findings.` : null,
                hint: findings.some(f => f.envVar) ? 'Use mikk_secrets_replace to automatically extract secrets to process.env references.' : findings.length > 0 ? 'Review and fix the findings above before committing.' : 'No secrets or vulnerabilities found.',
            }, null, 2) }] }
        },
    )

    // ── mikk_secrets_replace ─────────────────────────────────────────────────
    // DRY RUN by default. Rewrites source files, writes .env + .env.example.
    ;(server as any).tool(
        'mikk_secrets_replace',
        'Find hardcoded secrets and replace them in-place with process.env references. Writes real values to .env and blank placeholders to .env.example. DRY RUN by default (set dryRun=false to apply). AFTER THIS: Add .env to .gitignore immediately.',
        {
            files: z.array(z.string()).optional().describe('Files to process (relative paths). Default: all tracked source files.'),
            dryRun: z.boolean().optional().default(true).describe('Preview only — no file writes (default: true). Set false to apply.'),
            envFile: z.string().optional().default('.env'),
            envExampleFile: z.string().optional().default('.env.example'),
            prefix: z.string().optional().describe('Prefix for generated env var names (e.g. "APP" → APP_API_KEY)'),
        },
        async (args: any): Promise<any> => {
            const { files: inputFiles, dryRun, envFile: envFilePath, envExampleFile: envExamplePath, prefix } = args as any
            const { lock } = await loadContractAndLock(projectRoot)

            // Patterns that capture the actual secret value for replacement
            // Expanded to cover all major cloud providers
            const REPLACE_PATTERNS = [
                // Cloud Providers
                { id: 'aws-access-key',      regex: /(AKIA[0-9A-Z]{16})/,                                          valueGroup: 1, fixedEnvName: 'AWS_ACCESS_KEY_ID' },
                { id: 'github-token',         regex: /(gh[pouscv]_[A-Za-z0-9]{36,})/,                              valueGroup: 1, fixedEnvName: 'GITHUB_TOKEN' },
                { id: 'gitlab-token',         regex: /(glpat-[A-Za-z0-9_-]{20,})/,                                   valueGroup: 1, fixedEnvName: 'GITLAB_TOKEN' },
                { id: 'stripe-sk',            regex: /(sk_live_[A-Za-z0-9]{24,})/,                                 valueGroup: 1, fixedEnvName: 'STRIPE_SECRET_KEY' },
                { id: 'stripe-webhook',      regex: /(whsec_[A-Za-z0-9]{32,})/,                                   valueGroup: 1, fixedEnvName: 'STRIPE_WEBHOOK_SECRET' },
                { id: 'openai-key',           regex: /(sk-[A-Za-z0-9]{48,})/,                                      valueGroup: 1, fixedEnvName: 'OPENAI_API_KEY' },
                { id: 'anthropic-key',        regex: /(sk-ant-[A-Za-z0-9_-]{48,})/,                                valueGroup: 1, fixedEnvName: 'ANTHROPIC_API_KEY' },
                { id: 'google-ai-key',        regex: /(AIza[0-9A-Za-z_-]{35})/,                                      valueGroup: 1, fixedEnvName: 'GOOGLE_AI_API_KEY' },
                { id: 'firebase-key',         regex: /(AIza[0-9A-Za-z_-]{23}[A-Za-z0-9_-]{27})/,                     valueGroup: 1, fixedEnvName: 'FIREBASE_API_KEY' },
                { id: 'huggingface-token',    regex: /(hf_[A-Za-z0-9]{48,})/,                                       valueGroup: 1, fixedEnvName: 'HUGGINGFACE_TOKEN' },
                { id: 'sendgrid-key',          regex: /(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})/,               valueGroup: 1, fixedEnvName: 'SENDGRID_API_KEY' },
                { id: 'twilio-key',           regex: /(SK[0-9a-f]{32})/,                                           valueGroup: 1, fixedEnvName: 'TWILIO_API_KEY' },
                { id: 'slack-token',          regex: /(xox[baprs]-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24,})/,       valueGroup: 1, fixedEnvName: 'SLACK_TOKEN' },
                { id: 'npm-token',            regex: /(npm_[A-Za-z0-9_-]{36})/,                                      valueGroup: 1, fixedEnvName: 'NPM_TOKEN' },
                { id: 'private-key',          regex: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----)/,   valueGroup: 1, fixedEnvName: 'PRIVATE_KEY' },

                // Databases
                { id: 'mongodb-connection',   regex: /(mongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@[^\s'"]+)/i,                    valueGroup: 1, fixedEnvName: 'MONGODB_URI' },
                { id: 'postgres-connection',  regex: /(postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\s'"]+)/i,            valueGroup: 1, fixedEnvName: 'DATABASE_URL' },
                { id: 'mysql-connection',     regex: /(mysql:\/\/[^:\s]+:[^@\s]+@[^\s'"]+)/i,                       valueGroup: 1, fixedEnvName: 'MYSQL_URL' },
                { id: 'redis-connection',     regex: /(redis:\/\/[^:\s]+:[^@\s]+@[^\s'"]+)/i,                         valueGroup: 1, fixedEnvName: 'REDIS_URL' },
            ]

            function deriveEnvName(varName: string, pfx?: string): string {
                const snake = varName.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase()
                return pfx ? `${pfx.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase().replace(/_+$/, '')}_${snake}` : snake
            }
            const envRegistry = new Map<string, string>()
            function registerEnvName(base: string, value: string): string {
                for (const [name, val] of envRegistry) { if (val === value) return name }
                if (!envRegistry.has(base)) { envRegistry.set(base, value); return base }
                let i = 2; while (envRegistry.has(`${base}_${i}`)) i++; envRegistry.set(`${base}_${i}`, value); return `${base}_${i}`
            }
            function buildEnvRef(envName: string, filePath: string): string {
                const ext = path.extname(filePath).toLowerCase()
                switch (ext) {
                    case '.py':
                        return `os.environ.get('${envName}', '')`
                    case '.rb':
                        return `ENV['${envName}']`
                    case '.java':
                    case '.kt':
                        return `System.getenv("${envName}")`
                    case '.rs':
                        return `std::env::var("${envName}")`
                    case '.go':
                        return `os.Getenv("${envName}")`
                    case '.cs':
                        return `Environment.GetEnvironmentVariable("${envName}")`
                    case '.php':
                        return `getenv('${envName}')`
                    case '.ts':
                    case '.js':
                    case '.tsx':
                    case '.jsx':
                    default:
                        return `process.env.${envName}`
                }
            }

            interface Hit { file: string; lineNo: number; patternId: string; secretValue: string; envName: string; originalLine: string; newLine: string }
            const filesToScan: string[] = inputFiles?.length ? inputFiles : Object.keys(lock.files).filter(f => isSourceFile(f))
            const hits: Hit[] = []

            for (const relFile of filesToScan) {
                let fileContent: string
                try { fileContent = await fs.readFile(path.join(projectRoot, relFile), 'utf-8') } catch { continue }
                const fileLines = fileContent.split(/\r?\n/)
                for (let i = 0; i < fileLines.length; i++) {
                    const line = fileLines[i]
                    if (/^\s*(\/\/|#|\*)/.test(line.trim())) continue
                    if (/process\.env\.|os\.environ\.|import\.meta\.env/.test(line)) continue
                    for (const pat of REPLACE_PATTERNS) {
                        const match = line.match(pat.regex)
                        if (!match) continue
                        const secretValue = match[pat.valueGroup] ?? ''
                        if (!secretValue || secretValue.length < 4) continue
                        if (/^\$\{|^process\.env\.|^os\.environ/.test(secretValue)) continue
                        const baseEnvName = pat.fixedEnvName ?? deriveEnvName('SECRET', prefix)
                        const envName = registerEnvName(baseEnvName, secretValue)
                        const envRef = buildEnvRef(envName, relFile)
                        const newLine = line.replace(secretValue, envRef)
                        if (newLine === line) continue
                        hits.push({ file: relFile, lineNo: i + 1, patternId: pat.id, secretValue, envName, originalLine: line, newLine })
                        break
                    }
                }
            }

            const byFile: Record<string, Hit[]> = {}
            for (const hit of hits) { if (!byFile[hit.file]) byFile[hit.file] = []; byFile[hit.file].push(hit) }

            if (!dryRun && hits.length > 0) {
                for (const [relFile, fileHits] of Object.entries(byFile)) {
                    const rawContent = await fs.readFile(path.join(projectRoot, relFile), 'utf-8')
                    const useCRLF = rawContent.includes('\r\n')
                    const fileLines = rawContent.split(/\r?\n/)
                    for (const hit of [...fileHits].sort((a, b) => b.lineNo - a.lineNo)) fileLines[hit.lineNo - 1] = hit.newLine
                    await fs.writeFile(path.join(projectRoot, relFile), fileLines.join(useCRLF ? '\r\n' : '\n'), 'utf-8')
                }
                const envEntries = [...envRegistry].map(([k, v]) => `${k}=${v}`)
                const envExEntries = [...envRegistry].map(([k]) => `${k}=`)
                const envFull = path.join(projectRoot, envFilePath ?? '.env')
                const existingEnv = await fs.readFile(envFull, 'utf-8').catch(() => '')
                const newEnvLines = envEntries.filter(l => !existingEnv.includes(`${l.split('=')[0]}=`))
                if (newEnvLines.length) await fs.writeFile(envFull, existingEnv + (existingEnv.length && !existingEnv.endsWith('\n') ? '\n' : '') + newEnvLines.join('\n') + '\n', 'utf-8')
                const envExFull = path.join(projectRoot, envExamplePath ?? '.env.example')
                const existingEx = await fs.readFile(envExFull, 'utf-8').catch(() => '')
                const newExLines = envExEntries.filter(l => !existingEx.includes(`${l.split('=')[0]}=`))
                if (newExLines.length) await fs.writeFile(envExFull, existingEx + (existingEx.length && !existingEx.endsWith('\n') ? '\n' : '') + newExLines.join('\n') + '\n', 'utf-8')
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify({
                dryRun, found: hits.length, filesAffected: Object.keys(byFile).length, uniqueSecretsExtracted: envRegistry.size,
                changes: Object.entries(byFile).map(([file, fileHits]) => ({
                    file, count: fileHits.length,
                    replacements: fileHits.map(h => ({ line: h.lineNo, pattern: h.patternId, envName: h.envName, secretPreview: h.secretValue.slice(0, 4) + '***', before: h.originalLine.trim(), after: h.newLine.trim() })),
                })),
                envFile: { path: envFilePath ?? '.env', entries: [...envRegistry.keys()].map(k => `${k}=***`), written: !dryRun && hits.length > 0, warning: !dryRun && hits.length > 0 ? 'Contains real secrets — add to .gitignore now!' : undefined },
                envExample: { path: envExamplePath ?? '.env.example', entries: [...envRegistry.keys()].map(k => `${k}=`), written: !dryRun && hits.length > 0 },
                hint: dryRun ? `DRY RUN: ${hits.length} secret(s) found in ${Object.keys(byFile).length} file(s). Call again with dryRun=false to apply.` : `Applied. IMPORTANT: add ${envFilePath ?? '.env'} to .gitignore immediately!`,
            }, null, 2) }] }
        },
    )
}
