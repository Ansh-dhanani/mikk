/**
 * semantic-role-classifier.ts
 *
 * Assigns a semantic ROLE to every function/file based on:
 *   1. Filename conventions  (Next.js page.tsx, Django views.py, …)
 *   2. Call-expression patterns  (app.get(), router.post(), …)
 *   3. Decorator patterns  (@Get(), @Controller(), …)
 *   4. Export-name conventions  (getServerSideProps, default export of a PascalCase component, …)
 *
 * No plugins, no overengineering — one well-maintained map covers 95 % of real projects.
 * The classifier is additive: it ENRICHES the existing lock/graph without breaking anything.
 */

import type { ParsedFile, ParsedFunction } from '../parser/types.js'

// ─── Public types ─────────────────────────────────────────────────────────────

export type SemanticRole =
    | 'route'           // Next.js page, SvelteKit page, Nuxt page
    | 'api-handler'     // Express app.get, Fastify, Hono, NestJS @Get
    | 'middleware'      // Express middleware, Next.js middleware.ts
    | 'component'       // React/Vue/Svelte component
    | 'model'           // Prisma model, Django model, TypeORM entity
    | 'schema'          // Zod, Yup, Joi schemas
    | 'config'          // Config files / env loaders
    | 'test'            // Test / spec files
    | 'util'            // Utility / helper functions
    | 'service'         // Service / business-logic classes
    | 'repository'      // Data-access / repository pattern
    | 'controller'      // MVC controllers
    | 'guard'           // Auth guards / permission checks
    | 'hook'            // React hooks (use*)
    | 'store'           // State management (Zustand, Pinia, Redux)
    | 'dto'             // Data-transfer objects
    | 'migration'       // DB migrations
    | 'seed'            // DB seed scripts
    | 'script'          // CLI / build scripts
    | 'entry-point'     // main(), index, bootstrap
    | 'unknown'

export interface RoleClassification {
    role: SemanticRole
    confidence: number           // 0–1
    reason: string               // human-readable explanation
    framework?: string           // 'nextjs' | 'express' | 'django' | …
    isDeadCodeExempt: boolean    // pre-computed exemption flag
}

export interface ClassifiedFunction {
    id: string
    name: string
    file: string
    role: RoleClassification
}

export interface FileRoleClassification {
    file: string
    role: SemanticRole
    framework?: string
    confidence: number
}

// ─── Filename → role maps ─────────────────────────────────────────────────────

interface FilenameRule {
    /** regex tested against the FULL relative file path (forward slashes) */
    pattern: RegExp
    role: SemanticRole
    framework?: string
    confidence: number
}

