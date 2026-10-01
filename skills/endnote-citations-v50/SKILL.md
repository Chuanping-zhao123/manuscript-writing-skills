---
name: endnote-citations-v5.0
description: >
  Create Word documents (.docx) with EndNote field codes (ADDIN EN.CITE/EN.REFLIST) and companion RIS files via a 6-agent pipeline: RESEARCHER finds DOIs for all references (DOI-first — no manual metadata compilation), REVIEWER checks that every citation actually supports the sentence citing it (with Researcher-Reviewer loop for mismatches, max 3 rounds), VERIFIER resolves every DOI via CrossRef API to fetch authoritative metadata (never from memory), BUILDER constructs the .docx with precise field code injection, RIS-WRITER generates .ris, AUDITOR checks integrity including field code scope and citation-sentence mapping (with Builder-Auditor loop for mismatches, max 2 rounds). Trigger when the user mentions "EndNote", "field codes", "traveling library", "citation manager", "RIS file", "add references", or "cite sources" in a Word document. Works with any citation style (Nature, APA, Vancouver). The user can provide references, manuscript text, or just a topic and reference count — the skill independently finds, verifies, and compiles references.
---

# EndNote Citations Skill v5.0 — Agent Team Pipeline

Create Word documents with embedded EndNote field codes and companion RIS files, powered by a **6-agent pipeline** that uses the **CrossRef API as the single source of truth** for all reference metadata, with citation-quality review and battle-tested field code injection.

**v5.0 adds:**
- **Reviewer agent** — new quality gate between Researcher and Verifier that checks every citation-sentence pair for fit, with an iterative Researcher↔Reviewer loop (max 3 rounds) to fix mismatches before metadata fetch
- **Builder-Auditor loop** — Auditor check #9 verifies citation-sentence mapping; sends back to Builder if mismatches found (max 2 rounds)
- **v4.0's bug fixes** — chemsup() for chemical superscripts, sequential-by-first-appearance numbering, hardened injection regex

**v4.0 base:**
- **v2.0's DOI-first architecture** — the Researcher only collects DOIs; the Verifier fetches all metadata from CrossRef (eliminates hallucinated/mismatched reference details)
- **v3.0's polished Builder & Auditor** — citation-before-punctuation, base document validation, two-step run-matching injection script, field code scope checks, and documented common pitfalls

## What This Skill Produces

1. **Word Document (.docx)** with:
   - In-text superscript citations placed **before punctuation** (e.g., word¹,² not word.¹,²)
   - Each citation wrapped in `ADDIN EN.CITE` Word field codes containing full EndNote XML metadata
   - A formatted reference list at the end wrapped in `ADDIN EN.REFLIST` field code
   - **Only DOI-verified references** — every reference's metadata comes from CrossRef, not from Claude's memory
   - Field codes that wrap **only the superscript citation numbers**, not surrounding body text

2. **RIS File (.ris)** with:
   - All verified references in citation order
   - Standard fields: TY, AU, TI, JO, VL, SP, EP, PY, DO, UR
   - Directly importable into EndNote, Zotero, or Mendeley

3. **Verification Report (.md)** with:
   - Per-reference verification status (verified, corrected, replaced, excluded)
   - Audit trail showing what was checked and what changed
   - Summary statistics

## Pipeline Architecture

```
User Input (manuscript text + refs, or topic + ref count, or any mix)
       |
   [RESEARCHER]  — Find DOIs for all references (DOI-first — no metadata compilation)
       |               Also records which sentence each citation supports
       |
   [REVIEWER]    — Check every citation-sentence pair for fit ←──────┐
       |               Evaluates: claim match, scope, specificity,   |
       |               directness. Also flags under/over-citation.   |
       |                                                              |
       ├── All pass → proceed to VERIFIER                            |
       ├── Mismatches found → send back with specific guidance ──────┘
       |       (max 3 rounds; then escalate to user)        (RESEARCHER finds
       └── No ref exists → report to user to revise sentence  better refs)
       |
   [VERIFIER]    — Resolve each DOI via CrossRef API → fetch authoritative metadata
       |                Only VERIFIED references pass through
       |
   [BUILDER]     — Generate .docx with EN.CITE / EN.REFLIST from verified refs
       |
   [RIS-WRITER]  — Generate .ris from verified refs
       |
   [AUDITOR]     — XML integrity + field code scope + citation-sentence mapping ←─┐
       |               Check #9: does each citation point to the right paper?     |
       ├── All pass → Deliver                                                     |
       └── Mapping mismatches → send back to BUILDER (max 2 rounds) ──────────────┘
       |
   Deliver: .docx + .ris + verification_report.md
```

