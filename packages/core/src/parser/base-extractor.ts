import type { ParsedFile } from './types.js';
export type ParseDepth = 'full' | 'exports-only' | 'metadata-only';

export interface ExtractOptions {
  depth?: ParseDepth;
}

/**
 * Abstract base class for language-specific metadata extraction.
 * Extractors can use different engines (Tree-Sitter, OXC, etc.) internally.
 */
export abstract class BaseExtractor {
  /**
   * Main entry point to parse and extract metadata from a file
   */
  abstract extract(filePath: string, content: string, options?: ExtractOptions): Promise<ParsedFile>;

  /**
   * Resolve imports for a list of files (optional, default to simple pass-through)
   */
  async resolveImports(files: ParsedFile[], _projectRoot: string): Promise<ParsedFile[]> {
    return files;
  }
}
