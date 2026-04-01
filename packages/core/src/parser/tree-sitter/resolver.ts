import * as path from 'node:path'
import type { ParsedImport } from '../types.js'

export class TreeSitterResolver {
    constructor(
        private readonly projectRoot: string,
        private readonly language: string,
    ) {}

    resolve(imp: ParsedImport, fromFile: string, allProjectFiles: string[] = []): ParsedImport {
        const source = imp.source

        if (!this.isRelativeImport(source)) {
            return { ...imp, resolvedPath: '' }
        }

        const fileSet = allProjectFiles.length > 0 ? new Set(allProjectFiles.map(f => f.replace(/\\/g, '/'))) : null
        const resolved = this.resolvePath(source, fromFile, fileSet)

        return { ...imp, resolvedPath: resolved }
    }

    resolveAll(imports: ParsedImport[], fromFile: string, allProjectFiles: string[] = []): ParsedImport[] {
        const fileSet = allProjectFiles.length > 0 
            ? new Set(allProjectFiles.map(f => f.replace(/\\/g, '/'))) 
            : null

        return imports.map(imp => {
            if (!this.isRelativeImport(imp.source)) {
                // For Java, also try resolving package imports if we have file set
                if (this.language === 'java' && fileSet) {
                    const resolved = this.resolvePath(imp.source, fromFile, fileSet)
                    return { ...imp, resolvedPath: resolved }
                }
                return { ...imp, resolvedPath: '' }
            }
            const resolved = this.resolvePath(imp.source, fromFile, fileSet)
            return { ...imp, resolvedPath: resolved }
        })
    }

    private isRelativeImport(source: string): boolean {
        if (!source || source.trim() === '') return false
        
        const trimmed = source.trim()
        
        switch (this.language) {
            case 'python':
                return trimmed.startsWith('.') || trimmed.startsWith('/')
            case 'java':
                // For Java, both relative (.) and package imports can be resolved
                return true
            case 'c':
            case 'cpp':
                return trimmed.startsWith('"') || trimmed.startsWith('<')
            case 'csharp':
                return trimmed.startsWith('.')
            case 'rust':
                return trimmed.startsWith('crate::') || trimmed.startsWith('super::') || trimmed.startsWith('self::')
            case 'php':
                return trimmed.startsWith('\\') || trimmed.startsWith('..')
            case 'ruby':
                return trimmed.startsWith('./') || trimmed.startsWith('../')
            case 'go':
                return trimmed.startsWith('.') || trimmed.startsWith('/')
            default:
                return trimmed.startsWith('.') || trimmed.startsWith('/')
        }
    }

    private resolvePath(source: string, fromFile: string, fileSet: Set<string> | null): string {
        const normalizedSource = this.normalizeSource(source)
        const normalizedFrom = fromFile.replace(/\\/g, '/')
        const baseDir = path.dirname(normalizedFrom)

        let resolved: string
        if (normalizedSource.startsWith('/')) {
            resolved = normalizedSource.slice(1)
        } else {
            resolved = path.posix.normalize(path.posix.join(baseDir, normalizedSource))
        }

        return this.probeExtensions(resolved, fileSet) ?? ''
    }

    private normalizeSource(source: string): string {
        let normalized = source.trim()

        if (!normalized) return ''

        if (normalized.startsWith('"') && normalized.endsWith('"')) {
            normalized = normalized.slice(1, -1)
        }
        if (normalized.startsWith('<') && normalized.endsWith('>')) {
            normalized = normalized.slice(1, -1)
        }

        if (normalized.startsWith('\\')) {
            normalized = normalized.slice(1)
        }

        normalized = normalized.replace(/^\.+/, '.')

        if (normalized.startsWith('crate::')) {
            normalized = normalized.replace('crate::', 'src/')
        }

        if (normalized.startsWith('super::')) {
            normalized = normalized.replace('super::', '')
        }

        if (normalized.startsWith('self::')) {
            normalized = normalized.replace('self::', '')
        }

        normalized = normalized.replace(/\\/g, '/')

        normalized = this.handleLanguageSpecificImports(normalized)

        return normalized
    }

