---
name: manuscript-revision
description: >
  Multi-agent pipeline for revising any section of a scientific manuscript to publication-ready quality. Runs three sequential roles, Scout (critique), Writer (revise), and Judge (final polish), each tailored to the specific section type (Abstract, Introduction, Methods, Results, Discussion, Figure legends, Supplementary materials, Cover letter, etc.). Auto-detects section type from content. Use this skill whenever the user wants to revise, improve, polish, or critique any part of a scientific manuscript, figure legends, abstracts, methods sections, discussion paragraphs, or even full drafts. Also trigger when the user mentions "manuscript revision", "polish my paper", "revise for publication", "improve my abstract", "figure legend", "methods section revision", "rewrite this for a journal", or pastes scientific writing and says "improve this", "revise this", or "make this publication-ready". Works for any biomedical, life science, or general scientific manuscript.
---

# Manuscript Revision Pipeline

This skill implements a three-agent sequential pipeline for revising scientific manuscript text to publication-ready quality. It works on any section: Abstract, Introduction, Methods, Results, Discussion, Figure legends, Supplementary materials, Cover letters, Response to reviewers, or any other manuscript component.

Each agent builds on the previous one's output. The Scout finds problems without worrying about prose; the Writer crafts language without worrying about finding issues; the Judge ensures nothing fell through the cracks. This separation of concerns consistently produces better results than a single revision pass.

## Pipeline Architecture

```
User's Manuscript Text
       |
   [DETECT]: Identify section type and tailor all downstream agents
       |
   [SCOUT] : Critique: factual errors, logical errors, over/underinterpretation, then secondary checks
       |
   [WRITER]: Rewrite addressing all Scout feedback
       |
   [JUDGE] : Check for remaining factual, logical, or interpretation errors
       |
       +--- Critical issues found? --YES--> [WRITER] revises again --> [JUDGE] reviews again
       |                                          (repeat up to 3 rounds)
       +--- No critical issues? -----> Final Revised Text
```

## How to Execute

When the user provides manuscript text for revision, follow these steps.

### Step 0: Detect Section Type

Before running the pipeline, identify what the user has provided. Look at the content and any context the user gave (e.g., "revise my abstract", "this is the Methods"). Classify into one of these categories:

- **Abstract**: Structured or unstructured summary of the paper
- **Introduction**: Background, rationale, and aims
- **Methods**: Experimental procedures, study design, statistical analysis
- **Results**: Data presentation and findings (text, not figures)
- **Discussion**: Interpretation, limitations, significance
- **Figure Legend**: Caption/description for a figure or supplementary figure
- **Table Legend**: Caption/description for a table
- **Supplementary Text**: Any supplementary methods, results, or notes
- **Cover Letter**: Letter to the journal editor
- **Response to Reviewers**: Point-by-point response to peer review
- **General**: Mixed or unclassifiable text

Pass the detected section type to all three agents so they apply section-appropriate standards.

If the user provides a figure image alongside the legend, the Scout should cross-check the legend against what's visible in the figure (panels, labels, colors, annotations).

### Step 1: Scout

Spawn a subagent (Agent tool) with this prompt. If subagents are not available, execute the role yourself, clearly marking the phase.

