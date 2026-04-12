#!/usr/bin/env tsx

/**
 * CORRECTED TOKEN COUNTING FOR MIKK
 * 
 * This script provides the corrected token counting implementation.
 */

// CORRECTED CONSTANTS
const _CPT = 4; // Characters per token (correct)
const _AVG_CHARS_PER_LINE = 80; // Average characters per line (realistic)
const _AVG_TOKENS_PER_LINE = _AVG_CHARS_PER_LINE / _CPT; // ~20 tokens per line

// Current (incorrect) constants from tools.ts
const _CURRENT_ALC = 42; // This is wrong - should be chars per line, not tokens per char

// CORRECTED FUNCTIONS
function _tok_corrected(o: unknown): number { 
    return Math.max(1, Math.round(JSON.stringify(o).length / _CPT)) 
}

function _fileTok_corrected(lock: any, fp: string): number { 
    const fs2 = Object.values(lock.functions).filter((f: any) => f.file === fp); 
    const ln = fs2.length > 0 ? Math.max(...fs2.map((f: any) => f.endLine)) : 80; 
    return Math.round((ln * _AVG_CHARS_PER_LINE) / _CPT) 
}

// Current (incorrect) function from tools.ts
function _fileTok_current(lock: any, fp: string): number { 
    const fs2 = Object.values(lock.functions).filter((f: any) => f.file === fp); 
    const ln = fs2.length > 0 ? Math.max(...fs2.map((f: any) => f.endLine)) : 80; 
    return Math.round((ln * _CURRENT_ALC) / _CPT) 
}

// Analysis function
function analyzeTokenCountingIssues() {
    console.log("=== TOKEN COUNTING ISSUES ANALYSIS ===\n");
    
    // Test case: 100-line file
    const mockLock = {
        functions: {
            "fn1": { file: "src/test.ts", endLine: 100 }
        }
    };
    
    const currentTokens = _fileTok_current(mockLock, "src/test.ts");
    const correctedTokens = _fileTok_corrected(mockLock, "src/test.ts");
    
    console.log("File Token Calculation Comparison (100-line file):");
    console.log(`Current implementation: ${currentTokens} tokens`);
    console.log(`Corrected implementation: ${correctedTokens} tokens`);
    console.log(`Difference: ${correctedTokens - currentTokens} tokens`);
    console.log(`Current underestimates by: ${Math.round(((correctedTokens - currentTokens) / currentTokens) * 100)}%\n`);
    
    // Analyze the impact on savings calculations
    console.log("Impact on Savings Calculations:");
    
    const rawCostEstimate = 2000; // Estimated raw cost
    const actualUsed = 500; // Actual tokens used
    
    // Current calculation (underestimates raw cost)
    const currentRawCost = currentTokens;
    const currentSavings = Math.max(0, currentRawCost - actualUsed);
    const currentSavingsPercent = Math.round((currentSavings / currentRawCost) * 100);
    
    // Corrected calculation
    const correctedRawCost = correctedTokens;
    const correctedSavings = Math.max(0, correctedRawCost - actualUsed);
    const correctedSavingsPercent = Math.round((correctedSavings / correctedRawCost) * 100);
    
    console.log(`Current savings: ${currentSavings} tokens (${currentSavingsPercent}%)`);
    console.log(`Corrected savings: ${correctedSavings} tokens (${correctedSavingsPercent}%)`);
    console.log(`Savings difference: ${correctedSavings - currentSavings} tokens\n`);
    
    // Real-world impact analysis
    console.log("Real-World Impact Analysis:");
    
    // Based on actual session data from mikk_token_stats
    const sessionData = {
        used: 21023,
        rawWouldHaveCost: 143940,
        saved: 122917,
        savingsPercent: 85
    };
    
    // Recalculate with corrected constants
    const estimatedActualFileTokens = sessionData.used / 20; // Rough estimate of file-based tokens
    const correctedRawCost = estimatedActualFileTokens * _AVG_TOKENS_PER_LINE;
    const correctedSavings = Math.max(0, correctedRawCost - sessionData.used);
    const correctedSavingsPercent = Math.round((correctedSavings / correctedRawCost) * 100);
    
    console.log(`Session data analysis:`);
    console.log(`Current reported savings: ${sessionData.saved} tokens (${sessionData.savingsPercent}%)`);
    console.log(`Corrected estimate: ${correctedSavings} tokens (${correctedSavingsPercent}%)`);
    console.log(`Potential overstatement: ${sessionData.saved - correctedSavings} tokens\n`);
    
    // Recommendations
    console.log("=== RECOMMENDATIONS ===\n");
    console.log("1. Fix _ALC constant:");
    console.log("   Current: const _ALC = 42");
    console.log("   Correct: const _AVG_CHARS_PER_LINE = 80");
    console.log("");
    console.log("2. Update _fileTok function:");
    console.log("   Current: return Math.round((ln * _ALC) / _CPT)");
    console.log("   Correct: return Math.round((ln * _AVG_CHARS_PER_LINE) / _CPT)");
    console.log("");
    console.log("3. Consider more accurate token estimation:");
    console.log("   - Use actual file content length when available");
    console.log("   - Account for code density variations");
    console.log("   - Provide confidence intervals for estimates");
    console.log("");
    console.log("4. Add validation:");
    console.log("   - Cross-check with OpenAI tokenizer");
    console.log("   - Test with real code samples");
    console.log("   - Monitor for systematic biases");
}

// Generate the corrected code snippet
function generateCorrectedCode() {
    console.log("\n=== CORRECTED CODE SNIPPET ===\n");
    console.log("// Replace in tools.ts around line 144-155:");
    console.log(`
// CORRECTED CONSTANTS
const _CPT = 4; // Characters per token (accurate)
const _AVG_CHARS_PER_LINE = 80; // Average characters per line (realistic)
const _AVG_TOKENS_PER_LINE = _AVG_CHARS_PER_LINE / _CPT; // ~20 tokens per line

// CORRECTED FUNCTIONS
function _fileTok(lock: TokenLockLike, fp: string): number { 
    const fs2 = Object.values(lock.functions).filter(f => f.file === fp); 
    const ln = fs2.length > 0 ? Math.max(...fs2.map(f => f.endLine)) : 80; 
    return Math.round((ln * _AVG_CHARS_PER_LINE) / _CPT) 
}

function _filesTok(lock: TokenLockLike, fps: string[]): number { 
    return fps.reduce((s, f) => s + _fileTok(lock, f), 0) 
}

// Enhanced version with actual file content when available
function _fileTokEnhanced(lock: TokenLockLike, fp: string, actualContent?: string): number { 
    if (actualContent) {
        // Use actual content length when available
        return Math.max(1, Math.round(actualContent.length / _CPT));
    }
    // Fall back to line-based estimation
    const fs2 = Object.values(lock.functions).filter(f => f.file === fp); 
    const ln = fs2.length > 0 ? Math.max(...fs2.map(f => f.endLine)) : 80; 
    return Math.round((ln * _AVG_CHARS_PER_LINE) / _CPT) 
}
`);
}

// Run analysis
analyzeTokenCountingIssues();
generateCorrectedCode();