Execute each agent phase sequentially. The Researcher and Reviewer form an iterative loop (max 3 rounds) that must fully resolve before proceeding to the Verifier. Clearly mark the start and end of each phase in your working process. Each agent receives the output of the previous agent.

---

## Agent 1: RESEARCHER (Reference Discovery — DOI-First)

### Role

Find relevant references and **collect their DOIs**. The Researcher's job is to produce a list of DOIs — NOT to compile full metadata. Full metadata will be fetched authoritatively by the Verifier using the CrossRef API. This eliminates hallucinated or mismatched reference details.

The Researcher handles four input scenarios and should detect which applies automatically.

**Scenario A — User provides a reference list:** Extract DOIs where present. For references without DOIs, web-search by title + first author + year to find the DOI. Record the user's description alongside the DOI for cross-checking.

**Scenario B — User provides manuscript text with in-text citations:** Identify all citation markers and match them to a bibliography if one exists. Extract or search for DOIs for each cited work.

**Scenario C — User specifies a topic and/or reference count (e.g., "I need 20 references on cone phototransduction"):** Conduct systematic web searches to find relevant, high-quality, peer-reviewed references. For each paper found, extract the DOI from the search result or publisher page. Prioritize:
- Seminal/foundational papers in the field
- Recent high-impact publications (last 5 years)
- Review articles that provide comprehensive coverage
- Papers from high-impact journals relevant to the field
Use multiple search strategies: topic keywords, key authors in the field, review articles that cite primary literature. Continue searching until the requested count is reached.

**Scenario D — Mix of the above:** User provides some references and asks for additional ones. Extract DOIs from provided refs, then search for complementary ones.

### How to Find DOIs

When searching for references, look for DOIs in:
- PubMed entries (listed under the title)
- Publisher landing pages (usually on the article page)
- Google Scholar results (often in the URL or metadata)
- Search queries like `"paper title" DOI` or `first author year journal DOI`

### Output Schema

Save to working directory as `refs_parsed.json`:

```json
[
  {
    "id": 1,
    "doi": "10.1234/example.2020.001",
    "user_description": "Masland 2012 retina organization Neuron",
    "cited_in": "Vision begins in the retina, a thin laminated neural tissue that lines the posterior surface of the eye...",
    "source": "user-provided | web-searched | inferred"
  }
]
```

**Rules:**
- DOI without URL prefix (no `https://doi.org/`)
- `user_description` is a brief note of what paper this is supposed to be (for the Reviewer and Verifier to cross-check)
- `cited_in` is the **full sentence or clause** from the manuscript that this reference is intended to support. This field is essential — the Reviewer uses it to evaluate citation-sentence fit. If a reference supports multiple sentences, use the primary/most important one.
- Assign `id` in order of first appearance in the manuscript, or in logical order for topic-based searches
- Every entry MUST have a `doi` field. If absolutely no DOI can be found after searching, set `"doi": null` and provide a detailed `user_description` so the Verifier can attempt a last-resort lookup.

---

## Agent 2: REVIEWER (Citation-Sentence Fit Check) ⭐ New in v5.0

### Role

Evaluate whether each cited reference actually supports the sentence citing it. The Reviewer is the **citation quality gate** — it catches mismatches that are technically valid papers but don't directly support the specific claim being made.

### Core Principle: Every Citation Must Directly Support Its Sentence

