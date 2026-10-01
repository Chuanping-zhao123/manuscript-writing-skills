import { useState, useRef, useCallback } from "react";

const AGENTS = [
  { id: "extractor", label: "EXTRACTOR", desc: "Decompose text into atomic claims", icon: "🔬" },
  { id: "finder", label: "FINDER", desc: "Search references for each claim", icon: "🔍" },
  { id: "verifier", label: "VERIFIER", desc: "DOI + claim-match + accuracy gates", icon: "✅" },
  { id: "builder", label: "BUILDER", desc: "Insert citations & compile ref list", icon: "🏗️" },
  { id: "auditor", label: "AUDITOR", desc: "8-check quality gate", icon: "🛡️" },
];

const SYSTEM_PROMPTS = {
  extractor: `You are EXTRACTOR — the first agent in a 5-agent reference-revision pipeline. Your ONLY job is to decompose manuscript text into atomic, citable claims.

PROCEDURE:
1. Number every sentence (S1, S2, S3...).
2. For each sentence, extract every distinct citable claim as an atomic sub-claim.
3. Decompose compound claims (lists, ranges, enumerations) into one sub-claim per element.
4. Classify each claim: factual, mechanistic, historical, methodological, broad_overview, or interpretive.
5. Mark claims that don't need citation as no_cite_needed (author's own data, transitions, thesis framing).

OUTPUT FORMAT — produce a structured CLAIM REGISTER as a table:
| Sentence # | Sentence excerpt | Atomic claim | Claim type | Cite needed? |

Be thorough. Every citable fact, mechanism, or assertion gets its own row. This register will be used by the FINDER agent to search for references claim-by-claim.

CRITICAL: Do NOT search for or suggest any references. Only decompose claims.`,

  finder: `You are FINDER — the second agent in a 5-agent reference-revision pipeline. You receive a CLAIM REGISTER from the EXTRACTOR. Your ONLY job is to find candidate references for each atomic claim.

PROCEDURE:
1. Work CLAIM BY CLAIM, not topic by topic.
2. For each claim marked "cite needed", use web_search to find 1-3 candidate references that DIRECTLY support that SPECIFIC claim.
3. Search by claim content, NOT by general topic. Example:
   - Claim: "CRISPR is a prokaryotic adaptive immune system" → search: "Barrangou 2007 CRISPR acquired resistance prokaryotes"
   - NOT: "CRISPR review"
4. For each candidate, record: DOI, authors, title, journal, year, brief description of what the paper demonstrates, which atomic claim(s) it supports, evidence type (primary/review).
5. Prefer primary research for specific claims; reviews only for broad background.
6. Target 40-50 references total if content supports it. Quality over quantity.
7. Do NOT invent any bibliographic details. Only report what you actually find.

OUTPUT FORMAT:
For each claim group, list candidates with full bibliographic details and DOI.`,

  verifier: `You are VERIFIER — the third agent in a 5-agent reference-revision pipeline. You receive candidate references from the FINDER, tagged to specific atomic claims. Your ONLY job is to run three quality gates on every candidate reference.

GATE 1 — DOI Resolution:
Use web_search to verify each DOI resolves to the correct article. Confirm: authors, title, journal, year match. If any detail cannot be confirmed → REJECT.

GATE 2 — Claim-Content Match:
Does this paper's ACTUAL FINDING (not just its topic/field/gene/pathway) DIRECTLY support the SPECIFIC atomic claim? A paper about "CRISPR in neurons" does NOT support "CRISPR editing in yeast." If match fails → REJECT for that claim.

GATE 3 — Per-Reference Accuracy:
When a reference will be grouped with others under a blanket statement, verify the blanket statement accurately describes what THIS individual paper found. If it misrepresents the paper → FLAG for wording revision.

OUTPUT FORMAT:
1. VERIFIED REFERENCE LIST: Only refs that passed all 3 gates, with bibliographic details, which claim(s) each supports, and Gate 2/3 confirmation.
2. REJECTED REFERENCES: Which refs failed, which gate, and why.
3. FLAGGED CLAIMS: Claims with zero surviving references after verification (need wording adjustment by BUILDER).`,

  builder: `You are BUILDER — the fourth agent in a 5-agent reference-revision pipeline. You receive the original manuscript text, the CLAIM REGISTER, and the VERIFIED REFERENCE LIST. Your job is to produce the final revised section.

PROCEDURE:
Step 1: Assign reference numbers in order of first inline appearance.
Step 2: Insert bracket citations [1], [2-4] at appropriate positions. All citations go BEFORE commas and periods.
Step 3: Handle flagged claims — make minimum wording changes so statements become accurate. Do NOT force weak citations.
Step 4: Sub-claim coverage check — every element in compound claims must have ≥1 reference. Remove unsupported elements if needed.
Step 5: Compile reference list — extract every unique [N] from revised text, then build the list from ONLY those. Orphan prevention: a ref enters the list ONLY when cited inline.
Step 6: Produce wording-change log (original → revised → reason for each change).
Step 7: Produce citation-audit table (sentence excerpt, main claim, ref numbers, why each ref supports the claim, evidence type). Every cited sentence MUST have a row.

OUTPUT (clearly labeled sections):
1. REVISED TEXT with inline citations
2. REFERENCE LIST with DOIs
3. WORDING-CHANGE LOG
4. CITATION-AUDIT TABLE`,

  auditor: `You are AUDITOR — the fifth and final agent in a 5-agent reference-revision pipeline. You receive the BUILDER's complete output. Run eight structural checks.

THE EIGHT CHECKS:

Check 1 — No orphan references:
Extract Set_Text (all [N] in revised text) and Set_List (all numbers in ref list). Compute differences. Report both sets. Any mismatch → FAIL.

Check 2 — No phantom citations:
Every inline [N] has a corresponding ref list entry. Missing entry → FAIL.

Check 3 — DOI correctness:
Spot-check at least 5 DOIs against actual articles. Any mismatch → FAIL.

Check 4 — Citations before punctuation:
Scan for patterns like .[1] or ,[2]. Any found → FAIL.

Check 5 — No unsupported claims:
No sentence makes a specific citable claim without a citation. Cross-reference the Claim Register.

Check 6 — Sub-claim coverage:
Every named sub-element in compound claims has ≥1 reference.

Check 7 — Per-reference accuracy:
For sentences citing 2+ refs under a blanket characterization, verify characterization holds for EACH paper individually.

Check 8 — Audit table completeness:
Count cited sentences in text vs audit table rows. Must match.

OUTPUT FORMAT:
AUDITOR QC CONFIRMATION
========================
Check 1 (Orphan refs):           PASS/FAIL — [details]
Check 2 (Phantom citations):     PASS/FAIL — [details]
Check 3 (DOI correctness):       PASS/FAIL — [details]
Check 4 (Citation placement):    PASS/FAIL — [details]
Check 5 (Unsupported claims):    PASS/FAIL — [details]
Check 6 (Sub-claim coverage):    PASS/FAIL — [details]
Check 7 (Per-ref accuracy):      PASS/FAIL — [details]
Check 8 (Audit table complete):  PASS/FAIL — [details]

If ANY check fails, output STATUS: REVISION NEEDED with specific fix instructions for the BUILDER.
If ALL pass, output STATUS: ALL CHECKS PASSED.`
};

