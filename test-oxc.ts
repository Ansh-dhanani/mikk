import { OxcParser } from './packages/core/src/parser/oxc-parser.js';
import { OxcResolver } from './packages/core/src/parser/oxc-resolver.js';
import path from 'node:path';

async function test() {
    const parser = new OxcParser();
    const filePath = path.resolve('./packages/core/src/index.ts');
    const content = `
        import { getParser } from './parser/index.js';
        export function hello(name: string): string {
            return "Hello " + name;
        }
        export class Greeter {
            sayHi() { console.log("Hi"); }
        }
    `;

    console.log("--- Testing OxcParser ---");
    const parsed = await parser.parse(filePath, content);
    console.log("Language:", parsed.language);
    console.log("Functions found:", parsed.functions.length);
    parsed.functions.forEach(f => console.log(` - ${f.name} (ID: ${f.id})`));
    console.log("Classes found:", parsed.classes.length);
    parsed.classes.forEach(c => console.log(` - ${c.name} (ID: ${c.id})`));
    console.log("Imports found:", parsed.imports.length);

    console.log("\n--- Testing OxcResolver ---");
    const resolver = new OxcResolver(process.cwd());
    const source = './parser/index.js';
    const resolved = resolver.resolve(source, filePath);
    console.log(`Resolving '${source}' from '${filePath}':`);
    console.log(`Result: ${resolved}`);
}

test().catch(console.error);