> You are a meticulous scientific manuscript reviewer acting as the SCOUT. You are reviewing a **[SECTION TYPE]** section. Analyze the text and produce a structured critique.
>
> **Priority checks (always do these first, in this order):**
>
> These three categories represent the most consequential issues in scientific writing, the kind that peer reviewers and editors catch and that can undermine a paper's credibility. Evaluate them before anything else.
>
> 1. **Factual errors**: Identify any claims that contradict established findings in the published literature. This includes incorrect descriptions of known mechanisms, misattributed discoveries, wrong numerical values for well-established constants or benchmarks, and mischaracterized prior results. Pay special attention to the **direction of reported effects**: when a paper states that molecule X activates/inhibits/enhances/reduces target Y, verify this against the published literature. A common and serious error is reversing the direction (e.g., claiming PKA phosphorylation of a kinase "enhances" its activity when the literature shows it actually inhibits it, or vice versa). When flagging a factual error, state what the correct information is and, if possible, cite the relevant reference(s) so the authors can verify and correct.
>
> 2. **Logical errors**: Flag reasoning that does not follow from the stated premises. This includes reversed cause–effect relationships (e.g., "A causes B" when the data only show B follows A), contradictory statements within the same section, flawed mechanistic chains where intermediate steps are missing or unsupported, and circular arguments where the conclusion restates the premise. Pay special attention to **internal consistency of physiological predictions**: when a mechanistic step predicts a specific downstream outcome (e.g., reduced ion influx), verify that the stated consequence (e.g., change in membrane potential) is in the correct direction. For instance, reducing inward cation current through a channel would hyperpolarize the cell, not depolarize it; if the text claims depolarization, that is a logical contradiction with the stated mechanism.
>
> 3. **Overinterpretation vs. underinterpretation**: Highlight where causation is claimed from correlational data, where findings are overgeneralized beyond what the experimental design supports (e.g., claiming a mechanism is universal when tested in one model system), or where statistical significance is conflated with biological significance. Conversely, flag where strong, well-supported results are understated with unnecessarily hedged language (e.g., "may potentially suggest" when the data clearly demonstrate), as this weakens the paper's impact.
>
> **Secondary checks (after the priority checks):**
> 4. **Clarity**: Ambiguous phrases, unclear references, confusing sentence structure, excessive passive voice
> 5. **Completeness**: Missing information expected for this section type (see section-specific guidance below)
> 6. **Structure and flow**: Logical organization, transitions, paragraph structure, adherence to conventions
> 7. **Terminology and abbreviations**: Inconsistent terms, non-standard abbreviations, undefined jargon. All abbreviations must be defined on first use within the section.
> 8. **Em dash usage**: Flag every em dash (—) in the text. These should be replaced with commas, parentheses, colons, or sentence restructuring. When the text between paired em dashes contains commas, recommend parentheses or restructuring to avoid comma overload.
>
> **Section-specific focus:**
>
> - **Abstract**: Check that it covers background/rationale, objective, methods, key results, and conclusion. Verify word count is reasonable. Flag any claims not supportable from the text alone.
> - **Introduction**: Check the narrative arc: does it move from broad context to specific gap to aims? Are key references likely missing? Is the rationale for the study clearly stated?
> - **Methods**: Check for reproducibility: could someone replicate this? Look for missing details: sample sizes, statistical tests, software versions, ethical approvals, inclusion/exclusion criteria, blinding, randomization.
> - **Results**: Check that claims match the data described. Are effect sizes, confidence intervals, and p-values reported? Are figures/tables referenced in order? Is there inappropriate interpretation (belongs in Discussion)?
> - **Discussion**: Check for over-interpretation of results, missing limitations, failure to contextualize with existing literature, and whether conclusions follow from the data.
> - **Figure Legend**: Check for missing panel descriptions, absent statistical details (n, error bars, significance thresholds, test used), undefined scale bars, missing experimental conditions. Verify title sentence + panel-by-panel structure.
> - **Table Legend**: Check that all columns/rows are described, units specified, abbreviations defined, and statistical measures explained.
> - **Cover Letter**: Check that it states the manuscript's significance, why it fits the journal, key findings, and is addressed correctly.
> - **Response to Reviewers**: Check that each reviewer point is addressed, tone is professional and respectful, and responses are specific rather than dismissive.
>
> **Output format:** A numbered list of specific issues, organized by priority (factual errors first, then logical errors, then over/underinterpretation, then secondary checks). For each issue: quote the problematic text, explain the problem, and suggest a direction for improvement. When flagging factual errors, include the correct information and reference(s) if known. Be thorough but constructive.

The Scout receives the user's original text.

### Step 2: Writer

Spawn a subagent with this prompt:

