/**
 * Code-Specific Embedding Enhancer
 * 
 * Improves Xenova embeddings by adding code-aware features:
 * 1. Parses function signatures for semantic meaning
 * 2. Extracts API patterns, imports, types
 * 3. Weight boosting for code-specific terms
 * 4. Generates training pairs for potential fine-tuning
 */

const CODE_TERMS = {
  // APIs & HTTP
  api: ['get', 'post', 'put', 'delete', 'patch', 'request', 'response', 'endpoint', 'route', 'handler', 'middleware', 'controller'],
  
  // Database  
  database: ['query', 'insert', 'update', 'delete', 'select', 'transaction', 'migration', 'model', 'entity', 'repository', 'prisma', 'mongoose'],
  
  // Auth
  auth: ['auth', 'login', 'logout', 'token', 'jwt', 'session', 'cookie', 'password', 'hash', 'verify', 'permission', 'role', 'guard'],
  
  // React/Frontend
  frontend: ['component', 'hook', 'useState', 'useEffect', 'useContext', 'render', 'props', 'jsx', 'tsx', 'useClient'],
  
  // Business Logic
  business: ['service', 'logic', 'validate', 'process', 'workflow', 'pipeline', 'batch', 'job', 'queue', 'event'],
  
  // Error Handling
  error: ['error', 'exception', 'throw', 'catch', 'try', 'finally', 'fail', 'retry', 'fallback'],
  
  // Types
  types: ['interface', 'type', 'enum', 'union', 'intersection', 'generic', 'schema', 'dto', 'vo'],
  
  // Utilities
  utils: ['util', 'helper', 'parse', 'format', 'transform', 'convert', 'encode', 'decode', 'serialize'],
}

// Weights for different code features
const TERM_WEIGHTS = {
  api: 2.0,
  database: 2.0,
  auth: 2.0,
  frontend: 2.0,
  business: 1.5,
  error: 1.5,
  types: 1.8,
  utils: 1.2,
}

export function enhanceCodeEmbedding(text: string): string {
  let enhanced = text.toLowerCase()
  
  // Add semantic markers for each category
  for (const [category, terms] of Object.entries(CODE_TERMS)) {
    let hasCategory = false
    
    for (const term of terms) {
      if (enhanced.includes(term)) {
        hasCategory = true
        break
      }
    }
    
    // Add category marker with weight
    if (hasCategory) {
      const weight = TERM_WEIGHTS[category as keyof typeof TERM_WEIGHTS] || 1.0
      // Repeat category name for weight boost
      for (let i = 0; i < weight; i++) {
        enhanced += ` ${category}`
      }
    }
  }
  
  // Extract function signature patterns and enhance
  // handleUser(email: string) -> handleUser user email authentication
  enhanced = enhanced.replace(/(\w+)\(([^)]*)\)/g, '$1 $2')
  
  // Extract type annotations
  // : string -> string type
  enhanced = enhanced.replace(/:(\w+)/g, ' $1')
  
  // Extract return types
  // -> Promise<User> -> returns user promise response
  enhanced = enhanced.replace(/->\s*(\w+)/g, ' returns $1')
  
  return enhanced
}

export function generateCodePairs(
  functions: Array<{ name: string; file: string; params?: any[]; returnType?: string; purpose?: string }>,
  classes: Array<{ name: string; file: string; methods?: any[] }> = []
): Array<{ text1: string; text2: string; label: number }> {
  const pairs: Array<{ text1: string; text2: string; label: number }> = []
  
  // Same file = similar (positive pairs)
  const fileGroups = new Map<string, typeof functions>()
  
  for (const fn of functions) {
    if (!fileGroups.has(fn.file)) {
      fileGroups.set(fn.file, [])
    }
    fileGroups.get(fn.file)!.push(fn)
  }
  
  // Generate positive pairs (same file)
  for (const [, fns] of fileGroups) {
    if (fns.length < 2) continue
    
    for (let i = 0; i < fns.length; i++) {
      for (let j = i + 1; j < fns.length; j++) {
        const text1 = generateCodeText(fns[i])
        const text2 = generateCodeText(fns[j])
        
        if (text1 && text2) {
          pairs.push({ text1, text2, label: 1 }) // Similar
        }
      }
    }
  }
  
  // Generate negative pairs (different files - different modules)
  const allFiles = [...fileGroups.keys()]
  if (allFiles.length > 1) {
    for (let i = 0; i < Math.min(pairs.length, 100); i++) {
      const idx1 = Math.floor(Math.random() * functions.length)
      const idx2 = Math.floor(Math.random() * functions.length)
      
      if (functions[idx1].file !== functions[idx2].file) {
        pairs.push({
          text1: generateCodeText(functions[idx1]),
          text2: generateCodeText(functions[idx2]),
          label: 0 // Not similar
        })
      }
    }
  }
  
  return pairs
}

function generateCodeText(fn: { name: string; params?: any[]; returnType?: string; purpose?: string }): string {
  const parts = [fn.name]
  
  if (fn.params) {
    parts.push(...fn.params.map(p => p.name))
  }
  
  if (fn.returnType) {
    parts.push(fn.returnType)
  }
  
  if (fn.purpose) {
    // Extract keywords from purpose
    const keywords = fn.purpose.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    parts.push(...keywords)
  }
  
  // Enhance with code context
  return enhanceCodeEmbedding(parts.join(' '))
}

export function extractCodeCategory(text: string): string {
  text = text.toLowerCase()
  
  // Priority order: more specific first
  const priorityCategories = [
    'database',   // specific first
    'frontend',   // specific
    'auth',      // specific
    'error',     // handle error
    'types',     // type-related
    'business',  // payment, billing
    'api',       // general HTTP
    'utils',     // generic last
  ]
  
  for (const category of priorityCategories) {
    const terms = CODE_TERMS[category as keyof typeof CODE_TERMS]
    if (terms) {
      for (const term of terms) {
        if (text.includes(term)) {
          return category
        }
      }
    }
  }
  
  return 'unknown'
}

export function calculateCodeSimilarity(text1: string, text2: string): number {
  const cat1 = extractCodeCategory(text1)
  const cat2 = extractCodeCategory(text2)
  
  // Same category = boost similarity
  if (cat1 !== 'unknown' && cat1 === cat2) {
    return 0.8 // High similarity boost for same code category
  }
  
  // Default low similarity (will use embedding)
  return 0.1
}