A citation is not acceptable just because the paper is real and vaguely related to the topic. The cited paper must provide **direct evidence or authoritative coverage** for the **specific claim** in the sentence.

### Review Procedure

**Step 1 — Batch evaluation of ALL citation-sentence pairs:**

Read `refs_parsed.json` and evaluate every entry in a single pass using the four criteria below.

**Step 2 — Apply structured evaluation criteria:**

| Criterion | Question |
|-----------|----------|
| **Claim match** | Does the paper's actual finding directly support the specific claim in the sentence? |
| **Scope match** | Is the paper about the right cell type, species, and biological system? |
| **Specificity** | Is the paper appropriately specific — not too broad and not too narrow? |
| **Directness** | Does the paper provide first-hand evidence, not just mention the topic in passing? |

Assign each citation: **PASS**, **WEAK**, **MISMATCH**, or **NO_REF_EXISTS**.

**Step 3 — Flag additional issues:** Uncited claims, over-citation, missing seminal references.

**Step 4 — Provide specific replacement guidance** for WEAK/MISMATCH entries. Specify what kind of paper is needed, not just "this doesn't match."

### Researcher-Reviewer Loop

When the Reviewer returns WEAK or MISMATCH verdicts, the Researcher searches for better refs and resubmits.

**Loop rules:**
- **Maximum 3 rounds.** After 3 cycles, include best candidate and document the limitation.
- **Only re-evaluate changed entries.** Previously PASSed citations carry forward.
- **NO_REF_EXISTS is final.** Report to user to revise the manuscript sentence.

### Handoff to Verifier

The loop is complete when all citations are PASS or max rounds reached.


---

## Agent 3: VERIFIER (CrossRef API Resolution & Metadata Fetch) ⭐ Critical Agent

This is the quality gate AND the metadata source. Instead of compiling reference metadata manually (which risks hallucination), the Verifier **resolves each DOI via the CrossRef API to fetch authoritative metadata**. This is exactly what EndNote does when you paste a DOI — the metadata comes from the source of truth, not from Claude's memory.

### Core Principle: DOI → CrossRef API → Authoritative Metadata

**Never compile reference metadata from memory or search snippets.** Always fetch it from the DOI via CrossRef. This guarantees every author name, title, journal, year, volume, and page number is correct.

### Verification Procedure (execute for each reference)

**Step 1 — Resolve the DOI via CrossRef API:**

Use `web_fetch` on the CrossRef API to get structured metadata:
```
https://api.crossref.org/works/{DOI}
```

This returns JSON with authoritative: title, authors, journal, volume, issue, pages, year, ISSN, publisher. No API key needed.

If CrossRef is unavailable, fall back to:
- `web_fetch` on `https://doi.org/{DOI}` (follows redirect to publisher page, extract metadata)
- Web-search the DOI string and extract metadata from the PubMed or publisher result

**Step 2 — Extract and normalize metadata from the CrossRef response:**

From the CrossRef JSON response, extract:
- `au`: from `message.author[]` → format as "Last, First M."
- `ti`: from `message.title[0]`, **plus `message.subtitle[0]`** if present (join with ": "). Many papers have subtitles registered separately in CrossRef — omitting them produces truncated titles.
- `jo`: from `message.short-container-title[0]` (abbreviated) or `message.container-title[0]` (full)
- `yr`: from `message.published.date-parts[0][0]`
- `vol`: from `message.volume`
- `sp`/`ep`: from `message.page` (split on "-")
- `doi`: the DOI itself (confirmed working)

**Step 3 — Cross-check against user's description:**

Compare the fetched metadata against the `user_description` from the Researcher:
- Does the fetched paper match what was intended? (e.g., if the user said "Masland 2012 retina organization", does the DOI resolve to a Masland paper about retina from 2012?)
- If yes → `VERIFIED`. Use the fetched metadata as-is.
- If no → `DOI_MISMATCH`. The DOI points to a different paper than intended. Attempt replacement search (see below).

**Step 4 — Handle failures:**

