# manuscript-writing-skills

Claude skills for scientific manuscript writing: revision, claim-matched references, and EndNote-ready Word output.

| Skill | What it does |
|---|---|
| [`manuscript-revision`](skills/manuscript-revision/SKILL.md) | Scout → Writer → Judge pipeline that revises any manuscript section (Abstract, Introduction, Methods, Results, Discussion, figure legends, cover letter) to publication-ready quality. |
| [`reference-revision-isolated`](skills/reference-revision-isolated/SKILL.md) | Five-agent reference pipeline (EXTRACTOR → FINDER → VERIFIER → BUILDER → AUDITOR). Each agent runs as an independent API call inside a React artifact ([`assets/pipeline.jsx`](skills/reference-revision-isolated/assets/pipeline.jsx)), so there is no context bleed between stages. |
| [`endnote-citations-v50`](skills/endnote-citations-v50/SKILL.md) | Six-agent pipeline that builds a `.docx` with EndNote field codes (`ADDIN EN.CITE` / `EN.REFLIST`) plus a companion `.ris` file. DOIs are verified through CrossRef. Field-code injection is done by [`scripts/inject_endnote.py`](skills/endnote-citations-v50/scripts/inject_endnote.py). |

## Layout

```
skills/
  endnote-citations-v50/        SKILL.md, scripts/inject_endnote.py
  manuscript-revision/          SKILL.md
  reference-revision-isolated/  SKILL.md, assets/pipeline.jsx
```

The folder `endnote-citations-v50` holds a skill whose frontmatter `name` is `endnote-citations-v5.0`.

## Use

Copy a skill folder into `~/.claude/skills/` for Claude Code, or zip the folder and upload it under Settings → Customize → Skills on claude.ai.

## Provenance

Skills were authored by the repository owner. `manuscript-revision` and `reference-revision-isolated` are exported from claude.ai (updated Apr 2026); `endnote-citations-v50` comes from `~/.claude/commands/`.
