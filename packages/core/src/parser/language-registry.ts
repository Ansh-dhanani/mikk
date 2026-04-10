import type { SyntaxNode } from 'web-tree-sitter';
import { BaseExtractor } from './base-extractor.js';

export interface LanguageDefinition {
  name: string;
  extensions: string[];
  treeSitterGrammar: string;
  extractor: BaseExtractor;
  semanticFeatures: {
    hasTypeSystem: boolean;
    hasGenerics: boolean;
    hasMacros: boolean;
    hasAnnotations: boolean;
    hasPatternMatching: boolean;
  };
  specialHandling?: {
    importResolution?: (source: string, filePath: string) => Promise<string[]>;
    exportDetection?: (node: SyntaxNode) => boolean;
  };
}

export class LanguageRegistry {
  private static instance: LanguageRegistry;
  private languages: Map<string, LanguageDefinition> = new Map();
  private extMap: Map<string, string> = new Map();

  private constructor() {}

  public static getInstance(): LanguageRegistry {
    if (!LanguageRegistry.instance) {
      LanguageRegistry.instance = new LanguageRegistry();
    }
    return LanguageRegistry.instance;
  }

  public register(lang: LanguageDefinition): void {
    this.languages.set(lang.name, lang);
    for (const ext of lang.extensions) {
      this.extMap.set(ext, lang.name);
    }
  }

  public getForFile(filePath: string): LanguageDefinition | null {
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    const langName = this.extMap.get(ext);
    if (!langName) return null;
    return this.languages.get(langName) || null;
  }

  public getAllSupportedExtensions(): string[] {
    return Array.from(this.extMap.keys());
  }

  public listLanguages(): string[] {
    return Array.from(this.languages.keys());
  }
}