| Status | Condition | Action |
|--------|-----------|--------|
| `VERIFIED` | DOI resolves AND metadata matches user intent | Use CrossRef metadata directly. |
| `DOI_MISMATCH` | DOI resolves but is a different paper than intended | **Replacement search**: search for the intended paper by description, find its correct DOI, resolve that DOI via CrossRef. |
| `DOI_UNRESOLVED` | DOI does not resolve (404, invalid) | **Recovery search**: search for the paper by user_description to find a working DOI, then resolve via CrossRef. |
| `NO_DOI` | Reference has `doi: null` | **Discovery search**: search by user_description, find DOI, resolve via CrossRef. If no DOI exists (e.g., old textbook), compile metadata manually and flag. |

### Replacement / Recovery / Discovery Search Logic

When a DOI fails, the Verifier searches for the correct DOI and then resolves it through CrossRef — never manually compiles metadata:

**For DOI_MISMATCH:** Search for the intended paper → find correct DOI → resolve via CrossRef → if verified, status = `REPLACED`.

**For DOI_UNRESOLVED:** Search by description → find working DOI → resolve via CrossRef → if verified, status = `RECOVERED`.

**For NO_DOI:** Search by description → find DOI → resolve via CrossRef → if verified, status = `DISCOVERED`. If the paper truly has no DOI (pre-DOI era book/article), manually compile metadata from the search result and flag as `MANUAL_ENTRY`.

### Output

**`refs_verified.json`** — Only references that passed verification. Metadata is from CrossRef (authoritative), not from Claude's training data. Sequential renumbering starting from 1 (no ID gaps from excluded refs):

```json
[
  {
    "id": 1,
    "au": ["Masland, Richard H."],
    "yr": 2012,
    "ti": "The neuronal organization of the retina",
    "jo": "Neuron",
    "vol": "76",
    "sp": "266",
    "ep": "280",
    "doi": "10.1016/j.neuron.2012.10.002",
    "status": "VERIFIED",
    "metadata_source": "crossref",
    "notes": "Metadata fetched from CrossRef API."
  }
]
```

**`verification_log.json`** — Full audit trail for every reference (including excluded ones):
```json
[
  {
    "original_id": 1,
    "final_id": 1,
    "status": "VERIFIED",
    "original_doi": "10.1016/j.neuron.2012.10.002",
    "final_doi": "10.1016/j.neuron.2012.10.002",
    "metadata_source": "crossref",
    "user_description": "Masland 2012 retina organization Neuron",
    "crossref_title": "The neuronal organization of the retina",
    "match_confirmed": true,
    "corrections": [],
    "notes": "DOI resolved. CrossRef title matches user description."
  }
]
```

---

## Agent 4: BUILDER (Document Construction)

### Role

Generate the Word document with in-text citations, formatted reference list, and embedded EndNote field codes using **only verified references**.

### Procedure

**Read the docx skill first** for general docx best practices: `/mnt/skills/public/docx/SKILL.md`

**Step 1 — Create base .docx with docx-js (Node.js):**

```javascript
const { Document, Packer, Paragraph, TextRun, AlignmentType, ExternalHyperlink } = require("docx");

// Helper functions
function sup(text) {
  return new TextRun({ text, font: "Times New Roman", size: 24, superScript: true });
}
function txt(text) {
  return new TextRun({ text, font: "Times New Roman", size: 24 });
}
function ital(text) {
  return new TextRun({ text, font: "Times New Roman", size: 24, italics: true });
}
function bold(text) {
  return new TextRun({ text, font: "Times New Roman", size: 24, bold: true });
}
// Chemical/mathematical superscript — uses size: 22 to prevent run-merging
// with citation superscripts (size: 24) during unpack.py run merging.
// Use this for Ca²⁺, Na⁺, H₂O exponents, etc. — anything superscript that
// is NOT a citation number.
function chemsup(text) {
  return new TextRun({ text, font: "Times New Roman", size: 22, superScript: true });
}
```

Use the user's manuscript text **exactly as provided** — do not paraphrase or alter wording.

### Citation Numbering — Sequential by First Appearance ⭐ Critical

