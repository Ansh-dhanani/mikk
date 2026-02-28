import type { ParsedFile, ParsedImport } from './types.js'

/**
 * Abstract base class all language parsers extend.
 * Forces consistency — every parser implements the same interface.
 */
export abstract class BaseParser {
    /** Given raw file content as a string, return ParsedFile */
    abstract parse(filePath: string, content: string): ParsedFile

    /** Given a list of parsed files, resolve all import paths to absolute project paths */
    abstract resolveImports(files: ParsedFile[], projectRoot: string): ParsedFile[]

    /** Returns which file extensions this parser handles */
    abstract getSupportedExtensions(): string[]
}