const FILENAME_RULES: FilenameRule[] = [
    // ── Next.js App Router ──────────────────────────────────────────────────
    { pattern: /\/app\/.*\/page\.[jt]sx?$/,         role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/page\.[jt]sx?$/,              role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/.*\/layout\.[jt]sx?$/,        role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/layout\.[jt]sx?$/,            role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/.*\/loading\.[jt]sx?$/,       role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/loading\.[jt]sx?$/,           role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/.*\/error\.[jt]sx?$/,         role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/error\.[jt]sx?$/,             role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/.*\/not-found\.[jt]sx?$/,     role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/not-found\.[jt]sx?$/,         role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/.*\/template\.[jt]sx?$/,      role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/template\.[jt]sx?$/,         role: 'route',       framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/.*\/route\.[jt]s$/,           role: 'api-handler', framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/app\/route\.[jt]s$/,               role: 'api-handler', framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/middleware\.[jt]sx?$/,             role: 'middleware',  framework: 'nextjs',    confidence: 0.9 },
    // ── Next.js Pages Router ────────────────────────────────────────────────
    { pattern: /\/pages\/api\//,                     role: 'api-handler', framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/pages\/api\.[jt]sx?$/,             role: 'api-handler', framework: 'nextjs',    confidence: 1.0 },
    { pattern: /\/pages\/[^/]+\.[jt]sx?$/,             role: 'route',       framework: 'nextjs',    confidence: 0.9 },
    { pattern: /\/pages\/.*\/[^/]+\.[jt]sx?$/,       role: 'route',       framework: 'nextjs',    confidence: 0.9 },
    { pattern: /\/pages\/[^/]+\.[jt]sx?$/,             role: 'route',       framework: 'nextjs',    confidence: 0.95 },
    { pattern: /\/pages\.[jt]sx?$/,                 role: 'route',       framework: 'nextjs',    confidence: 0.9 },
    // Without leading / (for when path doesn't start with /)
    { pattern: /pages\/api\//,                     role: 'api-handler', framework: 'nextjs',    confidence: 1.0 },
    { pattern: /pages\/[^/]+\.[jt]sx?$/,             role: 'route',       framework: 'nextjs',    confidence: 0.95 },
    { pattern: /pages\/[^/]*\.[jt]sx?$/,              role: 'route',       framework: 'nextjs',    confidence: 0.9 },
    // ── SvelteKit ───────────────────────────────────────────────────────────
    { pattern: /\/routes\/.*\+page\.svelte$/,        role: 'route',       framework: 'sveltekit', confidence: 1.0 },
    { pattern: /\/routes\/.*\+page\.server\.[jt]s$/, role: 'api-handler', framework: 'sveltekit', confidence: 1.0 },
    { pattern: /\/routes\/.*\+layout\.svelte$/,      role: 'route',       framework: 'sveltekit', confidence: 1.0 },
    { pattern: /\/routes\/.*\+server\.[jt]s$/,       role: 'api-handler', framework: 'sveltekit', confidence: 1.0 },
    // ── Nuxt ────────────────────────────────────────────────────────────────
    { pattern: /\/pages\/.*\.vue$/,                  role: 'route',       framework: 'nuxt',      confidence: 0.95 },
    { pattern: /\/server\/api\//,                    role: 'api-handler', framework: 'nuxt',      confidence: 0.95 },
    { pattern: /\/server\/routes\//,                 role: 'api-handler', framework: 'nuxt',      confidence: 0.95 },
    { pattern: /\/middleware\//,                     role: 'middleware',  framework: 'nuxt',      confidence: 0.85 },
    // ── Remix / React Router v7 ─────────────────────────────────────────────
    { pattern: /\/routes\/.*\.[jt]sx?$/,             role: 'route',       framework: 'remix',     confidence: 0.85 },
    // ── Astro ───────────────────────────────────────────────────────────────
    { pattern: /\/pages\/.*\.astro$/,                role: 'route',       framework: 'astro',     confidence: 1.0 },
    { pattern: /\/pages\/.*\.ts$/,                   role: 'api-handler', framework: 'astro',     confidence: 0.8 },
    // ── Django / Flask / FastAPI ─────────────────────────────────────────────
    { pattern: /\/views\.py$/,                       role: 'route',       framework: 'django',    confidence: 0.9 },
    { pattern: /\/urls\.py$/,                        role: 'config',      framework: 'django',    confidence: 0.95 },
    { pattern: /\/models\.py$/,                      role: 'model',       framework: 'django',    confidence: 0.95 },
    { pattern: /\/serializers\.py$/,                 role: 'dto',         framework: 'django',    confidence: 0.95 },
    { pattern: /\/forms\.py$/,                       role: 'dto',         framework: 'django',    confidence: 0.9 },
    { pattern: /\/admin\.py$/,                       role: 'config',      framework: 'django',    confidence: 0.9 },
    // ── Go ───────────────────────────────────────────────────────────────────
    { pattern: /\/handlers?\//,                      role: 'api-handler', framework: 'go',        confidence: 0.85 },
    { pattern: /\/middleware\//,                     role: 'middleware',  framework: 'go',        confidence: 0.85 },
    { pattern: /\/models?\//,                        role: 'model',       framework: 'go',        confidence: 0.8 },
// ── Python — Django/Flask/FastAPI ─────────────────────────────────────────
    { pattern: /\/views\.py$/,                       role: 'route',       framework: 'django',    confidence: 0.9 },
    { pattern: /views\.py$/,                        role: 'route',       framework: 'django',    confidence: 0.9 },
    { pattern: /\/urls\.py$/,                       role: 'config',      framework: 'django',    confidence: 0.95 },
    { pattern: /urls\.py$/,                        role: 'config',      framework: 'django',    confidence: 0.95 },
    { pattern: /\/settings\.py$/,                    role: 'config',      framework: 'django',    confidence: 0.95 },
    { pattern: /settings\.py$/,                     role: 'config',      framework: 'django',    confidence: 0.95 },
    { pattern: /\/models\.py$/,                      role: 'model',       framework: 'django',    confidence: 0.95 },
    { pattern: /models\.py$/,                       role: 'model',       framework: 'django',    confidence: 0.95 },
    { pattern: /\/schemas\.py$/,                    role: 'schema',      framework: 'fastapi',   confidence: 0.95 },
    { pattern: /main\.py$/,                        role: 'entry-point', framework: 'flask',   confidence: 0.9 },
    { pattern: /app\.py$/,                         role: 'entry-point', framework: 'flask',   confidence: 0.9 },
    // ── Java/Spring ──────────────────────────────────────────────────────
    { pattern: /\/controller[s]?\//,                 role: 'controller',  framework: 'spring',  confidence: 0.95 },
    { pattern: /\/service[s]?\//,                   role: 'service',     framework: 'spring',  confidence: 0.95 },
    { pattern: /\/repository[s]?\//,                 role: 'repository',  framework: 'spring',  confidence: 0.95 },
    { pattern: /\/model[s]?\//,                      role: 'model',       framework: 'spring',  confidence: 0.95 },
    { pattern: /\/entity\//,                        role: 'model',       framework: 'spring',  confidence: 0.95 },
    { pattern: /\/config\//,                        role: 'config',      framework: 'spring',  confidence: 0.9 },
    { pattern: /\/repository\//,                     role: 'repository',  framework: 'go',        confidence: 0.9 },
    { pattern: /\/service\//,                        role: 'service',     framework: 'go',        confidence: 0.9 },
    // ── Generic patterns ────────────────────────────────────────────────────
    { pattern: /\.(test|spec)\.[jt]sx?$/,            role: 'test',        confidence: 1.0 },
    { pattern: /\/__tests__\//,                      role: 'test',        confidence: 1.0 },
    { pattern: /\/test\//,                           role: 'test',        confidence: 0.9 },
    { pattern: /\/migrations?\//,                    role: 'migration',   confidence: 0.9 },
    { pattern: /\/seeds?\//,                         role: 'seed',        confidence: 0.9 },
    { pattern: /\/scripts?\//,                       role: 'script',      confidence: 0.85 },
    { pattern: /\/stores?\//,                        role: 'store',       confidence: 0.85 },
    { pattern: /\/controllers?\//,                   role: 'controller',  confidence: 0.85 },
    { pattern: /\/services?\//,                      role: 'service',     confidence: 0.85 },
    { pattern: /\/repositories?\//,                  role: 'repository',  confidence: 0.85 },
    { pattern: /\/dtos?\//,                          role: 'dto',         confidence: 0.85 },
    { pattern: /\/guards?\//,                        role: 'guard',       confidence: 0.85 },
    { pattern: /\/middleware\//,                     role: 'middleware',  confidence: 0.8 },
    { pattern: /\/components?\//,                    role: 'component',   confidence: 0.7 },
    { pattern: /\/utils?\//,                         role: 'util',        confidence: 0.7 },
    { pattern: /\/helpers?\//,                       role: 'util',        confidence: 0.7 },
    { pattern: /\/lib\//,                            role: 'util',        confidence: 0.65 },
    { pattern: /prisma\/schema\.prisma$/,            role: 'model',       confidence: 1.0 },
    { pattern: /\/schema\.(ts|js|graphql|gql|sql)$/, role: 'schema',     confidence: 0.9 },
    { pattern: /\.schema\.(ts|js)$/,                 role: 'schema',      confidence: 0.9 },
    { pattern: /\.(config|conf)\.[jt]sx?$/,          role: 'config',      confidence: 0.9 },
    { pattern: /[.]eslintrc[.]?[^.]*$/,              role: 'config',    confidence: 1.0 },
    { pattern: /[.]prettierrc[.]?[^.]*$/,                role: 'config',    confidence: 1.0 },
    { pattern: /tsconfig.*\.json$/,                 role: 'config',    confidence: 1.0 },
    { pattern: /package\.json$/,                   role: 'config',    confidence: 1.0 },
    { pattern: /pyproject\.toml$/,                 role: 'config',    confidence: 1.0 },
    { pattern: /Cargo\.toml$/,                  role: 'config',    confidence: 1.0 },
    { pattern: /go\.mod$/,                      role: 'config',    confidence: 1.0 },
    { pattern: /\/config\//,                         role: 'config',      confidence: 0.75 },
    { pattern: /\/(main|app|server|bootstrap)\.[jt]sx?$/, role: 'entry-point', confidence: 0.85 },
    { pattern: /\/main\.(go|py|rs|java|cs)$/,        role: 'entry-point', confidence: 0.9 },
]

// ─── Function export-name → role ─────────────────────────────────────────────

interface ExportNameRule {
    pattern: RegExp
    role: SemanticRole
    framework?: string
    confidence: number
}

const EXPORT_NAME_RULES: ExportNameRule[] = [
    // Next.js lifecycle exports
    { pattern: /^(getServerSideProps|getStaticProps|getStaticPaths|generateStaticParams|generateMetadata|generateViewport)$/, role: 'api-handler', framework: 'nextjs', confidence: 1.0 },
    // SvelteKit lifecycle exports
    { pattern: /^(load|actions)$/, role: 'api-handler', framework: 'sveltekit', confidence: 0.85 },
    // React hooks
    { pattern: /^use[A-Z]/, role: 'hook', confidence: 0.9 },
    // Entry points
    { pattern: /^(main|bootstrap|start|run|serve|listen)$/, role: 'entry-point', confidence: 0.85 },
    // Controllers / handlers
    { pattern: /Controller$/, role: 'controller', confidence: 0.85 },
    { pattern: /Service$/, role: 'service', confidence: 0.85 },
    { pattern: /Repository$/, role: 'repository', confidence: 0.85 },
    { pattern: /Guard$/, role: 'guard', confidence: 0.85 },
    { pattern: /Middleware$/, role: 'middleware', confidence: 0.8 },
    { pattern: /Handler$/, role: 'api-handler', confidence: 0.8 },
    { pattern: /Provider$/, role: 'service', confidence: 0.75 },
    // React PascalCase components (exported)
    { pattern: /^[A-Z][a-zA-Z0-9]+$/, role: 'component', confidence: 0.6 },
]

// ─── Call-expression → role ──────────────────────────────────────────────────

interface CallPatternRule {
    /** tested against the call name (e.g. "app.get", "router.post") */
    pattern: RegExp
    role: SemanticRole
    framework?: string
    confidence: number
}

const CALL_PATTERN_RULES: CallPatternRule[] = [
    // Express / Koa / Hono
    { pattern: /^(app|router)\.(get|post|put|patch|delete|head|options|all|use)$/, role: 'api-handler', framework: 'express', confidence: 0.95 },
    // Fastify
    { pattern: /^(fastify|server|app)\.(get|post|put|patch|delete|head|options|route|register)$/, role: 'api-handler', framework: 'fastify', confidence: 0.9 },
    // Hono
    { pattern: /^(hono|app)\.(get|post|put|delete|patch|all|use)$/, role: 'api-handler', framework: 'hono', confidence: 0.9 },
    // Django url patterns
    { pattern: /^path$|^re_path$|^url$/, role: 'route', framework: 'django', confidence: 0.85 },
    // Testing
    { pattern: /^(it|test|describe|expect)$/, role: 'test', confidence: 1.0 },
]

// ─── Decorator → role ────────────────────────────────────────────────────────

interface DecoratorRule {
    pattern: RegExp
    role: SemanticRole
    framework?: string
    confidence: number
}

const DECORATOR_RULES: DecoratorRule[] = [
    // NestJS
    { pattern: /^(Get|Post|Put|Patch|Delete|Head|Options|All)$/, role: 'api-handler', framework: 'nestjs', confidence: 1.0 },
    { pattern: /^Controller$/, role: 'controller', framework: 'nestjs', confidence: 1.0 },
    { pattern: /^Injectable$/, role: 'service', framework: 'nestjs', confidence: 0.9 },
    { pattern: /^(UseGuards|CanActivate)$/, role: 'guard', framework: 'nestjs', confidence: 0.95 },
    { pattern: /^(UseInterceptors|NestInterceptor)$/, role: 'middleware', framework: 'nestjs', confidence: 0.9 },
    // TypeORM
    { pattern: /^(Entity|Column|PrimaryGeneratedColumn|ManyToOne|OneToMany)$/, role: 'model', framework: 'typeorm', confidence: 1.0 },
    // Python Django / Flask
    { pattern: /^(route|app\.route|blueprint\.route)$/, role: 'api-handler', framework: 'flask', confidence: 0.9 },
    // Pytest
    { pattern: /^(pytest\.fixture|pytest\.mark)/, role: 'test', confidence: 1.0 },
]

// ─── Dead-code exemption logic ───────────────────────────────────────────────

/** Roles that should NEVER be flagged as dead code */
export const DEAD_CODE_EXEMPT_ROLES: ReadonlySet<SemanticRole> = new Set([
    'route', 'api-handler', 'middleware', 'entry-point', 'test', 'migration', 'seed', 'script', 'config',
])

export function isRoleDeadCodeExempt(role: SemanticRole): boolean {
    return DEAD_CODE_EXEMPT_ROLES.has(role)
}

// ─── Classifier ──────────────────────────────────────────────────────────────

export class SemanticRoleClassifier {
    /**
     * Classify every function in a set of parsed files.
     * Returns a Map<functionId, RoleClassification>.
     */
    classifyFunctions(files: ParsedFile[]): Map<string, RoleClassification> {
        const result = new Map<string, RoleClassification>()

        for (const file of files) {
            const fileRoleInfo = this.classifyFile(file.path)

            for (const fn of file.functions) {
                const classification = this._classifyFunction(fn, fileRoleInfo)
                result.set(fn.id, classification)
            }
            for (const cls of file.classes) {
                for (const method of cls.methods) {
                    const classification = this._classifyFunction(method, fileRoleInfo)
                    result.set(method.id, classification)
                }
            }
        }

        return result
    }

    /**
     * Classify a single file by its path alone — zero parsing required.
     */
    classifyFile(filePath: string): FileRoleClassification {
        const normalized = filePath.replace(/\\/g, '/')

        for (const rule of FILENAME_RULES) {
            if (rule.pattern.test(normalized)) {
                return {
                    file: filePath,
                    role: rule.role,
                    framework: rule.framework,
                    confidence: rule.confidence,
                }
            }
        }

        return { file: filePath, role: 'unknown', confidence: 0 }
    }

    /**
     * Classify a single function given an optional pre-classified file role.
     */
    classifyFunction(fn: ParsedFunction, filePath?: string): RoleClassification {
        const fileRole = filePath ? this.classifyFile(filePath) : undefined
        return this._classifyFunction(fn, fileRole)
    }

    /**
     * Quick path-only check: is this file's role exempt from dead-code detection?
     * Call this in DeadCodeDetector before doing heavier graph analysis.
     */
    isFileDeadCodeExempt(filePath: string): boolean {
        const { role } = this.classifyFile(filePath)
        return isRoleDeadCodeExempt(role)
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private _classifyFunction(
        fn: ParsedFunction,
        fileRole?: FileRoleClassification,
    ): RoleClassification {
        // 1. Decorators (highest specificity)
        if (fn.decorators && fn.decorators.length > 0) {
            for (const decorator of fn.decorators) {
                for (const rule of DECORATOR_RULES) {
                    if (rule.pattern.test(decorator)) {
                        return {
                            role: rule.role,
                            confidence: rule.confidence,
                            reason: `Decorator @${decorator}`,
                            framework: rule.framework,
                            isDeadCodeExempt: isRoleDeadCodeExempt(rule.role),
                        }
                    }
                }
            }
        }

        // 2. Call expressions inside the function
        if (fn.calls && fn.calls.length > 0) {
            for (const call of fn.calls) {
                for (const rule of CALL_PATTERN_RULES) {
                    if (rule.pattern.test(call.name)) {
                        return {
                            role: rule.role,
                            confidence: rule.confidence,
                            reason: `Contains call: ${call.name}()`,
                            framework: rule.framework,
                            isDeadCodeExempt: isRoleDeadCodeExempt(rule.role),
                        }
                    }
                }
            }
        }

        // 3. File-level role inference (high confidence file = inherit role)
        if (fileRole && fileRole.role !== 'unknown' && fileRole.confidence >= 0.9) {
            return {
                role: fileRole.role,
                confidence: fileRole.confidence * 0.9,
                reason: `Defined in ${fileRole.role} file (${fileRole.framework ?? 'generic'})`,
                framework: fileRole.framework,
                isDeadCodeExempt: isRoleDeadCodeExempt(fileRole.role),
            }
        }

        // 4. Export name rules (for exported functions)
        if (fn.isExported) {
            for (const rule of EXPORT_NAME_RULES) {
                if (rule.pattern.test(fn.name)) {
                    return {
                        role: rule.role,
                        confidence: rule.confidence,
                        reason: `Exported function name matches "${fn.name}"`,
                        framework: rule.framework,
                        isDeadCodeExempt: isRoleDeadCodeExempt(rule.role),
                    }
                }
            }
        }

        // 5. Non-exported function name heuristics
        if (/^use[A-Z]/.test(fn.name)) {
            return { role: 'hook', confidence: 0.85, reason: 'Name matches React hook convention (use*)', isDeadCodeExempt: false }
        }

        // 6. Low-confidence file role inheritance
        if (fileRole && fileRole.role !== 'unknown') {
            return {
                role: fileRole.role,
                confidence: fileRole.confidence * 0.6,
                reason: `Defined in likely ${fileRole.role} file`,
                framework: fileRole.framework,
                isDeadCodeExempt: isRoleDeadCodeExempt(fileRole.role),
            }
        }

        return {
            role: 'unknown',
            confidence: 0,
            reason: 'No matching rule found',
            isDeadCodeExempt: false,
        }
    }
}
