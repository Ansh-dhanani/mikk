import fs from 'node:fs/promises'

const START_MARKER = '<!-- MIKK-START -->'
const END_MARKER = '<!-- MIKK-END -->'

export async function patchFileContent(filePath: string, newContent: string): Promise<void> {
    const block = `${START_MARKER}\n\n${newContent.trim()}\n\n${END_MARKER}`
    try {
        const existing = await fs.readFile(filePath, 'utf-8')
        const startIdx = existing.indexOf(START_MARKER)
        const endIdx = existing.indexOf(END_MARKER)
        
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            // Replace existing block perfectly
            const before = existing.slice(0, startIdx)
            const after = existing.slice(endIdx + END_MARKER.length)
            
            const result = `${before.trimEnd()}\n\n${block}\n\n${after.trimStart()}`.trim() + '\n'
            await fs.writeFile(filePath, result, 'utf-8')
        } else {
            // Append securely to the bottom
            const result = existing.trim() === '' 
                ? `${block}\n`
                : `${existing.trimEnd()}\n\n${block}\n`
            await fs.writeFile(filePath, result, 'utf-8')
        }
    } catch {
        // File doesn't exist, create it freshly
        await fs.writeFile(filePath, `${block}\n`, 'utf-8')
    }
}

export async function stripMikkBlock(filePath: string): Promise<boolean> {
    try {
        const existing = await fs.readFile(filePath, 'utf-8')
        const startIdx = existing.indexOf(START_MARKER)
        const endIdx = existing.indexOf(END_MARKER)
        
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const before = existing.slice(0, startIdx)
            const after = existing.slice(endIdx + END_MARKER.length)
            const result = `${before.trimEnd()}\n\n${after.trimStart()}`.trim() + '\n'
            
            if (result.trim() === '') {
                await fs.unlink(filePath)
            } else {
                await fs.writeFile(filePath, result, 'utf-8')
            }
            return true
        }
        return false
    } catch {
        return false
    }
}
