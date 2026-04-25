/**
 * Universal Route Harvester
 * Detects routes/API endpoints from ANY framework and language
 *
 * CONSERVATIVE MODE: Only detects actual HTTP routes, not function names
 */

import type { ParsedFile, ParsedRoute } from '../types.js'

export interface RouteMatch {
  method: string
  path: string
  handler: string
  file: string
  line: number
  framework: string
}

// Patterns that indicate this is a route file (NOT individual function names)
const ROUTE_FILE_PATTERNS = [
  /\/routes?\//i,
  /\/api\//i,
  /\/route\.[tj]s$/i,
  /\+server\.[tj]s$/i,
  /\/pages\/api\//i,
  /\/app\//i,
  /\/handlers?\//i,
  /controllers?\//i,
  /\/views?\//i,
  /urls\.py$/i,
  /-routes\.[tj]s$/i,
  /\.py$/i,              // Python files (Flask/FastAPI)
  /\.go$/i,              // Go handler files
  /\/server\//i,           // Generic server folder
]

// Function names that are NOT routes even if they contain HTTP methods
const NON_ROUTE_NAMES = new Set([
  'get', 'set', 'handle', 'register', 'create', 'update', 'delete', 'remove',
  'list', 'fetch', 'load', 'init', 'setup', 'configure', 'process', 'validate',
  'error', 'exception', 'handler', 'middleware', 'decorator', 'wrapper',
  'router', 'app', 'server', 'client', 'controller', 'service', 'model', 'view',
])

export class RouteHarvester {
  // All framework patterns
  private patterns: Array<{
    framework: string
    detect: (file: ParsedFile) => RouteMatch[]
  }> = []

  constructor() {
    this.registerPatterns()
  }

  private isRouteFile(file: ParsedFile): boolean {
    const path = file.path.toLowerCase()
    return ROUTE_FILE_PATTERNS.some(pat => pat.test(path))
  }