    private handleLanguageSpecificImports(normalized: string): string {
        switch (this.language) {
            case 'python':
                // Handle relative imports: ./module, ../package, .
                normalized = normalized.replace(/\./g, '/')
                
                // Handle "from package import module" - module is the last part
                // Convert to: package/module
                if (normalized.includes('/')) {
                    const parts = normalized.split('/')
                    const last = parts[parts.length - 1]
                    // If last part doesn't look like a module, add __init__
                    if (last && !last.includes('.') && !last.includes('__init__')) {
                        // Check if it's a file pattern or directory
                        parts[parts.length - 1] = last
                    }
                    normalized = parts.join('/')
                }
                
                // Handle case where import is just a module name (no ./)
                // e.g., "from os import path" -> os/path
                break
            
            case 'java':
                // Convert package dots to path separators
                // e.g., "java.util.List" -> "java/util/List"
                normalized = normalized.replace(/\./g, '/')
                break
            
            case 'ruby':
                normalized = normalized.replace(/::/g, '/')
                if (normalized.startsWith('./')) {
                    normalized = normalized.slice(2)
                }
                if (normalized.startsWith('../')) {
                    normalized = normalized.replace('../', '')
                }
                break
            
            case 'php':
                normalized = normalized.replace(/\\/g, '/')
                normalized = normalized.replace(/^App\//, '')
                break
            
            default:
                break
        }

        return normalized
    }

    private probeExtensions(resolved: string, fileSet: Set<string> | null): string | null {
        const extensions = this.getProbeExtensions()

        const directMatches = new Set<string>()
        
        for (const ext of extensions) {
            directMatches.add(resolved + ext)
            
            const parts = resolved.split('/')
            const lastIdx = parts.length - 1
            const lastPart = parts[lastIdx]
            
            if (lastPart && !lastPart.includes('.')) {
                parts[lastIdx] = '__init__'
                directMatches.add(parts.join('/') + ext)
            }
            
            if (!resolved.includes('/index') && !resolved.endsWith('/')) {
                directMatches.add(resolved + '/index' + ext)
            }
        }

        if (fileSet) {
            for (const candidate of directMatches) {
                if (fileSet.has(candidate)) {
                    return candidate
                }
            }

            const resolvedLower = resolved.toLowerCase()
            for (const file of fileSet) {
                if (file.toLowerCase() === resolvedLower + '.py' ||
                    file.toLowerCase() === resolvedLower + '.js' ||
                    file.toLowerCase() === resolvedLower + '.ts' ||
                    file.toLowerCase() === resolvedLower + '.java' ||
                    file.toLowerCase() === resolvedLower + '.go' ||
                    file.toLowerCase() === resolvedLower + '.rs' ||
                    file.toLowerCase() === resolvedLower + '.cs' ||
                    file.toLowerCase() === resolvedLower + '.c' ||
                    file.toLowerCase() === resolvedLower + '.cpp' ||
                    file.toLowerCase() === resolvedLower + '.php' ||
                    file.toLowerCase() === resolvedLower + '.rb') {
                    return file
                }
            }
            
            const resolvedEndsWith = resolved.split('/').pop()?.toLowerCase() || ''
            for (const file of fileSet) {
                const fileName = file.split('/').pop()?.toLowerCase() || ''
                if (fileName.startsWith(resolvedEndsWith) || 
                    resolvedEndsWith.includes(fileName.replace(/\.[^.]+$/, ''))) {
                    return file
                }
            }
        }

        if (extensions.length > 0) {
            return resolved + extensions[0]
        }

        return null
    }

    private getProbeExtensions(): string[] {
        switch (this.language) {
            case 'python':
                return ['.py', '/__init__.py']
            case 'java':
                return ['.java']
            case 'c':
                return ['.c', '.h']
            case 'cpp':
                return ['.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh']
            case 'csharp':
                return ['.cs']
            case 'rust':
                return ['.rs', '/lib.rs', '/mod.rs']
            case 'php':
                return ['.php']
            case 'ruby':
                return ['.rb', '.rbw']
            case 'go':
                return ['.go']
            default:
                return ['']
        }
    }
}
