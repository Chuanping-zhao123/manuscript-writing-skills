---
name: reference-revision-isolated
description: >
  Isolated-session variant of the reference-revision pipeline. Runs 5 agents
  (EXTRACTOR → FINDER → VERIFIER → BUILDER → AUDITOR) as independent API calls
  inside a React artifact — each agent gets a fresh context window with zero bleed
  between stages. FINDER and VERIFIER use web search for real paper discovery and
  DOI verification. AUDITOR loops back to BUILDER automatically (max 3 rounds).
  Use this skill whenever the user says "isolated reference revision",
  "reference revision isolated", "reference revision separate agents",
  "isolated citations", "run isolated reference pipeline", or any variant that
  combines reference/citation work with "isolated" or "separate agents" or
  "independent sessions". Also trigger when the user explicitly asks for the
  reference-revision pipeline to run with fresh/independent/separate sessions
  per agent. This skill is preferred over the standard reference-revision skill
  when the user wants maximum agent isolation and context independence.
---

# Reference Revision — Isolated Agent Sessions

This skill runs the 5-agent reference-revision pipeline where **each agent executes in its own fresh API session** via a React artifact. This eliminates context bleed between agents and gives each agent its full context window.

## When to Use This vs. Standard `reference-revision`

| Feature | `reference-revision` (standard) | `reference-revision-isolated` (this skill) |
|---|---|---|
| Agent isolation | Shared session | Independent API calls per agent |
| Context bleed | Possible — later agents see earlier work | Zero — each agent sees only what's passed to it |
| Effective context | Shared, shrinks as pipeline progresses | Full window per agent |
| Web search | Uses Claude's built-in tools | Each agent calls web_search independently |
| Model | Uses current session model (Opus/Sonnet) | Sonnet 4 (artifact API constraint) |
| Speed | Faster (no API overhead) | Slower (~2–5 min total, sequential API calls) |
| Best for | Quick runs, shorter texts | Long introductions, high-precision citation work |

## How to Execute

### Step 1: Deploy the pipeline artifact

Read the artifact source code from the bundled asset:

```
/path/to/this/skill/assets/pipeline.jsx
```

Create the artifact at `/mnt/user-data/outputs/reference-revision-pipeline.jsx` by copying the contents of `assets/pipeline.jsx` verbatim. Do NOT modify the artifact code. Present the file to the user so it renders as an interactive React component.

### Step 2: Instruct the user

Tell the user:
1. Paste their manuscript section into the text area
2. Click "Run Pipeline" to start
3. The 5 agents will run sequentially — each as an independent API call
4. They can expand each agent's card to inspect intermediate outputs
5. The AUDITOR will loop back to BUILDER if it finds issues (max 3 rounds)
6. When complete, the final BUILDER output and AUDITOR QC report are displayed

### Step 3: Post-pipeline processing (after user reports completion)

Once the user confirms the pipeline has finished and shares the BUILDER output (either by copying from the artifact or pasting it), generate a `.docx` deliverable using the `docx` skill. The document should contain:

1. **Revised text** with inline bracket citations
2. **Reference list** with DOIs
3. **Wording-change log** (original → revised → reason)
4. **Citation-audit table** (sentence, claim, ref numbers, justification, evidence type)
5. **AUDITOR QC Confirmation** (all 8 checks)

Read `/mnt/skills/public/docx/SKILL.md` for Word document creation best practices.

### Step 4: Present the deliverable

Save the `.docx` to `/mnt/user-data/outputs/` and present it to the user via `present_files`.

## Pipeline Architecture (for reference)

```
User's Manuscript Section
       |
   [EXTRACTOR]  — Decompose text into atomic, citable claims (CLAIM REGISTER)
       |              Session 1: receives only raw manuscript text
       |
   [FINDER]     — Search for candidate references per claim (web_search enabled)
       |              Session 2: receives only the Claim Register
       |
   [VERIFIER]   — DOI resolution + claim-match + accuracy gates (web_search enabled)
       |              Session 3: receives Claim Register + candidate refs
       |
   [BUILDER]    — Insert citations, compile ref list, wording log, audit table
       |              Session 4: receives manuscript + Claim Register + verified refs
       |
   [AUDITOR]    — 8 structural checks; loops to BUILDER if any fail (max 3 rounds)
       |              Session 5: receives BUILDER output + Claim Register
       |
   Deliver: .docx via docx skill
```

### Agent System Prompts

The system prompts for each agent are embedded in the React artifact (`assets/pipeline.jsx`). They implement the full reference-revision protocol:

- **EXTRACTOR**: Sentence numbering, atomic claim decomposition, claim classification, no_cite_needed flagging
- **FINDER**: Claim-by-claim search (not topic-by-topic), DOI collection, primary vs. review classification, 40-50 ref target
- **VERIFIER**: Gate 1 (DOI resolution), Gate 2 (claim-content match), Gate 3 (per-ref accuracy / anti-overgeneralization)
- **BUILDER**: Number-from-inline assignment, citation placement rules, flagged claim handling, sub-claim coverage, extract-then-build ref list, wording-change log, citation-audit table
- **AUDITOR**: 8 checks (orphan refs, phantom citations, DOI correctness, citation placement, unsupported claims, sub-claim coverage, per-ref accuracy, audit table completeness)

## Customization

To modify agent behavior, edit the `SYSTEM_PROMPTS` object in `assets/pipeline.jsx`. Each agent's prompt is self-contained and can be updated independently without affecting other agents.

To add a new agent, add an entry to both `AGENTS` array and `SYSTEM_PROMPTS` object, then update the `runPipeline` function to include the new step in the correct sequence position.