**Citation numbers MUST be assigned in the order references first appear in the manuscript text.** The first reference cited gets number 1, the second new reference gets number 2, etc. This is the universal convention in numbered citation styles (Nature, Vancouver, etc.).

**Procedure:**
1. Walk through the manuscript text from beginning to end
2. For each citation point, record which references are cited
3. Assign new sequential IDs based on order of first appearance
4. Renumber `refs_verified.json` to match (reorder entries so ref 1 is the first-cited paper, ref 2 is the second, etc.)
5. Use these sequential numbers in all `sup()` calls

**Common mistake:** Assigning reference IDs based on the order they were added to the DOI search list or `refs_parsed.json`, rather than the order they first appear in the manuscript. This produces non-sequential citations like "1,2" then "41,44" then "9,27" — which is wrong. Always renumber after the Verifier phase but before building the document.

Replace citation markers with superscript numbers corresponding to `id` values from `refs_verified.json`. If references were excluded by the Verifier, all citation numbers must reflect the renumbered sequence — no gaps.

**Citation formatting** (Nature style default, adjust per user request):
- Superscript numbers without brackets: ¹,² not [1,2]
- Multiple refs comma-separated: ¹,²,³
- Consecutive ranges with en-dash: ¹⁻³ (Unicode \u2013)

### Citation Placement — Before Punctuation

Place superscript citation numbers **before** the punctuation mark (period, comma, semicolon), This is the standard convention in most scientific journals.

Correct: `...in the kidney¹⁰, promotes lipolysis...`
Correct: `...downstream neurons³².`
Wrong:   `...in the kidney,¹⁰ promotes lipolysis...`
Wrong:   `...downstream neurons.³²`

In the docx-js code, this means the `sup()` run comes before the punctuation character:

```javascript
// CORRECT — citation before comma
txt("...renin secretion in the kidney"),
sup("13,14"),
txt(", promotes lipolysis in adipose tissue"),
sup("15,16"),
txt(",")

// CORRECT — citation before period at end of sentence
txt("...calcium-handling proteins"),
sup("11,12"),
txt(".")
```

If the user's manuscript text has citations after punctuation, silently adjust the placement to before punctuation.

**Reference list formatting** (Nature style default):
- Hanging indent: `indent: { left: 360, hanging: 360 }`
- Number + tab + Authors + Title + *Journal* **Volume**, pages (year). DOI
- Journal name italic, volume bold
- DOI as blue underlined ExternalHyperlink

**Step 2 — Validate the base document:**

```bash
python <docx-skill-path>/scripts/office/validate.py document_base.docx
```

This ensures the base document is well-formed before injecting field codes.

**Step 3 — Inject EndNote field codes using the bundled script:**

```bash
# Unpack the docx to XML
python <docx-skill-path>/scripts/office/unpack.py document_base.docx unpacked/

# Inject EN.CITE and EN.REFLIST field codes
python <this-skill-path>/scripts/inject_endnote.py unpacked/word/document.xml refs_verified.json

# Repack (MUST use --validate false because field codes are non-standard XML)
python <docx-skill-path>/scripts/office/pack.py unpacked/ output.docx --validate false
```

The bundled `scripts/inject_endnote.py` handles all field code injection. It uses a **two-step run-matching approach** that ensures field codes wrap only the individual superscript citation run — never surrounding body text. This is critical for correct behavior in Word: when a user selects a paragraph, only the citation numbers should be highlighted as field codes.

### How the Injection Script Works (for understanding, not reimplementation)

The script finds each `<w:r>...</w:r>` XML element individually, then checks whether that single run has both `<w:vertAlign w:val="superscript"/>` formatting and citation number text content. Only matching runs get wrapped in field codes.

Each EN.CITE field code has the structure:
```xml
<w:r><w:rPr>...</w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:rPr>...</w:rPr><w:instrText xml:space="preserve"> ADDIN EN.CITE &lt;EndNote&gt;...&lt;/EndNote&gt;</w:instrText></w:r>
<w:r><w:rPr>...</w:rPr><w:fldChar w:fldCharType="separate"/></w:r>
[original superscript run unchanged]
<w:r><w:rPr>...</w:rPr><w:fldChar w:fldCharType="end"/></w:r>
```

