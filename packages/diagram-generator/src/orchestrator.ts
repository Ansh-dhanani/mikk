import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { MikkContract, MikkLock } from '@getmikk/core'
import { MainDiagramGenerator } from './generators/main-diagram.js'
import { ModuleDiagramGenerator } from './generators/module-diagram.js'
import { ImpactDiagramGenerator } from './generators/impact-diagram.js'
import { HealthDiagramGenerator } from './generators/health-diagram.js'
import { FlowDiagramGenerator } from './generators/flow-diagram.js'
import { CapsuleDiagramGenerator } from './generators/capsule-diagram.js'
import { DependencyMatrixGenerator } from './generators/dependency-matrix.js'

/**
 * DiagramOrchestrator — generates all diagram types and writes them to
 * the .mikk/diagrams/ directory structure.
 */
export class DiagramOrchestrator {
    constructor(
        private contract: MikkContract,
        private lock: MikkLock,
        private projectRoot: string
    ) { }

    /** Generate all diagrams */
    async generateAll(): Promise<{ generated: string[] }> {
        const generated: string[] = []

        // Main diagram
        const mainGen = new MainDiagramGenerator(this.contract, this.lock)
        await this.writeDiagram('diagrams/main.mmd', mainGen.generate())
        generated.push('diagrams/main.mmd')

        // Health diagram
        const healthGen = new HealthDiagramGenerator(this.contract, this.lock)
        await this.writeDiagram('diagrams/health.mmd', healthGen.generate())
        generated.push('diagrams/health.mmd')

        // Flow diagram (entry points)
        const flowGen = new FlowDiagramGenerator(this.lock)
        await this.writeDiagram('diagrams/flows/entry-points.mmd', flowGen.generateEntryPoints())
        generated.push('diagrams/flows/entry-points.mmd')

        // Dependency matrix
        const matrixGen = new DependencyMatrixGenerator(this.contract, this.lock)
        await this.writeDiagram('diagrams/dependency-matrix.mmd', matrixGen.generate())
        generated.push('diagrams/dependency-matrix.mmd')

        // Per-module diagrams
        for (const module of this.contract.declared.modules) {
            const moduleGen = new ModuleDiagramGenerator(this.contract, this.lock)
            await this.writeDiagram(`diagrams/modules/${module.id}.mmd`, moduleGen.generate(module.id))
            generated.push(`diagrams/modules/${module.id}.mmd`)

            const capsuleGen = new CapsuleDiagramGenerator(this.contract, this.lock)
            await this.writeDiagram(`diagrams/capsules/${module.id}.mmd`, capsuleGen.generate(module.id))
            generated.push(`diagrams/capsules/${module.id}.mmd`)
        }

        return { generated }
    }

    /** Generate impact diagram for specific changes */
    async generateImpact(changedIds: string[], impactedIds: string[]): Promise<string> {
        const impactGen = new ImpactDiagramGenerator(this.lock)
        const diagram = impactGen.generate(changedIds, impactedIds)
        const timestamp = Date.now()
        const filename = `diagrams/impact/impact-${timestamp}.mmd`
        await this.writeDiagram(filename, diagram)
        return filename
    }

    private async writeDiagram(relativePath: string, content: string): Promise<void> {
        const fullPath = path.join(this.projectRoot, '.mikk', relativePath)
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, content, 'utf-8')
    }
}
