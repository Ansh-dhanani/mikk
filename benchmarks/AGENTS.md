# Mikk AI Agent Testing Protocol

## **🎯 Testing Mission Statement**

This document provides **unbiased testing protocols** for evaluating Mikk's architectural intelligence capabilities. Follow these protocols to ensure objective, reproducible results without expectations.

---

## **🔬 Testing Methodology**

### **Core Principles**
- **No expectations**: Test actual capabilities, not predicted outcomes
- **Reproducible**: Same inputs → same outputs every time
- **Comparative**: Test all systems under identical conditions
- **Quantitative**: Measure tokens, latency, accuracy objectively
- **Qualitative**: Evaluate context richness and relevance without bias

### **Evaluation Criteria**
- **Accuracy**: % of correct/relevant information returned
- **Completeness**: % of required information provided
- **Context Richness**: Tokens × relevance score
- **Latency**: Response time in seconds
- **Capability Coverage**: % of requested features available

---

## **📋 Test Suite A: Context Query Capabilities**

### **Test A1: Architectural Concept Understanding**
**Objective**: Test deep architectural knowledge retrieval

**Protocol**:
```bash
# Test Query
"parseExtractTypescript function implementation and dependencies"

# Data Collection for Each System:
□ Token count returned: ______
□ Response latency: ______ seconds
□ Function existence verification: Yes/No
□ Details factual correctness: ______%
□ Callers listed: ______
□ Callees listed: ______
□ Architectural relationships explained: Yes/No
□ Context relevance rating (1-5): ______
□ Missing information noted: Yes/No
□ Error messages: ______
```

### **Test A2: Cross-Module Impact Analysis**
**Objective**: Test architectural impact prediction

**Protocol**:
```bash
# Test Query
"impact of changing packages/core/src/graph/graph-builder.ts"

# Data Collection for Each System:
□ Blast radius provided: Yes/No
□ Affected modules identified: ______
□ Function-level impact details: Yes/No
□ Cross-package dependencies found: ______
□ Risk level assignment: Yes/No
□ Effort estimation provided: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Error handling: ______
```

---

## **📋 Test Suite B: Dead Code Detection**

### **Test B1: Comprehensive Dead Code Analysis**
**Objective**: Test unused code identification

**Protocol**:
```bash
# Test Command
mikk dead-code

# Data Collection for Each System:
□ Dead functions identified: ______
□ False positives (marked dead but used): ______
□ False negatives (dead but not detected): ______
□ Cross-package dead code found: Yes/No
□ Exported vs internal distinction: Yes/No
□ Confidence scoring provided: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Package-level breakdown: ______
```

### **Test B2: Dead Code Classification**
**Objective**: Test dead code categorization

**Protocol**:
```bash
# Data Collection for Each System:
□ Dead functions vs unused imports classification: Yes/No
□ Risk level assignment (critical/medium/low): Yes/No
□ Impact assessment of removal: Yes/No
□ Dependency chain analysis: Yes/No
□ Module-level summaries: Yes/No
□ Action recommendations provided: Yes/No
□ Classification accuracy: ______%
```

---

## **📋 Test Suite C: Constraint Validation**

### **Test C1: Architectural Rule Enforcement**
**Objective**: Test contract validation

**Protocol**:
```bash
# Test Command
mikk contract validate

# Data Collection for Each System:
□ Constraint violations detected: ______
□ False positive rate: ______%
□ Architectural boundary violations: ______
□ Module dependency rule violations: ______
□ Import/export constraint violations: ______
□ Lock file drift detected: Yes/No
□ Violation details provided: Yes/No
□ Fix suggestions offered: Yes/No
□ Response time: ______ seconds
□ Token count: ______
```

### **Test C2: Constraint Definition Testing**
**Objective**: Test architectural constraint language

**Protocol**:
```bash
# Test Each Constraint Type:
□ no-import: "module:A cannot import module:B" - Result: ______
□ must-use: "module:A must import module:C" - Result: ______
□ no-call: "module:A cannot call functions in module:D" - Result: ______
□ layer: "module:E is layer 2, cannot import layer 3" - Result: ______
□ naming: "module:F exports must match regex ^[a-z]" - Result: ______
□ max-files: "module:G cannot exceed 50 files" - Result: ______

# For each constraint type record:
□ Enforced correctly: Yes/No
□ Violation detected when appropriate: Yes/No
□ Error message clarity (1-5): ______
□ Performance impact: ______ seconds
```

---

## **📋 Test Suite D: Session Context Generation**

### **Test D1: Project Overview Intelligence**
**Objective**: Test holistic project understanding

**Protocol**:
```bash
# Test Command
mikk context session

# Data Collection for Each System:
□ Module count accuracy: ______
□ Function distribution analysis: Yes/No
□ Exported API surface identified: Yes/No
□ Tech stack detected: Yes/No
□ Architecture patterns identified: Yes/No
□ Development hotspots found: Yes/No
□ Response time: ______ seconds
□ Token count: ______
□ Overview completeness rating (1-5): ______
```

### **Test D2: Context File Integration**
**Objective**: Test external schema understanding

**Protocol**:
```bash
# Data Collection for Each System:
□ TypeScript interfaces detected: ______
□ Configuration files parsed: Yes/No
□ Schema files understood: Yes/No
□ API routes identified: ______
□ Environment configurations analyzed: Yes/No
□ Build system configurations parsed: Yes/No
□ Integration depth rating (1-5): ______
```

---

## **📋 Test Suite E: Function Search and Discovery**

### **Test E1: Precise Function Location**
**Objective**: Test function search accuracy

