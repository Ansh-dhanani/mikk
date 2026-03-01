/**
 * @getmikk/registry — Capsule Registry API
 *
 * A package registry for Mikk capsules (reusable modules).
 * Scaffold for a Hono + PostgreSQL API server.
 *
 * Planned endpoints:
 * - POST   /capsules          — Publish a capsule
 * - GET    /capsules          — Search/browse capsules
 * - GET    /capsules/:id      — Get capsule details
 * - GET    /capsules/:id/mikk — Get the mikk contract for a capsule
 * - DELETE /capsules/:id      — Unpublish a capsule
 *
 * Data model:
 * - Capsule: { id, name, version, moduleContract, lockFragment, readme, author, downloads }
 *
 * To set up:
 *   bun add hono @hono/node-server
 */

export interface CapsuleMetadata {
    id: string
    name: string
    version: string
    description: string
    author: string
    moduleContract: object   // The module's mikk.json fragment
    lockFragment: object     // The module's lock data
    readme: string
    publishedAt: string
    downloads: number
}

export function placeholder() {
    console.log('Mikk Registry scaffold — see comments for setup')
}
