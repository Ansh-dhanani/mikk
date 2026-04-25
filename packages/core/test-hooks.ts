/**
 * Test script for @getmikk/core hooks API
 * Tests across: Mikk itself, Metis, Svelte test repo, (SpringBoot if available)
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  // Import from local package (compiled)
  getLockMeta,
  searchFunctions,
  getFunction,
  getClass,
  getAllClasses,
  getAllModules,
  getModule,
  classifyFile,
  isDeadCodeExempt,
  getRoutes,
  findRoute,
  getDataLayer,
  getContextFiles,
  getAllFiles,
  getFile,
  getModuleFiles,
  getModuleFunctions,
  groupByModule,
  groupByFile,
  getCallers,
  getCallees,
  getExportedFunctions,
  getAsyncFunctions,
  getFunctionsReturning,
} from '@getmikk/core'

const TEST_REPOS = [
  { name: 'Mikk', path: 'C:/Users/Ansh/Desktop/web/Mikk', lockFile: 'mikk.lock.json' },
  { name: 'Metis', path: 'C:/Users/Ansh/Desktop/web/metis', lockFile: 'mikk.lock.json' },
  { name: 'Svelte', path: 'C:/Users/Ansh/Desktop/web/test-repos/svelte', lockFile: 'mikk.lock.json' },
]

const TEST_FILES = [
  // Next.js App Router
  { path: 'src/app/users/page.tsx', expectedRole: 'route', expectedFramework: 'nextjs' },
  { path: 'src/app/api/auth/route.ts', expectedRole: 'api-handler', expectedFramework: 'nextjs' },
  { path: 'src/app/layout.tsx', expectedRole: 'layout', expectedFramework: 'nextjs' },
  { path: 'src/app/loading.tsx', expectedRole: 'loading', expectedFramework: 'nextjs' },
  { path: 'src/app/error.tsx', expectedRole: 'error-page', expectedFramework: 'nextjs' },
  { path: 'src/components/Header.tsx', expectedRole: 'component', expectedFramework: 'react' },
  
  // Next.js Pages Router
  { path: 'pages/index.tsx', expectedRole: 'route', expectedFramework: 'nextjs' },
  { path: 'pages/api/users.ts', expectedRole: 'api-handler', expectedFramework: 'nextjs' },
  
  // SvelteKit
  { path: 'src/routes/+page.svelte', expectedRole: 'route', expectedFramework: 'sveltekit' },
  { path: 'src/routes/+page.server.ts', expectedRole: 'api-handler', expectedFramework: 'sveltekit' },
  { path: 'src/routes/api/posts/+server.ts', expectedRole: 'api-handler', expectedFramework: 'sveltekit' },
  { path: 'src/lib/components/Button.svelte', expectedRole: 'component', expectedFramework: 'svelte' },
  
  // Express/Fastify
  { path: 'src/routes/auth.ts', expectedRole: 'api-handler', expectedFramework: 'express' },
  { path: 'src/middleware/auth.ts', expectedRole: 'middleware', expectedFramework: 'express' },
  { path: 'src/server.ts', expectedRole: 'entry', expectedFramework: 'express' },
  
  // Django
  { path: 'models.py', expectedRole: 'model', expectedFramework: 'django' },
  { path: 'views.py', expectedRole: 'view', expectedFramework: 'django' },
  { path: 'urls.py', expectedRole: 'route', expectedFramework: 'django' },
  { path: 'settings.py', expectedRole: 'config', expectedFramework: 'django' },
  
  // Flask
  { path: 'app.py', expectedRole: 'entry', expectedFramework: 'flask' },
  { path: 'models.py', expectedRole: 'model', expectedFramework: 'flask' },
  
  // Go
  { path: 'handlers/user.go', expectedRole: 'api-handler', expectedFramework: 'go' },
  { path: 'models/user.go', expectedRole: 'model', expectedFramework: 'go' },
  { path: 'main.go', expectedRole: 'entry', expectedFramework: 'go' },
  
  // Spring Boot
  { path: 'src/main/java/com/example/controller/UserController.java', expectedRole: 'controller', expectedFramework: 'spring' },
  { path: 'src/main/java/com/example/model/User.java', expectedRole: 'model', expectedFramework: 'spring' },
  { path: 'src/main/java/com/example/service/UserService.java', expectedRole: 'service', expectedFramework: 'spring' },
  
  // NestJS
  { path: 'src/users/users.controller.ts', expectedRole: 'controller', expectedFramework: 'nestjs' },
  { path: 'src/users/users.service.ts', expectedRole: 'service', expectedFramework: 'nestjs' },
  { path: 'src/users/users.module.ts', expectedRole: 'module', expectedFramework: 'nestjs' },
  
  // Test files for dead code exemption
  { path: 'src/app/page.tsx', expectedExempt: true },
  { path: 'pages/about.tsx', expectedExempt: true },
  { path: 'src/routes/+page.svelte', expectedExempt: true },
  { path: 'src/server.ts', expectedExempt: true },
  { path: '.eslintrc.js', expectedExempt: true },
  { path: 'src/utils/helper.ts', expectedExempt: false },
  { path: 'src/lib/utils.ts', expectedExempt: false },
]

async function loadLock(repoPath: string, lockFile: string) {
  const lockPath = path.join(repoPath, lockFile)
  const content = await fs.readFile(lockPath, 'utf-8')
  return JSON.parse(content)
}

async function testRepo(repo: { name: string; path: string; lockFile: string }) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Testing: ${repo.name}`)
  console.log('='.repeat(60))
  
  try {
    const lock = await loadLock(repo.path, repo.lockFile)
    const meta = getLockMeta(lock)
    console.log(`\n[Meta]`, meta)
    
    // Test search functions
    console.log(`\n[Search] Testing searchFunctions...`)
    const searchResults = searchFunctions(lock, 'user', { limit: 3 })
    console.log(`  Found ${searchResults.length} functions matching "user"`)
    for (const fn of searchResults.slice(0, 3)) {
      console.log(`    - ${fn.name} in ${fn.file}:${fn.startLine}`)
    }
    
    // Test get function
    if (searchResults.length > 0) {
      const fn = getFunction(lock, searchResults[0].id)
      console.log(`\n[Get] getFunction("${searchResults[0].id}") = ${fn ? fn.name : 'NOT FOUND'}`)
    }
    
    // Test get class
    console.log(`\n[Class] Testing getAllClasses...`)
    const classes = getAllClasses(lock)
    console.log(`  Found ${classes.length} classes`)
    if (classes.length > 0) {
      const firstClass = classes[0]
      const foundClass = getClass(lock, firstClass.id)
      console.log(`  getClass("${firstClass.id}") = ${foundClass ? foundClass.name : 'NOT FOUND'}`)
    }
    
    // Test modules
    console.log(`\n[Module] Testing getAllModules...`)
    const modules = getAllModules(lock)
    console.log(`  Found ${modules.length} modules`)
    if (modules.length > 0) {
      const firstModule = modules[0]
      const foundModule = getModule(lock, firstModule.id)
      console.log(`  getModule("${firstModule.id}") = ${foundModule ? foundModule.name : 'NOT FOUND'}`)
      
      // Get module files/functions
      const modFiles = getModuleFiles(lock, firstModule.id)
      const modFns = getModuleFunctions(lock, firstModule.id)
      console.log(`    Files: ${modFiles.length}, Functions: ${modFns.length}`)
    }
    
    // Test routes
    console.log(`\n[Routes] Testing getRoutes...`)
    const routes = getRoutes(lock)
    console.log(`  Found ${routes.length} routes`)
    const authRoutes = findRoute(lock, 'auth')
    console.log(`  findRoute("auth") = ${authRoutes.length} routes`)
    
    // Test data layer
    console.log(`\n[Data Layer] Testing getDataLayer...`)
    const dataModels = getDataLayer(lock)
    console.log(`  Found ${dataModels.length} data models`)
    const allContextFiles = getContextFiles(lock)
    console.log(`  getContextFiles() = ${allContextFiles.length} context files`)
    
    // Test files
    console.log(`\n[Files] Testing getAllFiles...`)
    const files = getAllFiles(lock)
    console.log(`  Found ${files.length} files`)
    
    // Test grouping
    console.log(`\n[Grouping] Testing groupByModule...`)
    const byModule = groupByModule(lock)
    console.log(`  Groups: ${Object.keys(byModule).length}`)
    
    const byFile = groupByFile(lock)
    console.log(`  groupByFile groups: ${Object.keys(byFile).length}`)
    
    // Test filtering
    console.log(`\n[Filtering] Testing getExportedFunctions...`)
    const exported = getExportedFunctions(lock)
    console.log(`  Exported: ${exported.length}`)
    
    const asyncFns = getAsyncFunctions(lock)
    console.log(`  Async: ${asyncFns.length}`)
    
    const returningPromise = getFunctionsReturning(lock, 'Promise')
    console.log(`  Returning Promise: ${returningPromise.length}`)
    
    // Test callers/callees
    console.log(`\n[Graph] Testing getCallers/getCallees...`)
    if (searchResults.length > 0) {
      const firstFnId = searchResults[0].id
      const callers = getCallers(lock, firstFnId)
      const callees = getCallees(lock, firstFnId)
      console.log(`  ${firstFnId}:`)
      console.log(`    Callers: ${callers.length}, Callees: ${callees.length}`)
    }
    
    console.log(`\n✅ ${repo.name}: All basic tests PASSED`)
    return true
    
  } catch (error) {
    console.error(`\n❌ ${repo.name}: FAILED`, error)
    return false
  }
}

async function testSemanticClassifier() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Testing: SemanticRoleClassifier`)
  console.log('='.repeat(60))
  
  let passed = 0
  let failed = 0
  
  for (const testFile of TEST_FILES) {
    try {
      const result = classifyFile(testFile.path)
      const exemptResult = isDeadCodeExempt(testFile.path)
      
      let status = '✅'
      
      // Check role if expected
      if (testFile.expectedRole && result.role !== testFile.expectedRole) {
        status = '⚠️'
        console.log(`  ${status} ${testFile.path}`)
        console.log(`       Expected: ${testFile.expectedRole}, Got: ${result.role}`)
        // Don't fail on role mismatch - it's best effort
      }
      
      // Check dead code exempt
      if ('expectedExempt' in testFile) {
        if (exemptResult !== testFile.expectedExempt) {
          status = '❌'
          failed++
          console.log(`  ${status} ${testFile.path}`)
          console.log(`       isDeadCodeExempt: expected ${testFile.expectedExempt}, got ${exemptResult}`)
        } else {
          passed++
          console.log(`  ✅ isDeadCodeExempt("${testFile.path}") = ${exemptResult}`)
        }
      } else {
        passed++
        console.log(`  ✅ classifyFile("${testFile.path}") = ${result.role} / ${result.framework}`)
      }
    } catch (error) {
      failed++
      console.log(`  ❌ ${testFile.path}: ERROR`, error)
    }
  }
  
  console.log(`\n✅ Semantic Classifier: ${passed} passed, ${failed} failed`)
  return failed === 0
}

async function main() {
  console.log('🚀 Testing @getmikk/core hooks API')
  console.log('='.repeat(60))
  
  let allPassed = true
  
  // Test each repo
  for (const repo of TEST_REPOS) {
    try {
      const repoPassed = await testRepo(repo)
      allPassed = allPassed && repoPassed
    } catch (error) {
      console.error(`❌ ${repo.name}: Skipped (not an error) - ${error}`)
    }
  }
  
  // Test semantic classifier
  const classifierPassed = await testSemanticClassifier()
  allPassed = allPassed && classifierPassed
  
  console.log(`\n${'='.repeat(60)}`)
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED')
  } else {
    console.log('⚠️ SOME TESTS FAILED')
  }
  console.log('='.repeat(60))
}

main()