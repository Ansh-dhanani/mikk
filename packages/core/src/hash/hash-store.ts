import * as path from 'node:path'
import * as fs from 'node:fs'
import Database from 'better-sqlite3'
import { logger } from '../utils/logger.js'

const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS file_hashes (
  path        TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_updated_at ON file_hashes(updated_at);
`

/**
 * HashStore — SQLite-backed persistent store for file content hashes.
 *
 * Survives process restarts, handles concurrent access via WAL mode,
 * and provides fast O(1) lookups for change detection.
 */
export class HashStore {
    private db: InstanceType<typeof Database>

    constructor(projectRoot: string) {
        const dbPath = path.join(projectRoot, '.mikk', 'cache', 'hashes.db')
        const dbDir = path.dirname(dbPath)

        // Ensure directory exists
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true })
        }

        this.db = this.openDatabase(dbPath)
        this.db.exec(CREATE_SCHEMA_SQL)
    }

    private openDatabase(dbPath: string): InstanceType<typeof Database> {
        try {
            const db = new Database(dbPath)
            // WAL mode: concurrent reads + writes, atomic commits
            db.pragma('journal_mode = WAL')
            // Wait up to 5s if locked by another process
            db.pragma('busy_timeout = 5000')
            return db
        } catch (err: any) {
            // Corrupted database — delete and recreate
            logger.warn('Hash store corrupted, recreating', { error: err.message })
            try {
                fs.unlinkSync(dbPath)
            } catch { /* ignore */ }
            const db = new Database(dbPath)
            db.pragma('journal_mode = WAL')
            db.pragma('busy_timeout = 5000')
            return db
        }
    }

    /** Get the stored hash for a file path, or null if not tracked */
    get(filePath: string): string | null {
        const row = this.db
            .prepare('SELECT hash FROM file_hashes WHERE path = ?')
            .get(filePath) as { hash: string } | undefined
        return row?.hash ?? null
    }

    /** Store or update the hash for a file */
    set(filePath: string, hash: string, sizeBytes: number): void {
        this.db
            .prepare(
                `INSERT OR REPLACE INTO file_hashes
                 (path, hash, size_bytes, updated_at) VALUES (?, ?, ?, ?)`
            )
            .run(filePath, hash, sizeBytes, Date.now())
    }

    /** Remove tracked hash for a (deleted) file */
    delete(filePath: string): void {
        this.db
            .prepare('DELETE FROM file_hashes WHERE path = ?')
            .run(filePath)
    }

    /** Return all paths whose updated_at is greater than a timestamp */
    getChangedSince(timestamp: number): string[] {
        const rows = this.db
            .prepare('SELECT path FROM file_hashes WHERE updated_at > ?')
            .all(timestamp) as { path: string }[]
        return rows.map(r => r.path)
    }

    /** Return all tracked file paths */
    getAllPaths(): string[] {
        const rows = this.db
            .prepare('SELECT path FROM file_hashes')
            .all() as { path: string }[]
        return rows.map(r => r.path)
    }

    /** Batch-set multiple hashes inside a single transaction (fast for init) */
    setBatch(entries: { path: string; hash: string; sizeBytes: number }[]): void {
        const insert = this.db.prepare(
            `INSERT OR REPLACE INTO file_hashes
             (path, hash, size_bytes, updated_at) VALUES (?, ?, ?, ?)`
        )
        const now = Date.now()
        const runAll = this.db.transaction((rows: typeof entries) => {
            for (const row of rows) {
                insert.run(row.path, row.hash, row.sizeBytes, now)
            }
        })
        runAll(entries)
    }

    /** Close the database connection */
    close(): void {
        this.db.close()
    }
}