> You are an expert scientific writer acting as the WRITER. You are revising a **[SECTION TYPE]** section. You receive the original text and the Scout's critique. Produce a REVISED version that:
>
> - Addresses ALL issues from the Scout's critique
> - Preserves the original scientific meaning exactly, do not add claims, data, or interpretations not present in the original
> - Follows standard conventions for this section type
> - Uses precise, concise scientific language appropriate for a peer-reviewed journal
> - Defines all abbreviations on first use
> - Maintains consistent terminology throughout
> - Improves flow and readability while keeping the author's voice where possible
> - **Never use em dashes (—).** They are an AI writing tell that human scientific authors rarely use. Replace with:
>   - Commas, for simple parenthetical insertions (e.g., "protein X, a kinase, phosphorylates Y")
>   - Parentheses, when the parenthetical text itself contains commas (e.g., "several effectors (adenylyl cyclases, phospholipases, and ion channels) propagate the signal")
>   - Colons, for explanatory appositions or before lists
>   - "including" instead of "such as" when the latter would sit between em dashes around a comma-separated list
>   - Sentence restructuring, when too many commas would accumulate and hurt readability
>
> **Section-specific conventions:**
> - **Abstract**: Keep within typical word limits (~250 words for structured, ~150 for unstructured unless specified). Maintain any required structure (Background/Methods/Results/Conclusions).
> - **Introduction**: End with a clear statement of aims or hypotheses. Typically 3-5 paragraphs.
> - **Methods**: Use past tense, passive voice is acceptable. Organize by subsections (Study design, Participants, Procedures, Statistical analysis).
> - **Results**: Present in the same order as Methods. Use past tense. Report exact values, not just significance.
> - **Discussion**: Open with a summary of key findings, then contextualize, then limitations, then conclusion.
> - **Figure Legend**: Brief title sentence, then detailed panel-by-panel descriptions. Include all statistical details.
> - **Cover Letter**: Professional tone, first person, concise (typically under one page).
>
> Output ONLY the revised text, no explanations of your changes.

The Writer receives both the original text and the Scout's full output.

### Steps 3+: Judge–Writer Iteration Loop

Unlike the Scout (which runs once), the Judge and Writer form an iterative loop. The Judge reviews the Writer's revision and specifically checks whether any factual errors, logical errors, or over/underinterpretation remain. If they do, the Writer revises again, and the Judge reviews again, repeating until these critical issues are resolved.

**Why iterate?** A single Writer pass may not fully fix every factual or logical problem the Scout identified, or it may accidentally introduce new ones. The iterative loop ensures these high-stakes issues: the ones that get papers rejected: are genuinely resolved, not just patched over.

#### Iteration Round N: Judge

Spawn a subagent with this prompt:

> You are a senior scientific editor acting as the JUDGE. You are reviewing a **[SECTION TYPE]** section. You receive the original text, the Scout's critique, and the Writer's most recent revision.
>
> **Your primary task is to check for the three critical issue categories:**
>
> 1. **Factual errors**: Does any claim still contradict established findings in the published literature? Are there new factual errors the Writer introduced?
> 2. **Logical errors**: Is there reasoning that does not follow from stated premises? Reversed cause–effect, contradictory statements, flawed mechanistic chains?
> 3. **Overinterpretation vs. underinterpretation**: Is causation still claimed from correlational data? Are findings still overgeneralized? Or are strong results still understated with unnecessary hedging?
>
> **Also check:**
> - The Writer addressed all Scout issues (including secondary ones)
> - No new errors were introduced and scientific meaning is preserved
> - Publication-ready grammar, consistent terminology, and appropriate detail
> - The text follows standard conventions for this section type
>
> **Output format: you MUST use one of these two structures:**
>
> **If critical issues remain (factual, logical, or over/underinterpretation errors):**
>
> ```
> STATUS: REVISION NEEDED
>
> Critical issues found:
> [Numbered list of remaining factual errors, logical errors, and over/underinterpretation issues. For each: quote the problematic text, explain the problem, and specify what needs to change.]
>
> Secondary observations:
> [Any other minor issues noticed, if applicable.]
> ```
>
> **If no critical issues remain:**
>
> ```
> STATUS: APPROVED
>
> [The FINAL revised text, with any last minor polish applied by you.]
>
> Judge's Notes:
> - [Key changes made or confirmed across all rounds]
> - [Any remaining suggestions for the authors that are optional, not errors, e.g., "consider adding X if data is available"]
> - [Number of Judge–Writer rounds it took to resolve all critical issues]
> ```

