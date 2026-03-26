import type { ParsedFile } from './types.js'

export interface ChangeSet {
  added: string[];    // Symbol IDs
  removed: string[];  // Symbol IDs
  modified: string[]; // Symbol IDs (hash mismatch)
}

/**
 * Mikk 2.0: Change Detector
 * Compares parsed file versions to identify precisely which symbols 
 * (functions, classes, etc.) have changed using AST hashes.
 */
export class ChangeDetector {
  /**
   * Compare two versions of a file and return the changed symbol IDs.
   */
  public detectSymbolChanges(oldFile: ParsedFile | undefined, newFile: ParsedFile): ChangeSet {
    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    if (!oldFile) {
      // Everything is new
      return {
        added: [
          ...newFile.functions.map(f => f.id),
          ...newFile.classes.map(c => c.id),
          ...newFile.generics.map(g => g.id),
          ...newFile.variables.map(v => v.id),
        ],
        removed: [],
        modified: []
      };
    }

    if (oldFile.hash === newFile.hash) {
      return { added: [], removed: [], modified: [] };
    }

    // --- Compare Functions ---
    const oldFns = new Map(oldFile.functions.map(f => [f.id, f.hash]));
    const newFns = new Map(newFile.functions.map(f => [f.id, f.hash]));

    for (const [id, hash] of newFns) {
      if (!oldFns.has(id)) added.push(id);
      else if (oldFns.get(id) !== hash) modified.push(id);
    }
    for (const id of oldFns.keys()) {
      if (!newFns.has(id)) removed.push(id);
    }

    // --- Compare Classes ---
    const oldClasses = new Map(oldFile.classes.map(c => [c.id, c.hash || 'no-hash'])); // ParsedClass might not have hash yet, using placeholder
    const newClasses = new Map(newFile.classes.map(c => [c.id, c.hash || 'no-hash']));
    
    // Note: If ParsedClass doesn't have a hash, we might need to compare methods/properties hashes
    // For Mikk 2.0, we'll assume classes have a summary hash eventually or just compare their structure.

    for (const [id, hash] of newClasses) {
      if (!oldClasses.has(id)) added.push(id);
      else if (oldClasses.get(id) !== hash) modified.push(id);
    }
    for (const id of oldClasses.keys()) {
      if (!newClasses.has(id)) removed.push(id);
    }

    // --- Compare Generics ---
    const oldGenerics = new Map(oldFile.generics.map(g => [g.id, g.id])); // Simplified
    const newGenerics = new Map(newFile.generics.map(g => [g.id, g.id]));

    for (const id of newGenerics.keys()) {
      if (!oldGenerics.has(id)) added.push(id);
    }
    for (const id of oldGenerics.keys()) {
      if (!newGenerics.has(id)) removed.push(id);
    }

    return { added, removed, modified };
  }

  /**
   * Compare two sets of files and return all modified symbol IDs across the project.
   */
  public detectBatchChanges(oldFiles: Map<string, ParsedFile>, newFiles: ParsedFile[]): string[] {
    const allChangedIds = new Set<string>();

    for (const file of newFiles) {
      const old = oldFiles.get(file.path);
      const diff = this.detectSymbolChanges(old, file);
      
      diff.added.forEach(id => allChangedIds.add(id));
      diff.modified.forEach(id => allChangedIds.add(id));
      // Removal is handled by graph-builder removing stale nodes, but we might want to track it for impact
    }

    return Array.from(allChangedIds);
  }
}
