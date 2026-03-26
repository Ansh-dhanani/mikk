# Claude AI Testing Protocol for Mikk

## **🎯 Mission Statement**

This document provides **unbiased testing protocols** specifically for Claude AI to evaluate Mikk's architectural intelligence capabilities. Follow these protocols to ensure objective, reproducible results without expectations.

---

## **🔬 Claude-Specific Testing Methodology**

### **Claude Integration Points**
- **MCP Server Connection**: Direct tool access via Model Context Protocol
- **CLI Integration**: Command-line interface testing
- **File System Access**: Direct interaction with project files
- **Context Injection**: Structured information feeding

### **Testing Principles for Claude**
- **Tool-First Approach**: Use Mikk tools before manual analysis
- **Context Verification**: Cross-reference tool output with source files
- **Comparative Analysis**: Compare against manual/GitNexus baselines
- **Quantitative Metrics**: Measure tokens, accuracy, latency objectively
- **Qualitative Assessment**: Evaluate context relevance and completeness

---

## **📋 Claude Test Suite A: MCP Tool Integration**

### **Test A1: MCP Server Connection and Tool Discovery**
**Objective**: Verify Claude can connect and access Mikk tools

**Protocol**:
```bash
# Claude MCP Connection Test
1. Start MCP server: mikk mcp
2. Verify tool availability in Claude interface
3. Test each tool responds correctly

# Data Collection:
□ Tools available: ______/15
□ Response format validity: Yes/No
□ Error handling observed: Yes/No
□ Response time per tool: ______ seconds
□ Connection stability: Yes/No
□ Tool discovery completeness: ______%

# Tools to test:
□ mikk_get_project_overview
□ mikk_get_session_context  
□ mikk_get_changes
□ mikk_query_context
□ mikk_impact_analysis
□ mikk_before_edit
□ mikk_find_usages
□ mikk_list_modules
□ mikk_get_module_detail
□ mikk_get_function_detail
□ mikk_search_functions
□ mikk_semantic_search
□ mikk_get_constraints
□ mikk_get_file
□ mikk_read_file
□ mikk_get_routes
```

### **Test A2: Session Context Initialization**
**Objective**: Test Claude's project understanding capability

**Protocol**:
```claude
# Claude Tool Call:
mikk_get_session_context

# Data Collection:
□ Project stats accuracy: ______%
□ Module organization understood: Yes/No
□ Exported APIs identified: Yes/No
□ Recent changes detected: Yes/No
□ Constraint status awareness: Yes/No
□ Context file integration: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Data format quality (1-5): ______
□ Missing information noted: ______
```

---

## **📋 Claude Test Suite B: Context Query Capabilities**

### **Test B1: Architectural Concept Understanding**
**Objective**: Test Claude's architectural query capability

**Protocol**:
```claude
# Claude Tool Call:
mikk_query_context with parameters:
- question: "How does parseExtractTypescript work and what are its dependencies?"
- maxHops: 4
- tokenBudget: 8000
- provider: "claude"

# Data Collection:
□ Function implementation details provided: Yes/No
□ Call graph relationships identified: Yes/No
□ File paths and line numbers accurate: Yes/No
□ Module dependencies explained: Yes/No
□ Usage context included: Yes/No
□ Architectural significance explained: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Information accuracy: ______%
□ Context relevance (1-5): ______
□ Format structure quality: ______
```

### **Test B2: Impact Analysis Queries**
**Objective**: Test Claude's impact assessment capability

**Protocol**:
```claude
# Claude Tool Call:
mikk_impact_analysis with parameters:
- file: "packages/core/src/graph/graph-builder.ts"

# Data Collection:
□ Blast radius calculated: Yes/No
□ Affected modules identified: Yes/No
□ Functions at risk listed: Yes/No
□ Risk levels assigned: Yes/No
□ Confidence scores provided: Yes/No
□ Action recommendations given: Yes/No
□ Cross-package dependencies analyzed: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Analysis depth (1-5): ______
□ Actionability rating (1-5): ______
```

### **Test B3: Semantic Search Capabilities**
**Objective**: Test Claude's semantic understanding

**Protocol**:
```claude
# Claude Tool Call:
mikk_semantic_search with parameters:
- query: "functions that validate user authentication and handle JWT tokens"
- topK: 10

# Data Collection:
□ Semantic relevance accuracy: ______%
□ Functions identified correctly: ______
□ Concept understanding depth (1-5): ______
□ Cross-module functions found: Yes/No
□ Context preservation quality: Yes/No
□ Ranking relevance (1-5): ______
□ Response time: ______ seconds
□ Token count: ______
□ Search completeness: ______%
□ False positives: ______
□ False negatives: ______
```

---

## **📋 Claude Test Suite C: Before-Edit Analysis**

### **Test C1: Pre-Edit Risk Assessment**
**Objective**: Test Claude's pre-change analysis

