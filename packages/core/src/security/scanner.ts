// ---------------------------------------------------------------------------
// Security Vulnerability Scanning — foundation for detecting common patterns
// ---------------------------------------------------------------------------

export interface SecurityFinding {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: string
  title: string
  description: string
  file: string
  line: number
  column?: number
  code: string
  suggestion?: string
  cwe?: string
  cve?: string
}

export interface SecurityReport {
  findings: SecurityFinding[]
  summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    info: number
  }
  scannedFiles: number
  scanDuration: number
}

// ---------------------------------------------------------------------------
// Pattern definitions for common vulnerability categories
// ---------------------------------------------------------------------------

interface VulnerabilityPattern {
  id: string
  severity: SecurityFinding['severity']
  category: string
  title: string
  description: string
  regex: RegExp
  suggestion?: string
  cwe?: string
  languages?: string[]
}

const VULNERABILITY_PATTERNS: VulnerabilityPattern[] = [
  // SQL Injection
  {
    id: 'sql-injection',
    severity: 'critical',
    category: 'injection',
    title: 'Potential SQL Injection',
    description: 'String concatenation in SQL query detected. Use parameterized queries instead.',
    regex: /(?:execute|query|cursor\.execute)\s*\(\s*["'].*(?:\+|\$\{)/,
    suggestion: 'Use parameterized queries: cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))',
    cwe: 'CWE-89',
    languages: ['python', 'javascript', 'typescript'],
  },
  {
    id: 'sql-injection-fstring',
    severity: 'critical',
    category: 'injection',
    title: 'SQL Injection via f-string',
    description: 'f-string used in SQL query. Use parameterized queries.',
    regex: /(?:execute|query)\s*\(\s*f["']/,
    suggestion: 'Use parameterized queries instead of f-strings in SQL.',
    cwe: 'CWE-89',
    languages: ['python'],
  },

  // Command Injection
  {
    id: 'command-injection',
    severity: 'critical',
    category: 'injection',
    title: 'Potential Command Injection',
    description: 'User input may be passed to shell command. Use subprocess with list args instead.',
    regex: /(?:os\.system|subprocess\.call|subprocess\.Popen|exec|eval)\s*\(\s*(?:.*\+|.*\$\{)/,
    suggestion: 'Use subprocess.run() with a list of arguments instead of shell=True.',
    cwe: 'CWE-78',
    languages: ['python'],
  },
  {
    id: 'eval-usage',
    severity: 'high',
    category: 'injection',
    title: 'Use of eval()',
    description: 'eval() can execute arbitrary code. Use ast.literal_eval() for safe parsing.',
    regex: /\beval\s*\(/,
    suggestion: 'Use ast.literal_eval() for parsing Python literals, or json.loads() for JSON.',
    cwe: 'CWE-95',
    languages: ['python', 'javascript', 'typescript'],
  },

  // Hardcoded Secrets
  {
    id: 'hardcoded-password',
    severity: 'high',
    category: 'secrets',
    title: 'Hardcoded Password',
    description: 'Password appears to be hardcoded in source code.',
    regex: /(?:password|passwd|pwd)\s*[:=]\s*[`"'][^`"']{3,}[`"']/i,
    suggestion: 'Use environment variables or a secrets manager.',
    cwe: 'CWE-798',
  },
  {
    id: 'hardcoded-api-key',
    severity: 'high',
    category: 'secrets',
    title: 'Hardcoded API Key',
    description: 'API key or token appears to be hardcoded.',
    regex: /(?:api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token)\s*[:=]\s*[`"'][A-Za-z0-9_-]{8,}[`"']/im,
    suggestion: 'Use environment variables or a secrets manager.',
    cwe: 'CWE-798',
  },
  {
    id: 'aws-key',
    severity: 'critical',
    category: 'secrets',
    title: 'AWS Access Key',
    description: 'AWS access key pattern detected.',
    regex: /AKIA[0-9A-Z]{16}/,
    suggestion: 'Remove AWS credentials from source code. Use IAM roles or environment variables.',
    cwe: 'CWE-798',
  },
  {
    id: 'private-key',
    severity: 'critical',
    category: 'secrets',
    title: 'Private Key',
    description: 'Private key content detected in source code.',
    regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
    suggestion: 'Never embed private keys in source code. Use a secrets manager.',
    cwe: 'CWE-798',
  },
  {
    id: 'obfuscated-secret',
    severity: 'high',
    category: 'secrets',
    title: 'Obfuscated Secret',
    description: 'Secret hidden via base64 or hex encoding detected.',
    regex: /(?:base64|hex|Buffer\.from|atob)\s*\(\s*[`"'](?:[A-Za-z0-9+/]{20,}|[0-9a-f]{40,})[`"']\s*\)/i,
    suggestion: 'Avoid storing secrets in obfuscated forms; use environment variables.',
    cwe: 'CWE-798',
  },
  {
    id: 'high-entropy-string',
    severity: 'medium',
    category: 'secrets',
    title: 'High Entropy String',
    description: 'A long string with high character diversity was found, likely a secret.',
    regex: /[`"'][A-Za-z0-9+/=_-]{32,}[`"']/,
    suggestion: 'Review this string to ensure it is not a sensitive credential.',
    cwe: 'CWE-798',
  },

  // XSS
  {
    id: 'xss-innerhtml',
    severity: 'high',
    category: 'xss',
    title: 'Potential XSS via innerHTML',
    description: 'Setting innerHTML with dynamic content can lead to XSS.',
    regex: /\.innerHTML\s*=\s*(?!["']\s*;?\s*$)/,
    suggestion: 'Use textContent or sanitize HTML with DOMPurify.',
    cwe: 'CWE-79',
    languages: ['javascript', 'typescript'],
  },
  {
    id: 'xss-dangerouslySetInnerHTML',
    severity: 'high',
    category: 'xss',
    title: 'Potential XSS via dangerouslySetInnerHTML',
    description: 'dangerouslySetInnerHTML with dynamic content can lead to XSS.',
    regex: /dangerouslySetInnerHTML\s*=\s*\{\{?\s*__html\s*:/,
    suggestion: 'Sanitize HTML content with DOMPurify before using dangerouslySetInnerHTML.',
    cwe: 'CWE-79',
    languages: ['javascript', 'typescript'],
  },

  // Insecure Random
  {
    id: 'insecure-random',
    severity: 'medium',
    category: 'crypto',
    title: 'Insecure Random Number Generator',
    description: 'Math.random() is not cryptographically secure.',
    regex: /Math\.random\s*\(\)/,
    suggestion: 'Use crypto.getRandomValues() for security-sensitive operations.',
    cwe: 'CWE-330',
    languages: ['javascript', 'typescript'],
  },

  // Path Traversal
  {
    id: 'path-traversal',
    severity: 'high',
    category: 'path-traversal',
    title: 'Potential Path Traversal',
    description: 'User input used in file path without sanitization.',
    regex: /(?:readFile|readFileSync|open|writeFile|writeFileSync)\s*\(\s*(?:.*\+|.*\$\{)/,
    suggestion: 'Validate and sanitize file paths. Use path.resolve() with a whitelist.',
    cwe: 'CWE-22',
    languages: ['javascript', 'typescript', 'python'],
  },

  // Weak Cryptography
  {
    id: 'weak-hash-md5',
    severity: 'medium',
    category: 'crypto',
    title: 'Weak Hashing Algorithm (MD5)',
    description: 'MD5 is cryptographically broken. Use SHA-256 or better.',
    regex: /(?:md5|MD5|hashlib\.md5)/,
    suggestion: 'Use SHA-256 or SHA-3 for cryptographic hashing.',
    cwe: 'CWE-328',
  },
  {
    id: 'weak-hash-sha1',
    severity: 'medium',
    category: 'crypto',
    title: 'Weak Hashing Algorithm (SHA-1)',
    description: 'SHA-1 is deprecated for cryptographic use. Use SHA-256 or better.',
    regex: /(?:sha1|SHA1|hashlib\.sha1)/,
    suggestion: 'Use SHA-256 or SHA-3 for cryptographic hashing.',
    cwe: 'CWE-328',
  },

  // Debug/Console in Production
  {
    id: 'console-log',
    severity: 'info',
    category: 'best-practice',
    title: 'Console Log Statement',
    description: 'Console.log statements should be removed before production.',
    regex: /console\.(log|debug|info|warn)\s*\(/,
    suggestion: 'Use a proper logging framework and remove debug statements.',
    languages: ['javascript', 'typescript'],
  },
  {
    id: 'print-debug',
    severity: 'info',
    category: 'best-practice',
    title: 'Print Debug Statement',
    description: 'Print statements should be removed before production.',
    regex: /print\s*\(\s*["'][^"']*["']\s*\)/,
    suggestion: 'Use the logging module instead of print statements.',
    languages: ['python'],
  },

  // TODO/FIXME/HACK
  {
    id: 'todo-comment',
    severity: 'info',
    category: 'best-practice',
    title: 'TODO Comment',
    description: 'TODO comment found. Consider addressing this.',
    regex: /\/\/\s*TODO|\/\*\s*TODO|#\s*TODO/i,
    languages: ['javascript', 'typescript', 'python', 'go', 'java', 'rust'],
  },
]

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export class SecurityScanner {
  private patterns: VulnerabilityPattern[]

  constructor(customPatterns?: VulnerabilityPattern[]) {
    this.patterns = customPatterns ?? VULNERABILITY_PATTERNS
  }

  /**
   * Scan a single file's content for security issues.
   */
  scanFile(filePath: string, content: string, language?: string): SecurityFinding[] {
    const findings: SecurityFinding[] = []
    const lines = content.split('\n')

    for (const pattern of this.patterns) {
      // Skip if language filter doesn't match
      if (pattern.languages && language && !pattern.languages.includes(language)) {
        continue
      }

      // Multi-line scan with 's' (dotall) support for template literals
      const flags = (pattern.regex.flags.includes('g') ? pattern.regex.flags : pattern.regex.flags + 'g')
        + (pattern.regex.flags.includes('s') ? '' : 's')
      const globalRegex = new RegExp(pattern.regex.source, flags)

      let m: RegExpExecArray | null
      while ((m = globalRegex.exec(content)) !== null) {
        const lineIndex = content.slice(0, m.index).split('\n').length
        const finding: SecurityFinding = {
          id: `${pattern.id}-${filePath}:${lineIndex}`,
          severity: pattern.severity,
          category: pattern.category,
          title: pattern.title,
          description: pattern.description,
          file: filePath,
          line: lineIndex,
          column: m.index - content.lastIndexOf('\n', m.index),
          code: content.split('\n')[lineIndex - 1]?.trim() ?? 'unknown',
          suggestion: pattern.suggestion,
          cwe: pattern.cwe,
        }
        findings.push(finding)

        // Pass 2: If finding is an obfuscated secret, try to decode and scan recursively
        if (pattern.id === 'obfuscated-secret' && m[0]) {
          try {
            const encoded = m[0].match(/[`"']([^`"']+)[`"']/)?.[1]
            if (encoded) {
              let decoded = ''
              if (m[0].toLowerCase().includes('base64') || m[0].toLowerCase().includes('atob')) {
                decoded = Buffer.from(encoded, 'base64').toString('utf-8')
              } else if (m[0].toLowerCase().includes('hex')) {
                decoded = Buffer.from(encoded, 'hex').toString('utf-8')
              }
              if (decoded && decoded.length > 8) {
                const subFindings = this.scanFile(`${filePath}#decoded`, decoded, language)
                for (const sub of subFindings) {
                  sub.title = `[DECODED] ${sub.title}`
                  sub.description = `Decoded from obfuscated string: ${sub.description}`
                  sub.line = lineIndex // Attribute to the original line
                  findings.push(sub)
                }
              }
            }
          } catch { /* ignore decode errors */ }
        }
      }
    }

    return findings
  }

  /**
   * Scan multiple files.
   */
  scanFiles(
    files: Array<{ path: string; content: string; language?: string }>
  ): SecurityReport {
    const startTime = Date.now()
    const allFindings: SecurityFinding[] = []

    for (const file of files) {
      const findings = this.scanFile(file.path, file.content, file.language)
      allFindings.push(...findings)
    }

    const summary = {
      total: allFindings.length,
      critical: allFindings.filter(f => f.severity === 'critical').length,
      high: allFindings.filter(f => f.severity === 'high').length,
      medium: allFindings.filter(f => f.severity === 'medium').length,
      low: allFindings.filter(f => f.severity === 'low').length,
      info: allFindings.filter(f => f.severity === 'info').length,
    }

    return {
      findings: allFindings.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
        return severityOrder[a.severity] - severityOrder[b.severity]
      }),
      summary,
      scannedFiles: files.length,
      scanDuration: Date.now() - startTime,
    }
  }

  /**
   * Add custom vulnerability patterns.
   */
  addPattern(pattern: VulnerabilityPattern): void {
    this.patterns.push(pattern)
  }

  /**
   * Get all available patterns.
   */
  getPatterns(): VulnerabilityPattern[] {
    return [...this.patterns]
  }
}
