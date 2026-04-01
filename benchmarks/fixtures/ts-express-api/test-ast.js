import { readFileSync } from 'node:fs'
import { parseSync } from 'oxc-parser'

const code = readFileSync('src/routes/auth.ts', 'utf-8')
const ast = parseSync('src/routes/auth.ts', code)
const exprs = ast.program.body.filter(b => b.type === 'ExpressionStatement')
console.log(JSON.stringify(exprs[0], null, 2))