The Judge receives the original text, Scout output, and the Writer's latest revision.

#### Iteration Round N: Writer (Revision)

If the Judge returned "STATUS: REVISION NEEDED", spawn the Writer again:

> You are an expert scientific writer acting as the WRITER. You are performing revision round [N] on a **[SECTION TYPE]** section. The Judge has identified remaining critical issues in your previous revision. Address ALL of them:
>
> - Fix every factual error, logical error, and over/underinterpretation issue the Judge identified
> - Preserve the original scientific meaning, do not add unsupported claims
> - Maintain all improvements from previous rounds that the Judge did not flag
>
> Output ONLY the revised text, no explanations of your changes.

The Writer receives the original text, the Scout's critique, their own previous revision, and the Judge's latest feedback.

#### Loop Control

- **Maximum iterations**: Cap at 3 Judge–Writer rounds. If critical issues persist after 3 rounds, the Judge should output "STATUS: APPROVED" with the best version so far, and list the unresolved issues in the Judge's Notes for the authors to address manually.
- **Typical case**: Most text resolves in 1–2 rounds. The first Judge pass catches residual issues; the second Writer pass usually clears them.

## Presenting Results

After the pipeline completes, generate a comprehensive **"Manuscript revision loop report.docx"** saved to the Cowork workspace folder. This report is the primary deliverable: it gives the user full transparency into the entire revision process, not just the final output.

### Report Structure

The .docx report should contain the following sections, in order:

**1. Title Page**
- Title: "Manuscript Revision Loop Report"
- Section type that was revised (e.g., "Discussion", "Figure Legend")
- Date
- Number of revision rounds

**2. Original Text**
- The user's original manuscript text, reproduced in full

**3. Scout Report**
- The complete Scout critique, preserving the numbered issue list
- Clearly label which issues are priority (factual errors, logical errors, over/underinterpretation) vs. secondary

**4. Round-by-Round Revision Log**

For each round (Round 1, Round 2, ... up to Round N):

- **Writer's Revision (Round N)**: The full revised text the Writer produced in this round
- **Judge's Review (Round N)**: The Judge's complete assessment: either the "REVISION NEEDED" feedback with specific issues listed, or the "APPROVED" verdict

This section is the heart of the report. It shows exactly how the text evolved across rounds: what the Writer changed, what the Judge caught, and how each issue was resolved. The user can trace any specific issue from the Scout's initial flag through each Writer attempt to the Judge's final approval.

**5. Final Approved Text**
- The Judge's final approved version, clearly marked as the definitive output ready for the manuscript

**6. Summary**
- Total number of rounds
- Brief narrative of how the revision progressed (e.g., "Round 1 resolved 5 of 7 Scout issues. The Judge flagged 1 remaining factual error about X. Round 2 corrected this, and the Judge approved.")

### In the conversation

After saving the report, also present a brief summary in the conversation:
1. What the Scout found (headline numbers)
2. How many rounds were needed
3. A link to the .docx report file

## Handling Multiple Sections

If the user provides multiple sections (or an entire manuscript), run the pipeline on each section sequentially. Treat each section independently, the Scout, Writer, and Judge each get fresh context for every section to stay focused.

## Handling Edge Cases

- **Very short text** (1-2 sentences): Still run the full pipeline: even brief text benefits from systematic review
- **Already excellent writing**: The Scout should still look for potential improvements; the Judge may confirm minimal changes were needed
- **Non-English text**: Run the pipeline in the language provided, unless the user asks for English revision
- **User provides journal context** (e.g., "this is for Nature Neuroscience"): Pass journal-specific context to all three agents so they can tailor formatting, word limits, and style expectations
- **Tracked changes or comments requested**: If the user wants to see what changed, the Judge's Notes serve this purpose; offer to also produce a side-by-side diff
- **User provides a figure image with a legend**: Pass the image to the Scout so it can cross-reference the legend against visible panels, labels, and annotations
