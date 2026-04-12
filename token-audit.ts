#!/usr/bin/env tsx

/**
 * TOKEN COUNTING AUDIT FOR MIKK
 * 
 * This script analyzes the token counting implementation to verify accuracy.
 */

// Constants from tools.ts
const _CPT = 4; // Characters per token
const _ALC = 42; // Average tokens per character

// Mock data for testing
const mockResponse = {
    modules: [
        {
            id: "test-module",
            name: "Test Module",
            functions: [
                {
                    name: "testFunction",
                    file: "src/test.ts",
                    startLine: 1,
                    endLine: 50,
                    purpose: "Test function for token counting",
                    body: "function testFunction() {\n  return 'test';\n}"
                }
            ]
        }
    ]
};

// Token counting functions from tools.ts
function _tok(o: unknown): number { 
    return Math.max(1, Math.round(JSON.stringify(o).length / _CPT)) 
}

function _fileTok(lock: any, fp: string): number { 
    const fs2 = Object.values(lock.functions).filter((f: any) => f.file === fp); 
    const ln = fs2.length > 0 ? Math.max(...fs2.map((f: any) => f.endLine)) : 80; 
    return Math.round((ln * _ALC) / _CPT) 
}

function _track(raw: number, resp: unknown): Record<string, number> {
    const used = _tok(resp); 
    const saved = Math.max(0, raw - used); 
    return { used, raw, saved } 
}

// Audit function
function auditTokenCounting() {
    console.log("=== TOKEN COUNTING AUDIT ===\n");
    
    // Test 1: Basic token counting
    const testResponse = { message: "Hello world", data: [1, 2, 3] };
    const tokens = _tok(testResponse);
    const jsonLength = JSON.stringify(testResponse).length;
    
    console.log("Test 1: Basic Token Counting");
    console.log(`JSON length: ${jsonLength} chars`);
    console.log(`Calculated tokens: ${tokens}`);
    console.log(`Expected tokens: ${Math.round(jsonLength / 4)} (length / ${_CPT})`);
    console.log(`Accuracy: ${tokens === Math.round(jsonLength / 4) ? 'PASS' : 'FAIL'}\n`);
    
    // Test 2: File token calculation
    const mockLock = {
        functions: {
            "fn1": { file: "src/test.ts", endLine: 100 },
            "fn2": { file: "src/test.ts", endLine: 50 },
            "fn3": { file: "src/other.ts", endLine: 80 }
        }
    };
    
    const fileTokens = _fileTok(mockLock, "src/test.ts");
    const expectedFileTokens = Math.round((100 * _ALC) / _CPT); // Max endLine * ALC / CPT
    
    console.log("Test 2: File Token Calculation");
    console.log(`Max endLine in src/test.ts: 100`);
    console.log(`Calculated file tokens: ${fileTokens}`);
    console.log(`Expected tokens: ${expectedFileTokens} (100 * ${_ALC} / ${_CPT})`);
    console.log(`Accuracy: ${fileTokens === expectedFileTokens ? 'PASS' : 'FAIL'}\n`);
    
    // Test 3: Savings calculation
    const rawCost = 1000;
    const response = { result: "success" };
    const tracking = _track(rawCost, response);
    
    console.log("Test 3: Savings Calculation");
    console.log(`Raw cost: ${rawCost}`);
    console.log(`Actual used tokens: ${tracking.used}`);
    console.log(`Calculated savings: ${tracking.saved}`);
    console.log(`Expected savings: ${Math.max(0, rawCost - tracking.used)}`);
    console.log(`Accuracy: ${tracking.saved === Math.max(0, rawCost - tracking.used) ? 'PASS' : 'FAIL'}\n`);
    
    // Test 4: Real-world simulation
    console.log("Test 4: Real-World Simulation");
    
    // Simulate a typical mikk_query_context response
    const typicalResponse = {
        modules: [
            {
                id: "mesh-core",
                name: "Core Module",
                functions: Array.from({ length: 10 }, (_, i) => ({
                    name: `function${i}`,
                    file: `src/file${i}.ts`,
                    startLine: i * 10 + 1,
                    endLine: i * 10 + 20,
                    purpose: `Function ${i} purpose description with some details`,
                    body: `function function${i}() {\n  // Implementation ${i}\n  return ${i};\n}`
                }))
            }
        ],
        routes: [
            { method: "GET", path: "/api/test", handler: "testFunction" },
            { method: "POST", path: "/api/create", handler: "createFunction" }
        ],
        constraints: [],
        warning: null
    };
    
    const typicalTokens = _tok(typicalResponse);
    const typicalRawCost = typicalTokens * 3; // Mikk claims 3x compression
    const typicalTracking = _track(typicalRawCost, typicalResponse);
    
    console.log(`Typical response JSON length: ${JSON.stringify(typicalResponse).length} chars`);
    console.log(`Actual tokens used: ${typicalTokens}`);
    console.log(`Raw cost estimate: ${typicalRawCost}`);
    console.log(`Calculated savings: ${typicalTracking.saved}`);
    console.log(`Savings percentage: ${Math.round((typicalTracking.saved / typicalRawCost) * 100)}%\n`);
    
    // Test 5: Constants analysis
    console.log("Test 5: Constants Analysis");
    console.log(`Characters per token (_CPT): ${_CPT}`);
    console.log(`Average tokens per character (_ALC): ${_ALC}`);
    console.log(`Token calculation: JSON.length / ${_CPT}`);
    console.log(`File token calc: maxLine * ${_ALC} / ${_CPT}`);
    
    // Check if constants make sense
    const expectedCPT = 4; // Typical: ~4 chars per token
    const expectedALC = 0.25; // Typical: ~0.25 tokens per char
    
    console.log(`\nConstant Analysis:`);
    console.log(`_CPT accuracy: ${_CPT === expectedCPT ? 'REASONABLE' : 'SUSPICIOUS'}`);
    console.log(`_ALC accuracy: ${Math.abs(_ALC - expectedALC) < 1 ? 'REASONABLE' : 'SUSPICIOUS'}`);
    console.log(`Note: _ALC seems inverted - should be ~0.25, not 42`);
    
    // Test 6: Inverted constant issue
    console.log("\nTest 6: Inverted Constant Issue");
    console.log("The _ALC constant appears to be inverted.");
    console.log("Current formula: (lines * 42) / 4 = lines * 10.5 tokens per line");
    console.log("Expected formula: (lines * 80 chars) / 4 = lines * 20 tokens");
    console.log("Issue: _ALC should be chars per line, not tokens per char");
    
    const correctedALC = 80; // 80 chars per line average
    const correctedFileTokens = Math.round((100 * correctedALC) / _CPT);
    console.log(`Corrected file tokens (100 lines): ${correctedFileTokens}`);
    console.log(`Current file tokens (100 lines): ${fileTokens}`);
    console.log(`Difference: ${correctedFileTokens - fileTokens} tokens (${Math.round(((correctedFileTokens - fileTokens) / fileTokens) * 100)}%)`);
}

// Run the audit
auditTokenCounting();