async function callAgent(agentId, userContent, useWebSearch = false) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: SYSTEM_PROMPTS[agentId],
    messages: [{ role: "user", content: userContent }],
  };
  if (useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");
}

function StatusBadge({ status }) {
  const styles = {
    idle: { bg: "#2a2a3a", color: "#888", text: "Waiting" },
    running: { bg: "#1a3a5c", color: "#5cb8ff", text: "Running..." },
    done: { bg: "#1a3c2a", color: "#5cff8a", text: "Complete" },
    error: { bg: "#3c1a1a", color: "#ff5c5c", text: "Error" },
  };
  const s = styles[status] || styles.idle;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 12,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
    }}>{s.text}</span>
  );
}

function AgentCard({ agent, status, output, isActive, elapsed }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = output && output.length > 0;
  return (
    <div style={{
      background: isActive ? "#161625" : "#111119",
      border: `1px solid ${isActive ? "#3a5a8a" : "#222233"}`,
      borderRadius: 10, padding: "14px 18px", marginBottom: 8,
      transition: "all 0.3s ease",
      boxShadow: isActive ? "0 0 20px rgba(92,184,255,0.08)" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>{agent.icon}</span>
          <div>
            <span style={{ color: "#ddd", fontWeight: 700, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>
              {agent.label}
            </span>
            <span style={{ color: "#666", fontSize: 12, marginLeft: 8 }}>{agent.desc}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {elapsed > 0 && (
            <span style={{ color: "#555", fontSize: 11, fontFamily: "monospace" }}>{elapsed}s</span>
          )}
          <StatusBadge status={status} />
          {hasOutput && (
            <button onClick={() => setExpanded(!expanded)} style={{
              background: "none", border: "1px solid #333", borderRadius: 6,
              color: "#888", padding: "2px 8px", cursor: "pointer", fontSize: 11,
            }}>
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
      </div>
      {isActive && status === "running" && (
        <div style={{ marginTop: 10, height: 3, background: "#1a2a3a", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", background: "linear-gradient(90deg, #2a5a8a, #5cb8ff, #2a5a8a)",
            animation: "shimmer 1.5s infinite", backgroundSize: "200% 100%",
            width: "100%",
          }} />
        </div>
      )}
      {expanded && hasOutput && (
        <pre style={{
          marginTop: 12, padding: 14, background: "#0a0a14", borderRadius: 8,
          color: "#b0b8c8", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap",
          wordBreak: "break-word", maxHeight: 500, overflowY: "auto",
          border: "1px solid #1a1a2a", fontFamily: "'JetBrains Mono', Consolas, monospace",
        }}>{output}</pre>
      )}
    </div>
  );
}

export default function ReferenceRevisionPipeline() {
  const [manuscript, setManuscript] = useState("");
  const [agentStates, setAgentStates] = useState(
    Object.fromEntries(AGENTS.map((a) => [a.id, { status: "idle", output: "", elapsed: 0 }]))
  );
  const [currentAgent, setCurrentAgent] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState("idle"); // idle | running | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const [auditLoop, setAuditLoop] = useState(0);
  const abortRef = useRef(false);

  const updateAgent = useCallback((id, patch) => {
    setAgentStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const runPipeline = useCallback(async () => {
    if (!manuscript.trim()) return;
    abortRef.current = false;
    setPipelineStatus("running");
    setErrorMsg("");
    setAuditLoop(0);
    setAgentStates(
      Object.fromEntries(AGENTS.map((a) => [a.id, { status: "idle", output: "", elapsed: 0 }]))
    );

    const timedCall = async (agentId, content, webSearch = false) => {
      const t0 = Date.now();
      setCurrentAgent(agentId);
      updateAgent(agentId, { status: "running" });
      try {
        const result = await callAgent(agentId, content, webSearch);
        const elapsed = Math.round((Date.now() - t0) / 1000);
        updateAgent(agentId, { status: "done", output: result, elapsed });
        return result;
      } catch (err) {
        const elapsed = Math.round((Date.now() - t0) / 1000);
        updateAgent(agentId, { status: "error", output: `Error: ${err.message}`, elapsed });
        throw err;
      }
    };

    try {
      // Agent 1: EXTRACTOR
      const extractorOut = await timedCall(
        "extractor",
        `Here is the manuscript section to decompose into atomic claims:\n\n---\n${manuscript}\n---\n\nProduce the full CLAIM REGISTER.`
      );
      if (abortRef.current) return;

      // Agent 2: FINDER (with web search)
      const finderOut = await timedCall(
        "finder",
        `Here is the CLAIM REGISTER from the EXTRACTOR:\n\n---\n${extractorOut}\n---\n\nFor each claim marked "cite needed", search for candidate references. Use web_search to find real papers with DOIs.`,
        true
      );
      if (abortRef.current) return;

      // Agent 3: VERIFIER (with web search)
      const verifierOut = await timedCall(
        "verifier",
        `Here are the candidate references from the FINDER:\n\n---\n${finderOut}\n---\n\nAnd here is the original CLAIM REGISTER:\n\n---\n${extractorOut}\n---\n\nRun all three gates (DOI resolution, claim-content match, per-ref accuracy) on every candidate. Use web_search to verify DOIs.`,
        true
      );
      if (abortRef.current) return;

      // Agent 4: BUILDER
      let builderOut = await timedCall(
        "builder",
        `ORIGINAL MANUSCRIPT:\n---\n${manuscript}\n---\n\nCLAIM REGISTER:\n---\n${extractorOut}\n---\n\nVERIFIED REFERENCE LIST:\n---\n${verifierOut}\n---\n\nProduce the complete output: revised text with inline citations, reference list with DOIs, wording-change log, and citation-audit table.`
      );
      if (abortRef.current) return;

      // Agent 5: AUDITOR (may loop)
      let auditorOut = await timedCall(
        "auditor",
        `BUILDER OUTPUT:\n---\n${builderOut}\n---\n\nCLAIM REGISTER:\n---\n${extractorOut}\n---\n\nRun all eight structural checks.`,
        true
      );

      let loops = 1;
      while (auditorOut.includes("REVISION NEEDED") && loops < 3 && !abortRef.current) {
        setAuditLoop(loops);
        // Re-run BUILDER with auditor feedback
        updateAgent("builder", { status: "running", output: "" });
        builderOut = await timedCall(
          "builder",
          `ORIGINAL MANUSCRIPT:\n---\n${manuscript}\n---\n\nCLAIM REGISTER:\n---\n${extractorOut}\n---\n\nVERIFIED REFERENCE LIST:\n---\n${verifierOut}\n---\n\nAUDITOR FEEDBACK (fix these issues):\n---\n${auditorOut}\n---\n\nPrevious builder output:\n---\n${builderOut}\n---\n\nApply ALL fixes from the AUDITOR and produce the corrected output.`
        );
        updateAgent("auditor", { status: "running", output: "" });
        auditorOut = await timedCall(
          "auditor",
          `BUILDER OUTPUT (revision round ${loops + 1}):\n---\n${builderOut}\n---\n\nCLAIM REGISTER:\n---\n${extractorOut}\n---\n\nRun all eight structural checks again.`,
          true
        );
        loops++;
      }
      setAuditLoop(loops);

      setCurrentAgent(null);
      setPipelineStatus("done");
    } catch (err) {
      setCurrentAgent(null);
      setPipelineStatus("error");
      setErrorMsg(err.message);
    }
  }, [manuscript, updateAgent]);

  const handleStop = () => {
    abortRef.current = true;
    setPipelineStatus("idle");
    setCurrentAgent(null);
  };

  const allOutputs = AGENTS.map((a) => agentStates[a.id].output).filter(Boolean);
  const totalTime = AGENTS.reduce((s, a) => s + agentStates[a.id].elapsed, 0);

  return (
    <div style={{
      minHeight: "100vh", background: "#0c0c16", color: "#ccc",
      fontFamily: "'Inter', -apple-system, sans-serif", padding: "24px 20px",
    }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        textarea:focus { outline: none; border-color: #3a5a8a !important; }
        button:hover:not(:disabled) { filter: brightness(1.15); }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #111119; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "linear-gradient(135deg, #2a4a7a, #5c8aff)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: "#fff",
          }}>R²</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e8eaf0", letterSpacing: -0.5 }}>
              Reference Revision Pipeline
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: "#556" }}>
              5 isolated agent sessions · EXTRACTOR → FINDER → VERIFIER → BUILDER → AUDITOR
            </p>
          </div>
        </div>

        <div style={{
          margin: "16px 0", padding: "10px 14px", background: "#111119",
          borderRadius: 8, border: "1px solid #1a1a2a", fontSize: 12, color: "#667",
          lineHeight: 1.6,
        }}>
          <strong style={{ color: "#889" }}>How it works:</strong> Each agent runs in its own fresh API session (no context bleed). 
          The FINDER and VERIFIER use web search to find real papers and verify DOIs. 
          If the AUDITOR finds issues, it loops back to the BUILDER (max 3 rounds).
        </div>

        {/* Input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "#556", fontWeight: 600, display: "block", marginBottom: 6 }}>
            MANUSCRIPT SECTION
          </label>
          <textarea
            value={manuscript}
            onChange={(e) => setManuscript(e.target.value)}
            placeholder="Paste your manuscript section here (Introduction, Discussion, etc.)..."
            disabled={pipelineStatus === "running"}
            style={{
              width: "100%", minHeight: 160, background: "#111119", border: "1px solid #222233",
              borderRadius: 8, color: "#c8ccd4", padding: 14, fontSize: 13, lineHeight: 1.7,
              resize: "vertical", fontFamily: "'Georgia', serif", boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            {pipelineStatus !== "running" ? (
              <button
                onClick={runPipeline}
                disabled={!manuscript.trim()}
                style={{
                  padding: "10px 28px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: manuscript.trim() ? "linear-gradient(135deg, #2a5a9a, #4a7acc)" : "#222",
                  color: manuscript.trim() ? "#fff" : "#555", fontWeight: 700, fontSize: 13,
                  transition: "all 0.2s",
                }}>
                Run Pipeline
              </button>
            ) : (
              <button
                onClick={handleStop}
                style={{
                  padding: "10px 28px", borderRadius: 8, border: "1px solid #5c3a3a",
                  cursor: "pointer", background: "#2a1a1a", color: "#ff8888",
                  fontWeight: 700, fontSize: 13,
                }}>
                Stop
              </button>
            )}
            {pipelineStatus === "done" && (
              <span style={{ color: "#5cff8a", fontSize: 12, fontWeight: 600 }}>
                Pipeline complete · {totalTime}s total{auditLoop > 1 ? ` · ${auditLoop} audit rounds` : ""}
              </span>
            )}
            {pipelineStatus === "error" && (
              <span style={{ color: "#ff5c5c", fontSize: 12 }}>Error: {errorMsg}</span>
            )}
          </div>
        </div>

        {/* Agent cards */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#445", fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>
            PIPELINE STAGES
          </div>
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              status={agentStates[agent.id].status}
              output={agentStates[agent.id].output}
              elapsed={agentStates[agent.id].elapsed}
              isActive={currentAgent === agent.id}
            />
          ))}
        </div>

        {/* Final output summary */}
        {pipelineStatus === "done" && agentStates.builder.output && (
          <div style={{
            background: "#111119", border: "1px solid #1a3c2a", borderRadius: 10,
            padding: "16px 18px", marginBottom: 20,
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "#5cff8a", marginBottom: 10,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span>📄</span> Final BUILDER Output (ready to export)
            </div>
            <pre style={{
              padding: 14, background: "#0a0a14", borderRadius: 8,
              color: "#c8d0e0", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap",
              wordBreak: "break-word", maxHeight: 600, overflowY: "auto",
              border: "1px solid #1a1a2a", fontFamily: "'JetBrains Mono', Consolas, monospace",
            }}>
              {agentStates.builder.output}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(agentStates.builder.output);
              }}
              style={{
                marginTop: 10, padding: "6px 16px", borderRadius: 6,
                border: "1px solid #2a3a2a", background: "#1a2a1a",
                color: "#5cff8a", cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}>
              Copy to Clipboard
            </button>
          </div>
        )}

        {/* Auditor QC */}
        {pipelineStatus === "done" && agentStates.auditor.output && (
          <div style={{
            background: "#111119", border: "1px solid #2a2a4a", borderRadius: 10,
            padding: "16px 18px",
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "#aab0ff", marginBottom: 10,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span>🛡️</span> AUDITOR QC Report
            </div>
            <pre style={{
              padding: 14, background: "#0a0a14", borderRadius: 8,
              color: "#b0b8d0", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap",
              wordBreak: "break-word", maxHeight: 400, overflowY: "auto",
              border: "1px solid #1a1a2a", fontFamily: "'JetBrains Mono', Consolas, monospace",
            }}>
              {agentStates.auditor.output}
            </pre>
          </div>
        )}

        <div style={{ textAlign: "center", padding: "24px 0 12px", color: "#333", fontSize: 11 }}>
          Each agent runs as an independent API call · No context bleed between agents · Sonnet 4
        </div>
      </div>
    </div>
  );
}
