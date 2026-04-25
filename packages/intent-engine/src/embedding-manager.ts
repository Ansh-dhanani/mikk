import type { MikkLock } from '@getmikk/core'
import { SemanticSearcher, type SemanticMatch } from './semantic-searcher.js'

/**
 * EmbeddingManager -- Singleton manager for SemanticSearcher instances.
 * Ensures only one indexing process happens per project, even across multiple tool calls.
 * Deduplicates rebuild requests and provides a clean, high-level API.
 */
export class EmbeddingManager {
    private static instance: EmbeddingManager
    private readonly searchers = new Map<string, SemanticSearcher>()
    private readonly indexingTasks = new Map<string, Promise<void>>()

    private constructor() { }

    static getInstance(): EmbeddingManager {
        if (!EmbeddingManager.instance) {
            EmbeddingManager.instance = new EmbeddingManager()
        }
        return EmbeddingManager.instance
    }

    /**
     * Get or create a SemanticSearcher for a project and ensure it is indexed.
     */
    async getSearcher(projectRoot: string, lock: MikkLock): Promise<SemanticSearcher> {
        let searcher = this.searchers.get(projectRoot)
        if (!searcher) {
            searcher = new SemanticSearcher(projectRoot)
            this.searchers.set(projectRoot, searcher)
        }

        // Deduplicate concurrent indexing for the same project
        const existingTask = this.indexingTasks.get(projectRoot)
        if (existingTask) {
            await existingTask
            return searcher
        }

        const indexTask = (async () => {
            try {
                await searcher!.index(lock)
            } finally {
                this.indexingTasks.delete(projectRoot)
            }
        })()

        this.indexingTasks.set(projectRoot, indexTask)
        await indexTask
        return searcher
    }

    /**
     * Search using a managed searcher.
     */
    async search(projectRoot: string, query: string, lock: MikkLock, topK = 10): Promise<SemanticMatch[]> {
        const searcher = await this.getSearcher(projectRoot, lock)
        return searcher.search(query, lock, topK)
    }

    /**
     * Invalidate a project's searcher (e.g. when lock file is manually updated).
     */
    invalidate(projectRoot: string): void {
        this.searchers.delete(projectRoot)
        this.indexingTasks.delete(projectRoot)
    }
}