**Protocol**:
```claude
# Claude Tool Call:
mikk_before_edit with parameters:
- files: ["packages/core/src/parser/typescript/ts-parser.ts"]

# Data Collection:
□ Functions at risk identified: Yes/No
□ Exported API impact analyzed: Yes/No
□ Blast radius calculated: Yes/No
□ Constraint violations detected: Yes/No
□ Module boundary issues found: Yes/No
□ Dependency chain analysis provided: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Risk assessment accuracy: ______%
□ Mitigation guidance provided: Yes/No
□ Analysis completeness (1-5): ______
```

### **Test C2: Multi-File Edit Planning**
**Objective**: Test Claude's complex change planning

**Protocol**:
```claude
# Claude Tool Call:
mikk_before_edit with parameters:
- files: [
  "packages/core/src/graph/graph-builder.ts",
  "packages/core/src/graph/impact-analyzer.ts"
]

# Data Collection:
□ Cross-file dependencies analyzed: Yes/No
□ Combined impact assessment provided: Yes/No
□ Edit sequence recommended: Yes/No
□ Risk escalation identified: Yes/No
□ Module boundary considerations: Yes/No
□ Testing requirements identified: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Planning quality (1-5): ______
□ Complexity handling rating (1-5): ______
```

---

## **📋 Claude Test Suite D: Function Discovery and Analysis**

### **Test D1: Precise Function Location**
**Objective**: Test Claude's function finding

**Protocol**:
```claude
# Claude Tool Call:
mikk_find_usages with parameters:
- name: "parseExtractTypescript"

# Data Collection:
□ All function occurrences found: Yes/No
□ File paths accurate: Yes/No
□ Line numbers correct: Yes/No
□ Call context provided: Yes/No
□ Module relationships mapped: Yes/No
□ Usage patterns analyzed: Yes/No
□ Export status correct: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Search completeness: ______%
□ Accuracy of locations: ______%
```

### **Test D2: Function Detail Analysis**
**Objective**: Test Claude's detailed function understanding

**Protocol**:
```claude
# Claude Tool Call:
mikk_get_function_detail with parameters:
- name: "parseExtractTypescript"

# Data Collection:
□ Function signature accurate: Yes/No
□ Parameter details provided: Yes/No
□ Return type information: Yes/No
□ Implementation body included: Yes/No
□ Call graph relationships: Yes/No
□ Module context provided: Yes/No
□ Error handling patterns: Yes/No
□ Documentation included: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Detail completeness (1-5): ______
□ Information accuracy: ______%
```

---

## **📋 Claude Test Suite E: Constraint and Contract Analysis**

### **Test E1: Contract Validation**
**Objective**: Test Claude's constraint checking

**Protocol**:
```claude
# Claude Tool Call:
mikk_get_constraints

# Data Collection:
□ All constraints identified: Yes/No
□ Constraint types classified: Yes/No
□ Violations detected: Yes/No
□ Contract completeness assessed: Yes/No
□ Module boundaries enforced: Yes/No
□ Design decisions documented: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Constraint coverage: ______%
□ Violation detail quality (1-5): ______
```

### **Test E2: Boundary Analysis**
**Objective**: Test Claude's module boundary understanding

**Protocol**:
```claude
# Claude Tool Call:
mikk_get_module_detail with parameters:
- moduleId: "core-parser-typescript"

# Data Collection:
□ Module boundaries defined: Yes/No
□ Import/export relationships mapped: Yes/No
□ Architectural layer compliance: Yes/No
□ Interface contracts identified: Yes/No
□ Dependency direction analyzed: Yes/No
□ Encapsulation assessed: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Boundary analysis accuracy: ______%
□ Relationship mapping quality (1-5): ______
```

---

## **📋 Claude Test Suite F: Performance and Scalability**

### **Test F1: Response Time Analysis**
**Objective**: Test Claude's performance characteristics

**Protocol**:
```claude
# Performance Test Suite:
□ Tool response time measurement: ______ seconds
□ Large context handling capability: Yes/No
□ Concurrent tool usage performance: ______ seconds
□ Memory usage observed: ______ MB
□ Error recovery time: ______ seconds
□ Session persistence performance: Yes/No
□ Response time consistency: ______%
□ Performance degradation under load: ______%
□ Resource efficiency rating (1-5): ______
```

### **Test F2: Context Efficiency**
**Objective**: Test Claude's information density

**Protocol**:
```claude
# Efficiency Metrics:
□ Tokens per relevant function: ______
□ Context redundancy percentage: ______%
□ Information completeness vs token count: ______%
□ Query response optimization: Yes/No
□ Context caching effectiveness: Yes/No
□ Tool chaining efficiency: ______ seconds
□ Information density rating (1-5): ______
□ Token utilization optimization: Yes/No
```

---

## **📊 Claude-Specific Evaluation Framework**

### **Claude Integration Score**
**Claude Score = (Tool Integration × 0.3) + (Context Quality × 0.3) + (Accuracy × 0.2) + (Performance × 0.2)**

