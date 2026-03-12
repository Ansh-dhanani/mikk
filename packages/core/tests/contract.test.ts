import { describe, it, expect } from 'bun:test'
import { MikkContractSchema, MikkLockSchema } from '../src/contract/schema'
import { LockCompiler } from '../src/contract/lock-compiler'
import { ContractGenerator } from '../src/contract/contract-generator'
import { GraphBuilder } from '../src/graph/graph-builder'
import { ClusterDetector } from '../src/graph/cluster-detector'
import { mockParsedFile, mockFunction, mockImport } from './helpers'

describe('MikkContractSchema', () => {
    const validContract = {
        version: '1.0.0',
        project: {
            name: 'my-api',
            description: 'REST API',
            language: 'typescript',
            entryPoints: ['src/index.ts'],
        },
        declared: {
            modules: [{
                id: 'auth',
                name: 'Authentication',
                description: 'Handles auth',
                paths: ['src/auth/**'],
            }],
            constraints: ['No direct DB access outside db/'],
            decisions: [{
                id: 'adr-001',
                title: 'JWT over sessions',
                reason: 'Scaling',
                date: '2024-01-15',
            }],
        },
    }

    it('validates correct mikk.json', () => {
        const result = MikkContractSchema.safeParse(validContract)
        expect(result.success).toBe(true)
    })

    it('rejects mikk.json with missing required fields', () => {
        const result = MikkContractSchema.safeParse({ version: '1.0.0' })
        expect(result.success).toBe(false)
    })

    it('applies default overwrite mode', () => {
        const result = MikkContractSchema.safeParse(validContract)
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.overwrite.mode).toBe('never')
        }
    })
})

describe('LockCompiler', () => {
    const compiler = new LockCompiler()
    const contract = MikkContractSchema.parse({
        version: '1.0.0',
        project: { name: 'test', description: 'Test', language: 'typescript', entryPoints: ['src/index.ts'] },
        declared: {
            modules: [
                { id: 'auth', name: 'Auth', description: 'Auth module', paths: ['src/auth/**'] },
                { id: 'utils', name: 'Utils', description: 'Utils', paths: ['src/utils/**'] },
            ],
        },
    })

    it('compiles a valid lock file', () => {
        const files = [
            mockParsedFile(
                'src/auth/verify.ts',
                [mockFunction('verifyToken', ['jwtDecode'], 'src/auth/verify.ts', true)],
                [mockImport('../utils/jwt', ['jwtDecode'], 'src/utils/jwt.ts')]
            ),
            mockParsedFile('src/utils/jwt.ts', [mockFunction('jwtDecode', [], 'src/utils/jwt.ts', true)]),
        ]
        const graph = new GraphBuilder().build(files)
        const lock = compiler.compile(graph, contract, files)

        expect(lock.version).toBe('1.7.0')
        expect(lock.syncState.status).toBe('clean')
        expect(Object.keys(lock.functions).length).toBeGreaterThan(0)
        expect(Object.keys(lock.modules).length).toBeGreaterThanOrEqual(1)
        expect(Object.keys(lock.files).length).toBe(2)
    })

    it('assigns functions to correct modules', () => {
        const files = [
            mockParsedFile('src/auth/verify.ts', [mockFunction('verifyToken', [], 'src/auth/verify.ts')]),
        ]
        const graph = new GraphBuilder().build(files)
        const lock = compiler.compile(graph, contract, files)
        expect(lock.functions['fn:src/auth/verify.ts:verifyToken']?.moduleId).toBe('auth')
    })

    it('computes stable module hash', () => {
        const files = [
            mockParsedFile('src/auth/verify.ts', [mockFunction('verifyToken', [], 'src/auth/verify.ts')]),
        ]
        const graph = new GraphBuilder().build(files)
        const lock1 = compiler.compile(graph, contract, files)
        const lock2 = compiler.compile(graph, contract, files)
        expect(lock1.modules['auth']?.hash).toBe(lock2.modules['auth']?.hash)
    })

    it('validates against MikkLockSchema', () => {
        const files = [
            mockParsedFile('src/auth/verify.ts', [mockFunction('verifyToken', [], 'src/auth/verify.ts')]),
        ]
        const graph = new GraphBuilder().build(files)
        const lock = compiler.compile(graph, contract, files)
        const result = MikkLockSchema.safeParse(lock)
        expect(result.success).toBe(true)
    })
})

describe('ContractGenerator', () => {
    it('generates contract from clusters', () => {
        const files = [
            mockParsedFile('src/auth/verify.ts', [mockFunction('verifyToken', [], 'src/auth/verify.ts', true)]),
            mockParsedFile('src/auth/middleware.ts', [mockFunction('authMiddleware', [], 'src/auth/middleware.ts', true)]),
        ]
        const graph = new GraphBuilder().build(files)
        const detector = new ClusterDetector(graph, 1)
        const clusters = detector.detect()

        const generator = new ContractGenerator()
        const contract = generator.generateFromClusters(clusters, files, 'test-project')

        expect(contract.version).toBe('1.0.0')
        expect(contract.project.name).toBe('test-project')
        expect(contract.declared.modules.length).toBeGreaterThan(0)
        expect(contract.overwrite.mode).toBe('never')
    })
})
