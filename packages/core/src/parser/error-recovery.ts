import type { ParsedFile, ParsedFunction, ParsedClass, ParsedImport, ParsedParam } from './types.js'
import * as path from 'node:path'
import { hashContent } from '../hash/file-hasher.js'
import { toParsedFileLanguage, type RegistryLanguage } from '../utils/language-registry.js'

// ---------------------------------------------------------------------------
// Error Recovery Engine — graceful degradation when parsing fails
// ---------------------------------------------------------------------------

export interface RecoveryResult {
  success: boolean
  strategy: string
  parsed: ParsedFile
  confidence: number
  errors: string[]
}

export class ErrorRecoveryEngine {
  async recover(filePath: string, content: string, language: string): Promise<RecoveryResult> {
    const ext = path.extname(filePath).toLowerCase()

    const regexResult = await this.recoverWithRegex(filePath, content, ext, language)
    if (regexResult.confidence > 0.3) {
      return regexResult
    }

    return this.recoverMinimal(filePath, content, ext, language)
  }

  private async recoverWithRegex(
    filePath: string,
    content: string,
    ext: string,
    language: string
  ): Promise<RecoveryResult> {
    const errors: string[] = []
    const functions: ParsedFunction[] = []
    const classes: ParsedClass[] = []
    const imports: ParsedImport[] = []

    try {
      const lines = content.split('\n')

      if (language === 'python' || ext === '.py') {
        this.recoverPython(filePath, content, lines, functions, classes, imports)
      } else if (language === 'typescript' || language === 'javascript' || ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
        this.recoverJavaScript(filePath, content, lines, functions, classes, imports)
      } else if (language === 'go' || ext === '.go') {
        this.recoverGo(filePath, content, lines, functions, classes, imports)
      } else if (language === 'rust' || ext === '.rs') {
        this.recoverRust(filePath, content, lines, functions, classes, imports)
      } else if (language === 'java' || ext === '.java') {
        this.recoverJava(filePath, content, lines, functions, classes, imports)
      } else {
        this.recoverGeneric(filePath, content, lines, functions, classes, imports)
      }
    } catch (err) {
      errors.push(`Regex recovery failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    const confidence = this.calculateConfidence(functions, classes, imports, content)

    return {
      success: functions.length > 0 || classes.length > 0 || imports.length > 0,
      strategy: 'regex-recovery',
      parsed: {
        path: filePath,
        language: toParsedFileLanguage(language as RegistryLanguage),
        hash: hashContent(content),
        parsedAt: Date.now(),
        functions,
        classes,
        imports,
        generics: [],
        variables: [],
        exports: [],
        routes: [],
        calls: [],
      },
      confidence,
      errors,
    }
  }

  private async recoverMinimal(
    filePath: string,
    content: string,
    ext: string,
    language: string
  ): Promise<RecoveryResult> {
    return {
      success: false,
      strategy: 'minimal-fallback',
      parsed: {
        path: filePath,
        language: toParsedFileLanguage(language as RegistryLanguage),
        hash: hashContent(content),
        parsedAt: Date.now(),
        functions: [],
        classes: [],
        imports: [],
        generics: [],
        variables: [],
        exports: [],
        routes: [],
        calls: [],
      },
      confidence: 0,
      errors: ['All recovery strategies failed'],
    }
  }

  // ---------------------------------------------------------------------------
  // Language-specific regex recovery
  // ---------------------------------------------------------------------------

  private recoverPython(
    filePath: string,
    content: string,
    lines: string[],
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: ParsedImport[]
  ): void {
    const funcRegex = /^\s*(async\s+)?def\s+(\w+)\s*\(([^)]*)\)/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(funcRegex)
      if (match) {
        const [, isAsync, name, params] = match
        const paramsList: ParsedParam[] = params.split(',').map(p => p.trim()).filter(Boolean).map(p => ({
          name: p.split(':')[0].split('=')[0].trim(),
          type: p.includes(':') ? p.split(':')[1].split('=')[0].trim() : '',
          optional: p.includes('=') || p.startsWith('self') || p.startsWith('cls'),
        }))
        functions.push({
          id: `fn:${filePath}:${name.toLowerCase()}`,
          name,
          file: filePath,
          startLine: i + 1,
          endLine: this.findPythonFunctionEnd(lines, i),
          isAsync: !!isAsync,
          isExported: !name.startsWith('_'),
          params: paramsList,
          returnType: '',
          purpose: this.extractPythonDocstring(lines, i),
          calls: [],
          hash: '',
          edgeCasesHandled: [],
          errorHandling: [],
          detailedLines: [],
        })
      }
    }

    const classRegex = /^\s*class\s+(\w+)/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(classRegex)
      if (match) {
        const [, name] = match
        classes.push({
          id: `class:${filePath}:${name.toLowerCase()}`,
          name,
          file: filePath,
          startLine: i + 1,
          endLine: this.findPythonClassEnd(lines, i),
          isExported: !name.startsWith('_'),
          methods: [],
          purpose: '',
          hash: '',
          properties: [],
        })
      }
    }

    const importRegex = /^\s*(?:from\s+(\S+)\s+)?import\s+(.+)/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(importRegex)
      if (match) {
        const [, fromModule, importsStr] = match
        const names = importsStr.split(',').map(s => s.trim().split(' as ')[0].trim()).filter(Boolean)
        if (names.length > 0) {
          imports.push({
            source: fromModule || names[0],
            names,
            resolvedPath: '',
            isDefault: !fromModule,
            isDynamic: false,
          })
        }
      }
    }
  }

  private recoverJavaScript(
    filePath: string,
    content: string,
    lines: string[],
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: ParsedImport[]
  ): void {
    const funcRegex = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/
    const arrowRegex = /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)/

    for (let i = 0; i < lines.length; i++) {
      let match = lines[i].match(funcRegex)
      if (!match) {
        match = lines[i].match(arrowRegex)
      }
      if (match) {
        const [, name, params] = match
        const isAsync = lines[i].includes('async')
        const paramsList: ParsedParam[] = params.split(',').map(p => p.trim()).filter(Boolean).map(p => ({
          name: p.split(':')[0].split('=')[0].trim(),
          type: p.includes(':') ? p.split(':')[1].split('=')[0].trim() : '',
          optional: p.includes('?') || p.includes('='),
        }))
        functions.push({
          id: `fn:${filePath}:${name.toLowerCase()}`,
          name,
          file: filePath,
          startLine: i + 1,
          endLine: this.findJSBraceEnd(lines, i),
          isAsync,
          isExported: lines[i].includes('export'),
          params: paramsList,
          returnType: '',
          purpose: '',
          calls: [],
          hash: '',
          edgeCasesHandled: [],
          errorHandling: [],
          detailedLines: [],
        })
      }
    }

    const classRegex = /^\s*(?:export\s+)?(?:default\s+)?class\s+(\w+)/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(classRegex)
      if (match) {
        const [, name] = match
        classes.push({
          id: `class:${filePath}:${name.toLowerCase()}`,
          name,
          file: filePath,
          startLine: i + 1,
          endLine: this.findJSBraceEnd(lines, i),
          isExported: lines[i].includes('export'),
          methods: [],
          purpose: '',
          hash: '',
          properties: [],
        })
      }
    }

    const importRegex = /^\s*import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(importRegex)
      if (match) {
        const [, named, defaultImport, source] = match
        const names = named ? named.split(',').map(s => s.trim()).filter(Boolean) : defaultImport ? [defaultImport] : []
        if (names.length > 0 || source) {
          imports.push({
            source: source || '',
            names,
            resolvedPath: '',
            isDefault: !!defaultImport,
            isDynamic: false,
          })
        }
      }
    }
  }

  private recoverGo(
    filePath: string,
    content: string,
    lines: string[],
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: ParsedImport[]
  ): void {
    const funcRegex = /^\s*func\s+(?:\(\s*\w+\s+\*?\w+\s*\)\s+)?(\w+)\s*\(/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(funcRegex)
      if (match) {
        const [, name] = match
        const isExported = name.length > 0 && name[0] === name[0].toUpperCase()
        functions.push({
          id: `fn:${filePath}:${name.toLowerCase()}`,
          name,
          file: filePath,
          startLine: i + 1,
          endLine: this.findJSBraceEnd(lines, i),
          isAsync: false,
          isExported,
          params: [],
          returnType: '',
          purpose: '',
          calls: [],
          hash: '',
          edgeCasesHandled: [],
          errorHandling: [],
          detailedLines: [],
        })
      }
    }

    const structRegex = /^\s*type\s+(\w+)\s+struct/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(structRegex)
      if (match) {
        const [, name] = match
        const isExported = name.length > 0 && name[0] === name[0].toUpperCase()
        classes.push({
          id: `class:${filePath}:${name.toLowerCase()}`,
          name,
          file: filePath,
          startLine: i + 1,
          endLine: this.findGoStructEnd(lines, i),
          isExported,
          methods: [],
          purpose: '',
          hash: '',
          properties: [],
        })
      }
    }

    let inImportBlock = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('import (')) {
        inImportBlock = true
        continue
      }
      if (inImportBlock) {
        if (line === ')') {
          inImportBlock = false
          continue
        }
        const pkg = line.replace(/"/g, '').trim()
        if (pkg) {
          imports.push({
            source: pkg,
            names: [],
            resolvedPath: '',
            isDefault: false,
            isDynamic: false,
          })
        }
      }
      const singleImport = line.match(/^import\s+"([^"]+)"/)
      if (singleImport) {
        imports.push({
          source: singleImport[1],
          names: [],
          resolvedPath: '',
          isDefault: false,
          isDynamic: false,
        })
      }
    }
  }

  private recoverRust(
    filePath: string,
    content: string,
    lines: string[],
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: ParsedImport[]
  ): void {
    const funcRegex = /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(funcRegex)
      if (match) {
        const [, name] = match
        const isExported = lines[i].includes('pub')
        functions.push({
          id: `fn:${filePath}:${name.toLowerCase()}`,
          name,
          file: filePath,
          startLine: i + 1,
          endLine: this.findJSBraceEnd(lines, i),
          isAsync: lines[i].includes('async'),
          isExported,
          params: [],
          returnType: '',
          purpose: '',
          calls: [],
          hash: '',
          edgeCasesHandled: [],
          errorHandling: [],
          detailedLines: [],
        })
      }
    }

    const structRegex = /^\s*(?:pub\s+)?struct\s+(\w+)/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(structRegex)
      if (match) {
        const [, name] = match
        classes.push({
          id: `class:${filePath}:${name.toLowerCase()}`,
          name,
          file: filePath,
          startLine: i + 1,
          endLine: this.findJSBraceEnd(lines, i),
          isExported: lines[i].includes('pub'),
          methods: [],
          purpose: '',
          hash: '',
          properties: [],
        })
      }
    }

    const useRegex = /^\s*(?:pub\s+)?use\s+(.+);/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(useRegex)
      if (match) {
        imports.push({
          source: match[1].trim(),
          names: [],
          resolvedPath: '',
          isDefault: false,
          isDynamic: false,
        })
      }
    }
  }

  private recoverJava(
    filePath: string,
    content: string,
    lines: string[],
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: ParsedImport[]
  ): void {
    const methodRegex = /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)\s*\(/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(methodRegex)
      if (match) {
        const [, name] = match
        if (name !== 'if' && name !== 'for' && name !== 'while' && name !== 'switch' && name !== 'class' && name !== 'interface') {
          const isExported = lines[i].includes('public')
          functions.push({
            id: `fn:${filePath}:${name.toLowerCase()}`,
            name,
            file: filePath,
            startLine: i + 1,
            endLine: this.findJSBraceEnd(lines, i),
            isAsync: false,
            isExported,
            params: [],
            returnType: '',
            purpose: '',
            calls: [],
            hash: '',
            edgeCasesHandled: [],
            errorHandling: [],
            detailedLines: [],
          })
        }
      }
    }

    const classRegex = /^\s*(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(classRegex)
      if (match) {
        const [, name] = match
        classes.push({
          id: `class:${filePath}:${name.toLowerCase()}`,
          name,
          file: filePath,
          startLine: i + 1,
          endLine: this.findJSBraceEnd(lines, i),
          isExported: lines[i].includes('public'),
          methods: [],
          purpose: '',
          hash: '',
          properties: [],
        })
      }
    }

    const importRegex = /^\s*import\s+([\w.]+)\s*;/
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(importRegex)
      if (match) {
        imports.push({
          source: match[1],
          names: [],
          resolvedPath: '',
          isDefault: false,
          isDynamic: false,
        })
      }
    }
  }

  private recoverGeneric(
    filePath: string,
    content: string,
    lines: string[],
    functions: ParsedFunction[],
    classes: ParsedClass[],
    _imports: ParsedImport[]
  ): void {
    const funcPatterns = [
      /function\s+(\w+)\s*\(/,
      /def\s+(\w+)\s*\(/,
      /fn\s+(\w+)\s*[<(]/,
      /func\s+(\w+)\s*\(/,
    ]

    const classPatterns = [
      /class\s+(\w+)/,
      /struct\s+(\w+)/,
      /type\s+(\w+)\s+struct/,
    ]

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of funcPatterns) {
        const match = lines[i].match(pattern)
        if (match) {
          functions.push({
            id: `fn:${filePath}:${match[1].toLowerCase()}`,
            name: match[1],
            file: filePath,
            startLine: i + 1,
            endLine: i + 10,
            isAsync: false,
            isExported: false,
            params: [],
            returnType: '',
            purpose: '',
            calls: [],
            hash: '',
            edgeCasesHandled: [],
            errorHandling: [],
            detailedLines: [],
          })
          break
        }
      }

      for (const pattern of classPatterns) {
        const match = lines[i].match(pattern)
        if (match) {
          classes.push({
            id: `class:${filePath}:${match[1].toLowerCase()}`,
            name: match[1],
            file: filePath,
            startLine: i + 1,
            endLine: i + 20,
            isExported: false,
            methods: [],
            purpose: '',
            hash: '',
            properties: [],
          })
          break
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helper methods
  // ---------------------------------------------------------------------------

  private findPythonFunctionEnd(lines: string[], startLine: number): number {
    const baseIndent = this.getIndentLevel(lines[startLine])
    for (let i = startLine + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue
      if (this.getIndentLevel(lines[i]) <= baseIndent && lines[i].trim() !== '') {
        return i
      }
    }
    return lines.length
  }

  private findPythonClassEnd(lines: string[], startLine: number): number {
    return this.findPythonFunctionEnd(lines, startLine)
  }

  private findJSBraceEnd(lines: string[], startLine: number): number {
    let braces = 0
    let started = false
    for (let i = startLine; i < lines.length; i++) {
      for (const char of lines[i]) {
        if (char === '{') { braces++; started = true }
        if (char === '}') braces--
      }
      if (started && braces === 0) return i + 1
    }
    return lines.length
  }

  private findGoStructEnd(lines: string[], startLine: number): number {
    for (let i = startLine + 1; i < lines.length; i++) {
      if (lines[i].trim() === '}') return i + 1
    }
    return lines.length
  }

  private getIndentLevel(line: string): number {
    const match = line.match(/^(\s*)/)
    return match ? match[1].length : 0
  }

  private extractPythonDocstring(lines: string[], funcLine: number): string {
    for (let i = funcLine + 1; i < Math.min(funcLine + 5, lines.length); i++) {
      const trimmed = lines[i].trim()
      if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        return trimmed.replace(/['"]{3}/g, '').trim()
      }
      if (trimmed.startsWith('#')) {
        return trimmed.substring(1).trim()
      }
    }
    return ''
  }

  private calculateConfidence(
    functions: ParsedFunction[],
    classes: ParsedClass[],
    imports: ParsedImport[],
    content: string
  ): number {
    const lineCount = content.split('\n').length
    const extracted = functions.length + classes.length + imports.length
    const ratio = Math.min(1, extracted / Math.max(1, lineCount / 10))
    let confidence = ratio * 0.7
    if (functions.length > 0 && classes.length > 0) confidence += 0.1
    if (imports.length > 0) confidence += 0.1
    if (extracted === 0) confidence = 0
    return Math.min(1, Math.max(0, confidence))
  }
}
