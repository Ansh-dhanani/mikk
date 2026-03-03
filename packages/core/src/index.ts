// @getmikk/core — Public API
// Every other package imports from '@getmikk/core'

export * from './parser/index.js'
export * from './graph/index.js'
export * from './contract/index.js'
export * from './hash/index.js'
export * from './utils/errors.js'
export * from './utils/logger.js'
export { discoverFiles, discoverContextFiles, readFileContent, writeFileContent, fileExists, setupMikkDirectory, readMikkIgnore, parseMikkIgnore, detectProjectLanguage, getDiscoveryPatterns, generateMikkIgnore } from './utils/fs.js'
export type { ContextFile, ContextFileType, ProjectLanguage } from './utils/fs.js'
export { minimatch } from './utils/minimatch.js'
export { scoreFunctions, findFuzzyMatches, levenshtein, splitCamelCase, extractKeywords } from './utils/fuzzy-match.js'