The `rPr` on begin/separate/end runs uses the same font properties but **without** superscript — only the visible content run between separate and end retains superscript formatting.

The EN.CITE XML payload inside `instrText` must include:
- `<DisplayText><style face="superscript">N,M</style></DisplayText>` in the first `<Cite>` — this tells EndNote what to display when reformatting. Without this, reformatting causes corruption.
- `<foreign-keys><key app="EN" db-id="0">N</key></foreign-keys>` — required for EndNote to recognize the record.
- `<style face="normal" font="default" size="100%">` wrappers on text fields (authors, title, journal) — required for traveling library compatibility.
- Full `<record>` block with metadata (rec-number, ref-type, contributors, titles, volume, pages, dates, DOI).

The EN.REFLIST wraps everything from the "References" heading paragraph to the end of `<w:body>`.

### Output

`document_with_endnote.docx`

---

## Agent 5: RIS-WRITER (RIS File Generation)

### Role

Generate a `.ris` file from `refs_verified.json` for import into reference managers.

### Format

```
TY  - JOUR
AU  - Last, First M.
AU  - Last2, First2
TI  - Full title of the paper
JO  - J. Abbrev.
VL  - 42
SP  - 100
EP  - 115
PY  - 2020
DO  - 10.1234/example.2020.001
UR  - https://doi.org/10.1234/example.2020.001
ER  -
```

Rules:
- One `AU` line per author
- Entries in citation order by `id`
- Separate entries with blank line
- TY is `JOUR` for journal articles, `BOOK` for books, `CHAP` for book sections

### Output

`references.ris`

---

## Agent 6: AUDITOR (Integrity Check & Report)

### Role

Final quality gate. Verify internal consistency across all outputs and generate the human-readable verification report.

### Integrity Checks

Run all of these and log pass/fail:

1. **EN.CITE count** == number of unique citation groups in the document:
   `grep -c "ADDIN EN.CITE" unpacked/word/document.xml`

2. **EN.REFLIST present**:
   `grep -c "ADDIN EN.REFLIST" unpacked/word/document.xml`

3. **fldChar balance**: begin count == separate count == end count == EN.CITE count + 1 (for REFLIST)

4. **Field code scope check**: Each EN.CITE field code should contain exactly 1 visible `<w:r>` run between `fldCharType="separate"` and `fldCharType="end"`, and that run must have superscript formatting. If any field code contains multiple runs or non-superscript runs, the injection went wrong.

5. **RIS entry count** == verified reference count:
   `grep -c "ER  -" references.ris`

6. **Cross-consistency**: Every `id` in `refs_verified.json` has exactly one superscript citation in the docx and exactly one RIS entry.

7. **DOI format**: Every DOI in RIS starts with `10.` and has no URL prefix in the DO field.


9. **Citation-sentence mapping audit** ⭐ Critical — prevents citation-number drift:

   For EVERY citation group in the document, verify that the cited reference(s) actually support the sentence they are attached to. This catches wrong papers cited for each sentence.

   **Procedure:**
   1. Extract each sentence + its citation numbers from the built document
   2. Look up what paper each citation number corresponds to in `refs_verified.json`
   3. Verify the paper's subject area matches the sentence's topic
   4. Flag any mismatches

   If ANY citation-sentence pair fails, send the document back to the Builder for correction.

### Builder-Auditor Loop

When check #9 finds mismatches, the Builder fixes the `sup()` calls and rebuilds. **Maximum 2 rounds.** The Builder must include a comment next to each `sup()` showing the paper it maps to.

8. **Metadata source audit**: Every entry in `refs_verified.json` should have `"metadata_source": "crossref"` (or `"manual"` for pre-DOI works flagged as `MANUAL_ENTRY`). If any entry lacks this field, the Verifier skipped CrossRef resolution — flag as a warning.

