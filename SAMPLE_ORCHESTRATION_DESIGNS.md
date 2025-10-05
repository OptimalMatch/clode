# Sample Orchestration Designs

This document describes the sample orchestration designs that showcase the full capabilities of the Orchestration Designer.

## 🚀 Quick Start

### Running the Seed Script

From the backend directory:
```bash
cd claude-workflow-manager/backend
python seed_orchestration_designs.py
```

This will create 7 comprehensive sample designs in your database.

## 📋 Sample Designs Overview

### 1. **Data Processing Pipeline** 🔄
**Pattern:** Sequential  
**Complexity:** Simple  
**Best For:** Learning the basics

A straightforward sequential workflow demonstrating the classic ETL (Extract, Transform, Load) pattern:
- **Data Extractor** → Pulls data from sources
- **Data Transformer** → Cleans and normalizes
- **Data Analyzer** → Generates insights

**Key Features:**
- Simple linear flow
- Clear task delegation
- Single orchestration block

**Use Cases:**
- ETL pipelines
- Data processing workflows
- Simple automation chains

---

### 2. **Multi-Domain Analysis** ⚡
**Pattern:** Parallel + Sequential  
**Complexity:** Moderate  
**Best For:** Understanding parallel processing

Demonstrates parallel processing with multiple specialists working simultaneously, followed by aggregation:

**Block 1 (Parallel):**
- Security Analyst
- Performance Analyst
- Cost Analyst
- UX Analyst

**Block 2 (Sequential):**
- Report Synthesizer ← Aggregates all parallel results

**Key Features:**
- 4 agents working in parallel
- Block-level connection to aggregator
- Efficient concurrent processing

**Use Cases:**
- Multi-perspective analysis
- Parallel code review
- Concurrent data processing
- Independent task execution

---

### 3. **Automated Code Review System** 👔
**Pattern:** Hierarchical  
**Complexity:** Moderate  
**Best For:** Understanding delegation

Demonstrates hierarchical orchestration with a manager delegating to specialized workers:

**Hierarchy:**
- **Review Manager** (Top)
  - Style Reviewer
  - Logic Reviewer
  - Security Reviewer
  - Performance Reviewer

**Key Features:**
- Manager coordinates all workers
- 2 rounds of review for thoroughness
- Specialized worker agents
- Synthesized feedback

**Use Cases:**
- Code reviews
- Document reviews
- Quality assurance workflows
- Management delegation patterns

---

### 4. **Technical Decision Framework** 💬
**Pattern:** Debate + Sequential  
**Complexity:** Moderate  
**Best For:** Understanding debate patterns

Demonstrates using debate for decision-making with opposing viewpoints:

**Block 1 (Debate):**
- Microservices Advocate ↔️ Monolith Advocate
- 3 rounds of back-and-forth

**Block 2 (Sequential):**
- Technical Lead ← Makes final decision

**Key Features:**
- Adversarial reasoning
- Multiple debate rounds
- Synthesis and decision-making
- Balanced perspective evaluation

**Use Cases:**
- Technical architecture decisions
- Policy discussions
- Pros/cons analysis
- Balanced decision-making

---

### 5. **Customer Support Routing System** 🎯
**Pattern:** Sequential + Router + Multiple Sequential Chains  
**Complexity:** Advanced  
**Best For:** Understanding routing and branching

Demonstrates intelligent routing to different processing chains based on classification:

```
Request Intake
     ↓
Support Router
     ├─→ Technical Support Chain (2 agents)
     ├─→ Billing Support Chain (1 agent)
     └─→ General Support Chain (1 agent)
```

**Key Features:**
- Dynamic routing based on classification
- Multiple downstream branches
- Specialized processing chains
- Conditional flow control

**Use Cases:**
- Support ticket routing
- Request classification systems
- Conditional workflows
- Multi-path processing

---

### 6. **Research Paper Analysis Pipeline** 🔬
**Pattern:** Sequential + Parallel + Hierarchical (with Agent-Level Connections)  
**Complexity:** Advanced  
**Best For:** Understanding agent-level connections

The most advanced example showcasing fine-grained agent-level routing:

**Block 1 (Sequential) - Document Processors:**
- PDF Extractor
- Abstract Analyzer
- Citation Extractor

**Block 2 (Parallel) - Specialized Analyzers:**
- Methodology Analyst
- Results Analyst
- Literature Reviewer

**Block 3 (Hierarchical) - Synthesis Team:**
- Research Synthesizer (Manager)
- Quality Checker (Worker)
- Report Generator (Worker)

**Agent-Level Connections:**
- Abstract Analyzer → Methodology Analyst
- Abstract Analyzer → Results Analyst
- Citation Extractor → Literature Reviewer

**Key Features:**
- **Agent-level connections** for precise routing
- Multiple orchestration patterns combined
- 3-stage processing pipeline
- Specialized roles at each stage

**Use Cases:**
- Complex document processing
- Multi-stage analysis workflows
- Workflows requiring precise data routing
- Research and synthesis tasks

---