**Protocol**:
```bash
# Test Queries:
□ "find function that validates JWT tokens"
□ "locate function that handles user authentication"
□ "search for TypeScript parser implementation"
□ "find dead code detection algorithm"

# For each query record:
□ Search result relevance (1-5): ______
□ Function location accuracy: Yes/No
□ Parameter information provided: Yes/No
□ Return type information provided: Yes/No
□ Usage context included: Yes/No
□ Module context provided: Yes/No
□ Implementation details available: Yes/No
□ Response time: ______ seconds
□ Token count: ______
```

### **Test E2: Semantic Function Discovery**
**Objective**: Test natural language function finding

**Protocol**:
```bash
# Test Semantic Queries:
□ "functions that handle file I/O operations"
□ "error handling and validation functions"
□ "database connection and query functions"
□ "HTTP request processing functions"

# For each query record:
□ Semantic relevance accuracy: ______%
□ Concept understanding depth (1-5): ______
□ Cross-language functions found: Yes/No
□ Intent-to-function mapping accuracy: ______%
□ Context preservation quality (1-5): ______
□ Results ranked appropriately: Yes/No
□ Response time: ______ seconds
□ Token count: ______
```

---

## **📋 Test Suite F: Performance and Scalability**

### **Test F1: Latency Benchmarking**
**Objective**: Test response time characteristics

**Protocol**:
```bash
# Test Conditions:
□ Cold start performance: ______ seconds
□ Warm start performance: ______ seconds
□ Large codebase performance: ______ seconds
□ Small codebase performance: ______ seconds
□ Complex query performance: ______ seconds
□ Simple query performance: ______ seconds
□ Concurrent request handling: Yes/No
□ Memory usage under load: ______ MB
□ CPU utilization: ______%
□ Response time consistency: ______%
□ P95 latency: ______ seconds
□ P99 latency: ______ seconds
```

### **Test F2: Token Efficiency Analysis**
**Objective**: Test information density

**Protocol**:
```bash
# Efficiency Metrics:
□ Tokens per relevant function: ______
□ Context relevance per token ratio: ______%
□ Redundant information percentage: ______%
□ Information completeness vs token count: ______%
□ Compression efficiency: ______%
□ Token utilization optimization: Yes/No
□ Information density rating (1-5): ______
```

---

## **📊 Scoring Framework**

### **Composite Score Calculation**

**Overall Score = (Accuracy × 0.4) + (Completeness × 0.3) + (Context × 0.2) + (Performance × 0.1)**

**Scoring Rubric**:
- **5/5**: Excellent performance
- **4/5**: Good performance
- **3/5**: Fair performance
- **2/5**: Poor performance
- **1/5**: Very poor performance

**Accuracy Scoring**:
- Measure actual % of correct/relevant information
- Document methodology for accuracy assessment
- Record any ambiguity in correctness determination

**Completeness Scoring**:
- Measure % of required information provided
- Define completeness criteria for each test
- Document any missing critical information

**Context Richness Scoring**:
- Record actual token counts
- Rate relevance of context provided
- Document any irrelevant or redundant information

**Performance Scoring**:
- Measure actual response times
- Document test environment specifications
- Record any performance anomalies

---

## **🔍 Bias Prevention Protocol**

### **Testing Bias Controls**
1. **Blind Testing**: Test systems without identification labels
2. **Randomized Order**: Vary test sequence to prevent order bias
3. **Multiple Evaluators**: Have multiple people score results independently
4. **Standardized Queries**: Use identical queries for all systems
5. **Objective Metrics**: Rely on quantifiable measurements only
6. **Documentation**: Record all test conditions and observations

### **Validation Requirements**
- **Reproducibility**: Same test must produce same results
- **Transparency**: Document all test procedures and data
- **Peer Review**: Have results validated by independent testers
- **Statistical Significance**: Run sufficient trials for validity

---

## **📝 Test Execution Checklist**

### **Pre-Test Setup**
□ [ ] Mikk project initialized with `mikk init`
□ [ ] Lock file generated and current
□ [ ] GitNexus installed and repository indexed
□ [ ] Manual search tools available (grep, find)
□ [ ] Test environment isolated and documented
□ [ ] Benchmark recording tools configured
□ [ ] Test queries prepared and documented
□ [ ] Evaluation criteria defined and agreed

### **During Testing**
□ [ ] Execute tests in randomized order
□ [ ] Record all metrics immediately
□ [ ] Document any anomalies or errors
□ [ ] Save raw output for later analysis
□ [ ] Verify reproducibility with repeated runs
□ [ ] Note any system limitations or constraints
□ [ ] Maintain blind testing conditions
□ [ ] Document environmental factors

### **Post-Test Analysis**
□ [ ] Calculate scores using defined framework
□ [ ] Generate comparative analysis
□ [ ] Identify any outliers and investigate
□ [ ] Document all findings objectively
□ [ ] Validate results against recorded data
□ [ ] Prepare comprehensive test report
□ [ ] Peer review results if possible

---

## **📋 Data Recording Template**

### **Test Result Template**
```
Test ID: ______
System Tested: ______
Date/Time: ______
Query/Command: ______

Metrics:
- Token Count: ______
- Latency: ______ seconds
- Accuracy: ______%
- Completeness: ______%
- Context Relevance: ______/5

Qualitative Assessment:
- Strengths Observed: ______
- Weaknesses Observed: ______
- Unexpected Behaviors: ______
- Error Messages: ______

Environment:
- System Specifications: ______
- Network Conditions: ______
- Concurrent Load: ______
- Other Factors: ______

Evaluator Notes:
______
```

---

**Execute this testing protocol strictly to ensure unbiased evaluation of architectural intelligence capabilities. Record actual results without expectations or predictions.**