### Verification Report

Generate `verification_report.md`:

```markdown
# Reference Verification Report

## Summary
- **Total references submitted/found**: N
- **Verified (no changes needed)**: N
- **Replaced (DOI mismatch → correct DOI found)**: N
- **Recovered (broken DOI → working DOI found)**: N
- **Discovered (no DOI → DOI found)**: N
- **Manual entry (no DOI exists)**: N
- **Excluded (unverifiable)**: N
- **Final reference count in document**: N
- **Metadata source**: All from CrossRef API ✅ / N entries manual ⚠️

## Document Integrity
- EN.CITE field codes: N found (expected N)
- EN.REFLIST: Present/Missing
- fldChar balance: Balanced/Imbalanced (begin=N, separate=N, end=N)
- Field code scope: All field codes wrap only superscript citation runs
- RIS entries: N found (expected N)
- Metadata source audit: All CrossRef ✅ / N manual entries ⚠️

## Per-Reference Detail

### Ref 1 — Last (Year). "Short title..."
- **Status**: VERIFIED ✅
- **DOI**: 10.xxxx/yyyy → Resolved via CrossRef
- **Metadata source**: crossref
- **Fields**: Title ✅ | Authors ✅ | Year ✅ | Journal ✅

### Ref 3 (original #4) — Last (Year). "Short title..."
- **Status**: REPLACED 🔄
- **Original DOI**: 10.xxxx/wrong → Pointed to different paper
- **New DOI**: 10.xxxx/correct → Resolved via CrossRef
- **Metadata source**: crossref
- **Fields**: Title ✅ | Authors ✅ | Year ✅ | Journal ✅

### EXCLUDED — Last (Year). "Short title..."
- **Status**: EXCLUDED ❌
- **DOI**: 10.xxxx/broken → Did not resolve
- **Recovery**: Searched by title+author → No match found
```

### Output

`verification_report.md` — present to user alongside .docx and .ris.

---

## Citation Style Variations

Default is **Nature** style. Adjust for other styles:

| Style | In-text | Reference list |
|-------|---------|----------------|
| Nature | Superscript: ¹,² | N. Author. Title. *J. Abbrev.* **vol**, pages (year). |
| APA | Parenthetical: (Author, year) | Author, A. B. (year). Title. *Journal*, *vol*(issue), pages. DOI |
| Vancouver | Bracketed: [1,2] | N. Author. Title. J Abbrev. year;vol:pages. DOI |

Adjust TextRun formatting and reference list layout per style. EN.CITE field code content stays the same regardless of style.

## Important Notes

- **DOI-first principle**: Never compile reference metadata from memory or search snippets. Always resolve DOIs via CrossRef API to get authoritative metadata. This is how EndNote and Zotero work — paste a DOI, get the real record. The skill does the same thing programmatically.
- **CrossRef API**: `https://api.crossref.org/works/{DOI}` — no API key needed, returns JSON with full metadata. If CrossRef is unavailable, use `web_fetch` on `https://doi.org/{DOI}` and parse the publisher page.
- **Always use `--validate false`** when repacking after field code injection — field codes use non-standard XML that the validator would reject, but Word handles them correctly.
- **Citation numbers must match** between superscript text and reference IDs in EN.CITE XML.
- **Place citations before punctuation** — `word¹².` not `word.¹²` — this is the standard convention and what users expect.
- **The traveling library** is self-contained in the .docx — the recipient does not need the RIS file to reformat references.
- **Unicode in XML**: Author names with accents work fine. Use actual Unicode characters.
- **Web search budget**: The Researcher needs ~1-2 searches per reference to find DOIs. The Verifier needs ~1 CrossRef API call per DOI (fast, reliable). For problematic refs, add 1-2 recovery searches. Total for 30 refs: ~40-50 tool calls.
- **Use the bundled injection script** (`scripts/inject_endnote.py`) rather than writing a new one — it has been carefully debugged to avoid the cross-run-boundary matching bug that causes field codes to wrap entire paragraphs.

## Common Pitfalls and How to Avoid Them