### 7. **Full-Stack Development Workflow** 💻
**Pattern:** Debate + Parallel + Hierarchical + Sequential  
**Complexity:** Advanced  
**Best For:** Understanding complete multi-stage workflows

Demonstrates a complete software development lifecycle:

**Stage 1 - Requirements (Debate):**
- Product Manager ↔️ Technical Architect

**Stage 2 - Implementation (Parallel):**
- Frontend Developer
- Backend Developer
- Database Engineer

**Stage 3 - QA & Testing (Hierarchical):**
- QA Lead (Manager)
  - Unit Test Engineer
  - Integration Test Engineer
  - E2E Test Engineer

**Stage 4 - Deployment (Sequential):**
- DevOps Engineer
- Deployment Validator

**Key Features:**
- All major orchestration patterns
- 4 distinct stages
- 11 total agents
- Real-world development cycle

**Use Cases:**
- Software development workflows
- Multi-stage pipelines
- Complex project orchestration
- End-to-end automation

## 🎯 Feature Showcase Matrix

| Design | Sequential | Parallel | Hierarchical | Debate | Router | Agent Connections | Blocks | Agents |
|--------|-----------|----------|--------------|--------|--------|-------------------|--------|--------|
| 1. Data Processing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 1 | 3 |
| 2. Multi-Domain | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | 2 | 5 |
| 3. Code Review | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | 1 | 5 |
| 4. Decision Framework | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | 2 | 3 |
| 5. Support Routing | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | 5 | 6 |
| 6. Research Analysis | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | 3 | 9 |
| 7. Dev Workflow | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | 4 | 11 |

## 🎨 Visual Layout Examples

### Simple Linear (Design 1)
```
[Sequential Block]
  Agent 1 → Agent 2 → Agent 3
```

### Parallel + Aggregation (Design 2)
```
[Parallel Block] ──→ [Sequential Block]
  Agent 1              Aggregator
  Agent 2
  Agent 3
  Agent 4
```

### Routing Tree (Design 5)
```
      [Sequential]
           ↓
       [Router]
      ╱    |    ╲
[Chain A] [Chain B] [Chain C]
```

### Multi-Stage Pipeline (Design 6)
```
[Sequential] ──→ [Parallel] ──→ [Hierarchical]
  3 agents        3 agents        3 agents
    Agent-level connections shown as dashed blue lines
```

## 🧪 Testing the Samples

After loading a design:

1. **Inspect the Canvas**: See how blocks are positioned and connected
2. **Toggle Connection Mode**: Switch between Simple and Advanced to see agent handles
3. **Click on Blocks**: Open the configuration drawer to see agent details
4. **Examine Connections**: Look for blue dashed lines (agent-level) vs gray solid lines (block-level)
5. **Try Modifications**: Add new agents, create new connections, or add additional blocks

## 💡 Learning Path

**Beginner:**
1. Start with **Design 1** (Data Processing Pipeline)
2. Move to **Design 3** (Code Review System)
3. Explore **Design 2** (Multi-Domain Analysis)

**Intermediate:**
4. Study **Design 4** (Decision Framework)
5. Analyze **Design 5** (Support Routing)

**Advanced:**
6. Examine **Design 6** (Research Analysis) - Agent-level connections!
7. Explore **Design 7** (Dev Workflow) - All patterns combined

## 🔧 Customization Ideas

Try modifying these samples:

1. **Add New Agents**: Introduce new specialists to existing blocks
2. **Create New Connections**: Add agent-level connections to existing designs
3. **Extend Chains**: Add new sequential blocks after routers
4. **Combine Designs**: Merge multiple samples into mega-workflows
5. **Add Git Repos**: Assign Git repositories to different blocks

## 📊 Complexity Metrics

| Metric | Design 1 | Design 2 | Design 3 | Design 4 | Design 5 | Design 6 | Design 7 |
|--------|----------|----------|----------|----------|----------|----------|----------|
| Blocks | 1 | 2 | 1 | 2 | 5 | 3 | 4 |
| Agents | 3 | 5 | 5 | 3 | 6 | 9 | 11 |
| Connections | 0 | 1 | 0 | 1 | 4 | 4 | 3 |
| Patterns | 1 | 2 | 1 | 2 | 2 | 3 | 4 |
| Agent Conns | 0 | 0 | 0 | 0 | 0 | 3 | 0 |

## 🎓 Key Takeaways

1. **Sequential**: Best for linear processing where output of one feeds the next
2. **Parallel**: Best for independent tasks that can run concurrently
3. **Hierarchical**: Best when you need manager/worker delegation
4. **Debate**: Best for adversarial reasoning and balanced decisions
5. **Router**: Best for conditional branching and classification
6. **Agent-Level Connections**: Best for precise, fine-grained data routing
7. **Combined Patterns**: Best for complex, real-world workflows

## 🚀 Next Steps

After exploring these samples:

1. Create your own custom orchestration design
2. Export successful patterns as templates
3. Integrate with real Git repositories
4. Execute workflows and analyze results
5. Build production-ready automation systems

Happy orchestrating! 🎉

