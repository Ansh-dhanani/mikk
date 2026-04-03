/**
 * Parser types — data shapes that flow through the entire Mikk system.
 */

/** A single parameter in a function signature */
export interface ParsedParam {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

/** A single call expression found in code (Mikk 2.0) */
export interface CallExpression {
  name: string;
  line: number;
  type: 'function' | 'method' | 'property';
  arguments?: string[];
}

/** A detailed function declaration */
export interface ParsedFunction {
  id: string;              // unique normalized ID (file::name)
  name: string;
  file: string;
  moduleId?: string;
  startLine: number;
  endLine: number;
  params: ParsedParam[];
  returnType: string;
  isExported: boolean;
  isAsync: boolean;
  isGenerator?: boolean;
  typeParameters?: string[];
  calls: CallExpression[]; // Behavioral tracking (Upgraded from string[])
  hash: string;
  purpose: string;
  edgeCasesHandled: string[];
  errorHandling: { line: number; type: 'try-catch' | 'throw'; detail: string }[];
  detailedLines: { startLine: number; endLine: number; blockType: string }[];
}

/** A single import statement */
export interface ParsedImport {
  source: string;
  resolvedPath: string;
  names: string[];
  isDefault: boolean;
  isDynamic: boolean;
}

/** A single exported symbol */
export interface ParsedExport {
  name: string;
  type: 'function' | 'class' | 'const' | 'type' | 'default' | 'interface' | 'variable';
  file: string;
}

/** A single variable or property */
export interface ParsedVariable {
  id: string;
  name: string;
  type: string;
  file: string;
  line: number;
  isExported: boolean;
  isStatic?: boolean;
  purpose?: string;
}

/** A parsed class */
export interface ParsedClass {
  id: string;
  name: string;
  file: string;
  moduleId?: string;
  startLine: number;
  endLine: number;
  methods: ParsedFunction[];
  properties: ParsedVariable[];
  extends?: string;
  implements?: string[];
  isExported: boolean;
  decorators?: string[];
  typeParameters?: string[];
  hash: string;
  purpose?: string;
  edgeCasesHandled?: string[];
  errorHandling?: { line: number; type: 'try-catch' | 'throw'; detail: string }[];
}

/** A generic declaration (interface, type aliase, etc.) */
export interface ParsedGeneric {
  id: string;
  name: string;
  type: string; // "interface" | "type"
  file: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
  typeParameters?: string[];
  hash: string;
  purpose?: string;
}

/** A detected HTTP route registration */
export interface ParsedRoute {
  method: string;
  path: string;
  handler: string;
  middlewares: string[];
  file: string;
  line: number;
}

/** Everything extracted from a single file */
export interface ParsedFile {
  path: string;            // normalized absolute path
  language: 'python' | 'go' | 'typescript' | 'javascript' | 'java' | 'kotlin' | 'swift' | 'c' | 'cpp' | 'csharp' | 'rust' | 'php' | 'ruby' | 'unknown';
  functions: ParsedFunction[];
  classes: ParsedClass[];
  variables: ParsedVariable[];
  generics: ParsedGeneric[];
  imports: ParsedImport[];
  exports: ParsedExport[];
  routes: ParsedRoute[];
  calls: CallExpression[]; // module-level calls
  hash: string;
  parsedAt: number;
}