These issues were discovered through real-world testing. The bundled injection script already handles them correctly, but they're documented here for understanding and in case the script needs modification.

**1. Field codes wrapping entire paragraphs (not just citations)**
The most common and serious bug. If a regex uses `.*?` with `re.DOTALL` to match from `<w:r>` through `<w:vertAlign w:val="superscript"/>` to `</w:r>`, it can match across multiple `<w:r>` run boundaries, capturing normal body text runs along with the superscript run. The result: when the user selects a paragraph in Word, the entire paragraph is highlighted as a field code instead of just the citation numbers. The fix is the two-step approach used in the bundled script — find each `<w:r>` block individually first, then check it for superscript.

**2. Missing DisplayText causing corruption on reformat**
If the EN.CITE XML payload omits the `<DisplayText>` element, the field code works initially but corrupts the document when the user reformats references through EndNote. The DisplayText must include `<style face="superscript">` wrapping the citation text.

**3. Missing foreign-keys and style wrappers**
Without `<foreign-keys>` in each record and `<style>` wrappers on text fields, EndNote may not fully recognize the traveling library entries, causing issues when importing or reformatting.

**4. Compiling metadata from memory instead of CrossRef**
If the Verifier skips the CrossRef API call and instead fills in metadata from Claude's training data or search snippets, author names, page ranges, and journal abbreviations are frequently wrong. Always resolve through CrossRef — it takes one API call per DOI and returns authoritative data.


**5. Chemical/mathematical superscripts merging with citation superscripts**
When text like Ca²⁺ is followed by a citation, the unpack.py run-merging step can combine them into "2+1,8". **Fix:** Use `chemsup()` (size: 22) for non-citation superscripts and `sup()` (size: 24) for citations.

**6. Non-sequential citation numbering**
If references are numbered by DOI-list order rather than first-appearance order, citations jump around. **Fix:** Renumber all references sequentially based on first appearance in the manuscript text after the Verifier phase.

## Execution Checklist

Follow this checklist for every run:

- [ ] **RESEARCHER**: DOIs collected for all references → `refs_parsed.json` saved (DOIs + user_description + cited_in sentence, no metadata)
- [ ] **REVIEWER**: All citation-sentence pairs evaluated → `review_report.json` generated
- [ ] **REVIEWER**: Researcher-Reviewer loop completed (all PASS, or max 3 rounds reached)
- [ ] **REVIEWER**: Any NO_REF_EXISTS cases reported to user
- [ ] **VERIFIER**: Every DOI resolved via CrossRef API (`api.crossref.org/works/{DOI}`) to fetch authoritative metadata
- [ ] **VERIFIER**: `refs_verified.json` has only verified refs with CrossRef metadata, renumbered sequentially
- [ ] **VERIFIER**: Every entry has `"metadata_source": "crossref"` (or `"manual"` for pre-DOI works)
- [ ] **VERIFIER**: `verification_log.json` has full audit trail with crossref_title and match_confirmed for each ref
- [ ] **BUILDER**: Citation numbers assigned sequentially by first appearance
- [ ] **BUILDER**: Chemical/math superscripts use `chemsup()` (size:22), citations use `sup()` (size:24)
- [ ] **BUILDER**: Base .docx created with superscript citations **before punctuation**
- [ ] **BUILDER**: Base .docx validated with validate.py
- [ ] **BUILDER**: EN.CITE and EN.REFLIST field codes injected using bundled script
- [ ] **BUILDER**: Each field code wraps only the superscript run (verified)
- [ ] **RIS-WRITER**: .ris generated from verified refs only
- [ ] **AUDITOR**: All integrity checks pass (including field code scope check and metadata source audit)
- [ ] **AUDITOR**: Citation-sentence mapping audit passed (check #9)
- [ ] **AUDITOR**: If mismatches found, Builder-Auditor loop completed (max 2 rounds)
- [ ] **AUDITOR**: `verification_report.md` generated
- [ ] **DELIVER**: Three files presented via `present_files`: .docx, .ris, verification_report.md
