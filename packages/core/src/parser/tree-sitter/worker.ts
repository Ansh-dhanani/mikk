import { parentPort, workerData } from 'node:worker_threads'
import { TreeSitterParser } from './parser.js'

if (!parentPort) {
    process.exit(1)
}

const parser = new TreeSitterParser()

parentPort.on('message', async (message) => {
    if (message.type === 'extract') {
        const { filePath, content } = message
        try {
            // Access the private method using any cast for simplicity in the worker wrapper
            const result = await (parser as any)._extractLocal(filePath, content)
            parentPort!.postMessage({ type: 'result', id: message.id, result })
        } catch (err: any) {
            parentPort!.postMessage({ type: 'error', id: message.id, error: err.message })
        }
    } else if (message.type === 'exit') {
        process.exit(0)
    }
})
