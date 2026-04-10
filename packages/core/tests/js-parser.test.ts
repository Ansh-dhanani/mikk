import { describe, test, expect } from 'bun:test'
import { TypescriptExtractor } from '../src/parser/oxc-parser'

const CJS_MODULE = `
const db = require('./db')
function hashPassword(password) { return password }
module.exports = { hashPassword }
`

const ESM_MODULE = `
import { readFile } from 'fs/promises'
export async function loadConfig(configPath) { return {} }
`

describe('JavaScript Recognition (via OXC)', () => {
    test('extracts CJS exports as functions', async () => {
        const extractor = new TypescriptExtractor()
        const result = await extractor.extract('src/auth.js', CJS_MODULE)
        expect(result.functions.some(f => f.name === 'hashPassword')).toBe(true)
    })

    test('extracts ESM imports and exports', async () => {
        const extractor = new TypescriptExtractor()
        const result = await extractor.extract('src/loader.js', ESM_MODULE)
        expect(result.imports.some(i => i.source === 'fs/promises')).toBe(true)
        expect(result.functions.some(f => f.name === 'loadConfig')).toBe(true)
    })

    test('parses JSX without crashing', async () => {
        const extractor = new TypescriptExtractor()
        const result = await extractor.extract('src/App.jsx', 'function App() { return <div></div> }')
        expect(result.functions.some(f => f.name === 'App')).toBe(true)
    })
})