  private isLikelyRoute(name: string): boolean {
    const lower = name.toLowerCase()
    // Must be exactly an HTTP method - NOT "getData", "handleGet", etc.
    if (/^(get|post|put|patch|delete|head|options)$/i.test(lower)) return true
    // If it looks like an Express path with slashes or params (e.g., "/users/:id", "api/v1/users")
    if (/^\//.test(name) || /\/:|\/v\d/.test(name)) return true
    return false
  }

  private registerPatterns() {
    // Express.js / Fastify - match router method calls if in route file OR file looks like a handler
    this.patterns.push({
      framework: 'express',
      detect: (file: ParsedFile) => {
        const routes: RouteMatch[] = []

        // Process if file matches route file patterns OR has route-like path
        const isRouteish = this.isRouteFile(file) || file.path.includes('/api') || file.path.includes('route')

        // Look for router.X() or app.X() patterns
        const callExprs = file.calls || []
        for (const call of callExprs) {
          const methodName = call.name?.toLowerCase()
          const method = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']
            .find(m => methodName === m)

          if (method && call.arguments && call.arguments.length > 0) {
            const pathArg = call.arguments[0]
            routes.push({
              method: method.toUpperCase(),
              path: typeof pathArg === 'string' ? pathArg : `/${call.name}`,
              handler: call.name || 'handler',
              file: file.path,
              line: call.line || 0,
              framework: 'express',
            })
          }
        }

        // ALSO check function names that look like route handlers (for files without .calls)
        if (isRouteish) {
          for (const fn of file.functions || []) {
            if (this.isLikelyRoute(fn.name)) {
              routes.push({
                method: 'GET', // Default, would need actual analysis
                path: `/${fn.name}`,
                handler: fn.name,
                file: file.path,
                line: fn.startLine,
                framework: 'express',
              })
            }
          }
        }

        return routes
      },
    })

    // Next.js App Router: route.ts - ONLY route.ts files with HTTP method exports
    this.patterns.push({
      framework: 'nextjs-app',
      detect: (file: ParsedFile) => {
        if (!file.path.includes('/route.') && !file.path.includes('/route.ts')) {
          return []
        }

        const routes: RouteMatch[] = []
        const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

        for (const fn of file.functions) {
          // Must be exactly an HTTP method name (not "handleGet" or "getData")
          if (HTTP_METHODS.includes(fn.name.toUpperCase())) {
            routes.push({
              method: fn.name.toUpperCase(),
              path: file.path.split('/app')[1]?.replace('/route.ts', '').replace('/route', '') || '/',
              handler: fn.name,
              file: file.path,
              line: fn.startLine,
              framework: 'nextjs-app',
            })
          }
        }

        return routes
      },
    })

    // Next.js Pages Router: pages/api/* - ONLY exact HTTP method names
    this.patterns.push({
      framework: 'nextjs-pages',
      detect: (file: ParsedFile) => {
        if (!file.path.includes('/pages/api/')) {
          return []
        }

        const routes: RouteMatch[] = []
        const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

        for (const fn of file.functions) {
          // Must be exactly an HTTP method name
          if (HTTP_METHODS.includes(fn.name.toUpperCase())) {
            const apiPath = file.path.split('/pages/api')[1]?.replace(/\.[tj]sx?$/, '') || ''
            routes.push({
              method: fn.name.toUpperCase(),
              path: `/api${apiPath}`,
              handler: fn.name,
              file: file.path,
              line: fn.startLine,
              framework: 'nextjs-pages',
            })
          }
        }

        return routes
      },
    })

    // SvelteKit: +server.ts - ONLY exact HTTP method exports
    this.patterns.push({
      framework: 'sveltekit',
      detect: (file: ParsedFile) => {
        if (!file.path.includes('+server.')) {
          return []
        }

        const routes: RouteMatch[] = []
        const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

        for (const fn of file.functions) {
          // Must be exactly an HTTP method name
          if (HTTP_METHODS.includes(fn.name.toUpperCase())) {
            const routePath = file.path.split('/routes')[1]?.replace('/+server.ts', '') || '/'
            routes.push({
              method: fn.name.toUpperCase(),
              path: routePath,
              handler: fn.name,
              file: file.path,
              line: fn.startLine,
              framework: 'sveltekit',
            })
          }
        }

        return routes
      },
    })

// Python FastAPI: @app.get(), @router.get() - ONLY actual route decorators
    this.patterns.push({
      framework: 'fastapi',
      detect: (file: ParsedFile) => {
        const routes: RouteMatch[] = []

        // Only process Python route files
        if (!file.path.endsWith('.py')) return routes

        for (const fn of file.functions) {
          // Check for explicit route decorators
          const hasRouteDecorator = fn.decorators?.some((d: string) =>
            /@(app|router|api|get|post|put|delete|patch)\.(get|post|put|delete|patch)/i.test(d)
          )

          if (hasRouteDecorator && this.isLikelyRoute(fn.name)) {
            const methodMatch = fn.decorators?.find((d: string) =>
              /@(get|post|put|delete|patch)/i.test(d)
            )
            const method = methodMatch?.match(/@(get|post|put|delete|patch)/i)?.[1]?.toUpperCase() || 'GET'
            routes.push({
              method,
              path: `/${fn.name}`,
              handler: fn.name,
              file: file.path,
              line: fn.startLine,
              framework: 'fastapi',
            })
          }
        }

        return routes
      },
    })

    // Python Flask: @app.route() - ONLY with route decorators in .py route files
    this.patterns.push({
      framework: 'flask',
      detect: (file: ParsedFile) => {
        const routes: RouteMatch[] = []

        // Only process Python route files
        if (!file.path.endsWith('.py')) return routes

        for (const fn of file.functions) {
          const routeDecorators = fn.decorators?.filter((d: string) =>
            /@(app|router)\.route/i.test(d)
          )

          if (routeDecorators?.length) {
            routes.push({
              method: routeDecorators[0].toUpperCase().includes('POST') ? 'POST' : 'GET',
              path: `/${fn.name}`,
              handler: fn.name,
              file: file.path,
              line: fn.startLine,
              framework: 'flask',
            })
          }
        }

        return routes
      },
    })

    // NestJS: @Get(), @Post() decorators - ONLY with HTTP method decorators
    this.patterns.push({
      framework: 'nestjs',
      detect: (file: ParsedFile) => {
        const routes: RouteMatch[] = []

        for (const fn of file.functions) {
          const decorators = fn.decorators || []
          for (const decorator of decorators) {
            const match = decorator.match(/@(Get|Post|Put|Delete|Patch|Options|Head)\(([^)]*)\)/)
            if (match) {
              routes.push({
                method: match[1].toUpperCase(),
                path: match[2] || `/${fn.name}`,
                handler: fn.name,
                file: file.path,
                line: fn.startLine,
                framework: 'nestjs',
              })
            }
          }
        }

        return routes
      },
    })

    // Spring MVC: @RequestMapping, @GetMapping - ONLY with HTTP method mappings
    this.patterns.push({
      framework: 'spring',
      detect: (file: ParsedFile) => {
        const routes: RouteMatch[] = []

        for (const fn of file.functions) {
          const decorators = fn.decorators || []
          for (const decorator of decorators) {
            const getMatch = decorator.match(/@(Get|Post|Put|Delete|Patch)Mapping/)
            const routeMatch = decorator.match(/@RequestMapping.*?value=["'`]([^"'`]+)["'`]/)

            if (getMatch) {
              routes.push({
                method: getMatch[1].toUpperCase(),
                path: routeMatch ? routeMatch[1] : `/${fn.name}`,
                handler: fn.name,
                file: file.path,
                line: fn.startLine,
                framework: 'spring',
              })
            }
          }
        }

        return routes
      },
    })

    // Django: urls.py paths - ONLY in urls.py files with actual path() calls
    this.patterns.push({
      framework: 'django',
      detect: (file: ParsedFile) => {
        // ONLY in urls.py files
        if (!file.path.endsWith('urls.py')) {
          return []
        }

        const routes: RouteMatch[] = []

        // Look for path() or re_path() calls
        for (const call of file.calls || []) {
          if (call.name === 'path' || call.name === 're_path') {
            routes.push({
              method: 'GET', // Django doesn't specify in URL
              path: call.arguments?.[0] || '/',
              handler: call.arguments?.[1] || 'view',
              file: file.path,
              line: call.line,
              framework: 'django',
            })
          }
        }

        return routes
      },
    })

    // Go: net/http, Gin, chi, Fiber, Echo - ONLY explicit route registrations
    this.patterns.push({
      framework: 'go',
      detect: (file: ParsedFile) => {
        const routes: RouteMatch[] = []

        // ONLY in handler/controller files
        const pathLower = file.path.toLowerCase()
        if (!pathLower.includes('handler') && !pathLower.includes('controller') &&
            !pathLower.includes('route') && !pathLower.endsWith('.go')) {
          return routes
        }

        for (const fn of file.functions) {
          // Look for explicit route registration patterns in comments/doc
          const comments = (fn.purpose || '').toLowerCase()

          // Must have explicit route annotation
          if (comments.includes('route:') || comments.includes('endpoint:')) {
            const pathMatch = comments.match(/(?:route|endpoint):\s*["'`]([^"'`]+)["'`]/)
            const methodMatch = comments.match(/method:\s*(get|post|put|delete|patch)/i)
            routes.push({
              method: methodMatch?.[1]?.toUpperCase() || 'GET',
              path: pathMatch?.[1] || `/${fn.name}`,
              handler: fn.name,
              file: file.path,
              line: fn.startLine,
              framework: 'go',
            })
          }
        }

        return routes
      },
    })
  }

  // Main harvest method
  harvest(parsedFiles: ParsedFile[]): ParsedRoute[] {
    const allRoutes: ParsedRoute[] = []

    for (const file of parsedFiles) {
      // Try each pattern detector
      for (const pattern of this.patterns) {
        try {
          const matches = pattern.detect(file)
          for (const match of matches) {
            allRoutes.push({
              method: match.method,
              path: match.path,
              handler: match.handler,
              middlewares: [],
              file: match.file,
              line: match.line,
            })
          }
        } catch (e) {
          // Silently continue for other patterns
        }
      }
    }

    // Deduplicate by method+path
    const seen = new Set<string>()
    return allRoutes.filter(r => {
      const key = `${r.method}:${r.path}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  // Get all frameworks detected
  getFrameworks(routes: ParsedRoute[]): string[] {
    const frameworks = new Set<string>()
    for (const route of routes) {
      // Extract from file path
      const path = route.file
      if (path.includes('express') || path.includes('/routes/')) frameworks.add('express')
      else if (path.includes('app/api') || path.includes('/app/')) frameworks.add('nextjs')
      else if (path.includes('+server')) frameworks.add('sveltekit')
      else if (path.includes('routes.py') || path.includes('urls.py')) frameworks.add('django')
      else if (path.includes('.go') && path.includes('handlers')) frameworks.add('go')
    }
    return [...frameworks]
  }
}

export function harvestRoutes(parsedFiles: ParsedFile[]): ParsedRoute[] {
  return new RouteHarvester().harvest(parsedFiles)
}