**Scoring Rubric**:
- **5/5**: Excellent performance
- **4/5**: Good performance
- **3/5**: Fair performance
- **2/5**: Poor performance
- **1/5**: Very poor performance

**Tool Integration Scoring**:
- Record actual number of working tools
- Document tool response formats
- Note any integration issues
- Measure response consistency

**Context Quality Scoring**:
- Assess response structure and formatting
- Evaluate information organization
- Rate context relevance and completeness
- Document any format issues

**Accuracy Scoring**:
- Verify technical information correctness
- Cross-reference with source files
- Document any inaccuracies
- Measure factual correctness percentage

**Performance Scoring**:
- Measure actual response times
- Document performance characteristics
- Note any performance issues
- Assess consistency across requests

---

## **🔍 Claude Bias Prevention Protocol**

### **Testing Bias Controls**
1. **Tool-First Mandate**: Always use Mikk tools before manual analysis
2. **Blind Comparison**: Compare results without system identification
3. **Cross-Validation**: Verify tool output against source files
4. **Quantitative Metrics**: Rely on measurable performance indicators
5. **Multiple Queries**: Test same capability with different phrasing
6. **Context Switching**: Test across different project contexts

### **Claude-Specific Validation**
- **Tool Output Verification**: Cross-check with actual file contents
- **Context Accuracy**: Verify response structure matches reality
- **Relationship Validation**: Check call graphs and dependencies
- **Constraint Compliance**: Verify architectural rule enforcement
- **Performance Consistency**: Ensure reproducible response times

---

## **📝 Claude Test Execution Protocol**

### **Pre-Test Setup**
```bash
# Environment Preparation:
□ [ ] Start MCP server: mikk mcp
□ [ ] Verify Claude connection to MCP
□ [ ] Initialize project: mikk init
□ [ ] Generate lock file: mikk analyze
□ [ ] Install GitNexus for comparison
□ [ ] Prepare test queries and scenarios
□ [ ] Document test environment specifications
□ [ ] Configure data collection tools
```

### **Test Execution Sequence**
```claude
# Claude Testing Workflow:
1. Establish session context
2. Test tool availability and response
3. Execute capability-specific tests
4. Perform comparative analysis
5. Document results and metrics
6. Validate against source files
7. Record observations objectively
```

### **Post-Test Analysis**
```claude
# Result Evaluation:
□ Calculate Claude integration scores
□ Compare against baseline measurements
□ Identify capability characteristics
□ Document performance metrics
□ Validate reproducibility of results
□ Generate objective test report
□ Peer review findings if possible
```

---

## **📋 Claude Data Recording Template**

### **Claude Test Result Template**
```
Test ID: ______
Claude Session ID: ______
Date/Time: ______
Tool/Command Tested: ______

Integration Metrics:
- Tool Response Success: Yes/No
- Response Format Valid: Yes/No
- Error Handling Observed: Yes/No
- Response Time: ______ seconds

Performance Metrics:
- Token Count: ______
- Latency: ______ seconds
- Memory Usage: ______ MB
- Context Quality (1-5): ______

Accuracy Metrics:
- Information Correctness: ______%
- Source File Verification: Yes/No
- Relationship Accuracy: ______%
- Constraint Compliance: Yes/No

Qualitative Assessment:
- Integration Strengths: ______
- Integration Weaknesses: ______
- Unexpected Behaviors: ______
- Error Messages: ______

Environment:
- MCP Server Version: ______
- Claude Model Version: ______
- Network Conditions: ______
- System Load: ______

Evaluator Notes:
______
```

---

## **🚀 Advanced Claude Testing Scenarios**

### **Scenario A: Complex Refactoring Planning**
```claude
# Test Claude's change planning capability:
1. Use mikk_before_edit for multiple files
2. Use mikk_impact_analysis for cross-module effects
3. Use mikk_get_constraints for compliance checking
4. Use mikk_query_context for implementation details
5. Document planning process and outputs
6. Assess plan completeness and accuracy
7. Record all tool interactions and responses
```

### **Scenario B: Architectural Investigation**
```claude
# Test Claude's architectural analysis:
1. Use mikk_get_session_context for project overview
2. Use mikk_list_modules for module discovery
3. Use mikk_get_module_detail for deep analysis
4. Use mikk_semantic_search for concept discovery
5. Document investigation process
6. Assess analysis depth and accuracy
7. Record all findings and insights
```

### **Scenario C: Debugging and Troubleshooting**
```claude
# Test Claude's diagnostic capabilities:
1. Use mikk_find_usages for dependency tracing
2. Use mikk_get_function_detail for implementation analysis
3. Use mikk_query_context for context understanding
4. Use mikk_impact_analysis for change assessment
5. Document diagnostic process
6. Assess troubleshooting effectiveness
7. Record all recommendations and solutions
```

---

**Execute this Claude-specific testing protocol to ensure unbiased evaluation of Mikk's integration with Claude AI. Record actual observations without expectations or predictions.**
