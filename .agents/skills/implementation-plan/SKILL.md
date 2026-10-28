---
name: implementation-planner
description: Create a detailed, actionable implementation plan from user requests, conversation context, or specification files. Use when planning feature development, bug fixes, or refactoring before writing code.
---

# Implementation Planner

## Objective

Produce an implementation plan that another coding agent can execute with minimal ambiguity, with minimal additional design decisions.

Plan only. Do not modify application code.

## Inputs

Requirements may originate from:
- The current request and conversation history.
- Referenced specifications, requirements, or design documents.
- Existing repository code, tests, and documentation.
- Ad-hoc descriptions of desired functionality or changes.

Use all relevant sources. Treat explicit user requirements as authoritative. Do not invent requirements.

## Workflow

### 1. Understand

- Identify the objective, expected behavior, scope, and constraints.
- Extract functional and non-functional requirements.
- Identify acceptance criteria and existing behavior that must be preserved.
- Resolve ambiguity using available context.
- Ask only when a critical ambiguity prevents safe planning; otherwise document assumptions.

### 2. Investigate

- Inspect relevant repository files, architecture, dependencies, and conventions (ex: `GLOSSARY.md`).
- Trace affected execution paths, interfaces, and data flows.
- Identify reusable implementations and existing tests.
- Verify referenced symbols and files exist before including them.
- Avoid unrelated repository exploration.

### 3. Research

- Confirm with industry best practices and official documentations for potential approaches in the design.

### 4. Design

- Propose the simplest maintainable solution consistent with existing architecture.
- Identify required changes to components, APIs, data models, configuration, and tests.
- Address compatibility, security, performance, and failure handling where relevant.
- Consider alternatives only when meaningful trade-offs exist.
- Visualize the plan using standard UML diagrams like flowcharts, sequence diagrams, and C4 model whenever requirement is high in complexity. 

### 5. Decompose

Break the solution into ordered, and independently verifiable implementation tasks.

Each task must specify:
- **Goal:** Intended outcome.
- **Location:** Relevant files, modules, or components.
- **Changes:** Concrete implementation instructions.
- **Verification:** How to confirm completion. This could be test cases for manual execution or automated tests. Only create tests for critical paths or core functionality.

Capture dependencies between tasks. Keep each task sufficiently detailed for direct execution without prescribing unnecessary code-level details.

### 6. Validate

Before finalizing, verify that:
- Every requirement maps to an implementation task or explicit constraint.
- The proposed changes are consistent with the inspected codebase.
- Dependencies and execution order are clear.
- Edge cases, regression risks, and tests are covered.
- Assumptions and unresolved decisions are visible.
- No unnecessary changes or speculative features are included.

## Output

Create `implementation-plan.md` using the structure below. Keep it simple and consice.

# Implementation Plan: [Title]

## 1. Overview
- **Objective:** What must be accomplished.
- **Scope:** Included and excluded changes.
- **Constraints:** Technical and behavioral restrictions.

## 2. Current State
Summarize relevant existing behavior, architecture, and implementation locations.

Omit when no existing codebase is available.

## 3. Proposed Solution
Describe the technical approach, key design decisions, and affected components.

Include diagrams only when they substantially improve clarity.

## 4. Implementation Tasks

### Task 1: [Descriptive title]
- **Goal:**
- **Location:**
- **Changes:**
- **Verification:**

Repeat in execution order. Specify dependencies where necessary.

## 5. Testing and Validation
Define required critical path/core tests, regression coverage, edge cases, and final verification commands when known.

## 6. Acceptance Criteria
List observable, testable conditions that establish completion.

## 7. Assumptions and Open Questions
Document assumptions and unresolved decisions that could affect implementation.

Omit if none.

## Rules

- Be specific, concise, and executable.
- Ground technical claims in inspected code or supplied requirements.
- Never fabricate file paths, interfaces, dependencies, or existing behavior.
- Clearly distinguish verified facts, proposed changes, and assumptions.
- Do not implement changes or write production code.
- Avoid duplicating requirements across sections.
- Do not introduce speculative scope or overengineer the solution. Simplicity is king.
- The final plan must be independently understandable by an implementing agent.