#!/usr/bin/env node
/**
 * check-rule-duplication.mjs
 *
 * Network-side audit: scans a consumer repo's local rule files (.cursorrules,
 * AGENTS.md, .cursor/rules/*.mdc that are NOT inside .cursor/rules/inherited/
 * and NOT prefixed `local-` / inside `local-borrowed/`) for HR-* / HDR-* / CAP:*
 * markers that ALSO appear in the consumer's inherited content
 * (.cursor/rules/inherited/**). Warns on duplication so consumer .cursorrules
 * doesn't drift back to copy-paste of network rules.
 *
 * Exit code:
 *   0 — clean (no duplicates) or warnings only (--strict not set)
 *   1 — duplicates found and --strict is set
 *
 * Usage:
 *   node scripts/check-rule-duplication.mjs [consumer-repo-path] [--strict] [--json]
 *
 * Prevents recurrence of RCA-206 (consumer .cursorrules accumulating duplicate
 * rule descriptions over time).
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const jsonOut = args.includes("--json");
const consumerRoot =
  args.find((a) => !a.startsWith("--")) || process.cwd();

if (!existsSync(consumerRoot)) {
  console.error(`✗ Consumer repo not found: ${consumerRoot}`);
  process.exit(1);
}

const cursorRulesDir = join(consumerRoot, ".cursor", "rules");
const inheritedDir = join(cursorRulesDir, "inherited");
const localBorrowedDir = join(cursorRulesDir, "local-borrowed");

function readDirRecursive(dir, predicate = () => true) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...readDirRecursive(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

// Files that are canonical local long-form rule registries by design.
// These are EXPECTED to expand rules locally; do not flag them.
const CANONICAL_LOCAL_REGISTRY_BASENAMES = new Set([
  "HARD-RULES-DATABASE.md",
  "HARD-RULES-QUICK-REFERENCE.md",
  "HOW-I-ENSURE-HARD-RULES.md",
  "rule-coverage.json",
]);

function isLocalRuleFile(p) {
  if (p.startsWith(inheritedDir)) return false;
  if (p.startsWith(localBorrowedDir)) return false;
  const name = basename(p);
  if (name.startsWith("local-")) return false;
  if (CANONICAL_LOCAL_REGISTRY_BASENAMES.has(name)) return false;
  return /\.(md|mdc)$/i.test(p);
}

function isInheritedRuleFile(p) {
  if (!p.startsWith(inheritedDir)) return false;
  return /\.(md|mdc|cursorrules)$/i.test(p) || basename(p) === ".cursorrules";
}

const localFiles = [];
const cursorrulesPath = join(consumerRoot, ".cursorrules");
if (existsSync(cursorrulesPath)) localFiles.push(cursorrulesPath);
const agentsPath = join(consumerRoot, "AGENTS.md");
if (existsSync(agentsPath)) localFiles.push(agentsPath);
if (existsSync(cursorRulesDir)) {
  localFiles.push(...readDirRecursive(cursorRulesDir, isLocalRuleFile));
}

const inheritedFiles = readDirRecursive(inheritedDir, () => true).filter(
  (p) =>
    /\.(md|mdc)$/i.test(p) ||
    basename(p) === ".cursorrules" ||
    basename(p) === "AGENTS.md",
);

if (inheritedFiles.length === 0) {
  console.log(
    `[check:rule-duplication] No inherited rules found at ${inheritedDir}`,
  );
  console.log("[check:rule-duplication] Run `npm run sync:rules` first.");
  process.exit(0);
}

const inheritedCorpus = inheritedFiles
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const MARKER_RE = /\b(HR|HDR|UI-OS|CRO|RCA|HR-OS|FE)-\d{2,4}\b|\bCAP:[A-Z0-9_]+\b/g;

function extractMarkers(text) {
  const set = new Set();
  let m;
  while ((m = MARKER_RE.exec(text)) !== null) set.add(m[0]);
  return set;
}

const inheritedMarkers = extractMarkers(inheritedCorpus);

const findings = [];
for (const file of localFiles) {
  const text = readFileSync(file, "utf8");
  const localMarkers = extractMarkers(text);
  const overlap = [...localMarkers].filter((m) => inheritedMarkers.has(m));
  if (overlap.length === 0) continue;

  for (const marker of overlap) {
    const localCount = (text.match(new RegExp(`\\b${escape(marker)}\\b`, "g")) || []).length;
    const inheritedCount = (
      inheritedCorpus.match(new RegExp(`\\b${escape(marker)}\\b`, "g")) || []
    ).length;

    const localExpansions = countExpansions(text, marker);
    if (localExpansions > 0) {
      findings.push({
        file: relative(consumerRoot, file),
        marker,
        localCount,
        inheritedCount,
        localExpansions,
      });
    }
  }
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A "true expansion" of a rule is multi-line rule text following the marker.
// Heuristics:
//   - The marker line itself includes either "hard rule" or rule text > 80 chars;
//   - AND the next non-empty line continues the rule (bullet, prose, or sub-clause);
//   - References like "HR-002 (inherited shared)" or short index entries are NOT counted.
// Lines containing markers tagged `(<repo>-local)` or `(local)` are explicit
// local overrides — these ARE allowed and not flagged.
function countExpansions(text, marker) {
  const lines = text.split(/\r?\n/);
  let count = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes(marker)) continue;
    const after = line.split(marker).slice(1).join(marker);
    const trimmed = after.trim();

    // Skip explicit local overrides
    if (/\((?:[A-Za-z]+-)?local\)/i.test(trimmed)) continue;
    // Skip pointers / references — line mentions inherited tier or "lives in" / "covered by" / "see <file>"
    if (/\binherited\b/i.test(line)) continue;
    if (/\b(?:lives? in|covered by|see\s+`|see\s+§|defined in|cross[- ]reference|already enforced|enforced by|enforces?|per\s+HR|under\s+HR)\b/i.test(line)) continue;
    // Skip table rows
    if (/^\s*\|/.test(line)) continue;
    // Skip the index/quick-reference table footer lines (ALL-CAPS marker + " — " + short summary)
    if (/^\s*[-*]\s+\*\*[A-Z-]+-\d+\*\*\s*\(inherited/i.test(line)) continue;

    const looksLikeExpansion =
      /\bhard rule\b/i.test(trimmed) ||
      (trimmed.length > 80 && !/^[\s.,:;)\]]/.test(trimmed));
    if (!looksLikeExpansion) continue;

    let nextNonEmpty = "";
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j += 1) {
      if (lines[j].trim()) {
        nextNonEmpty = lines[j];
        break;
      }
    }
    const continuesRule =
      /^\s*(?:[-*]|\d+\.|>|[A-Z(])/.test(nextNonEmpty) ||
      nextNonEmpty.length > 60;
    if (continuesRule) count += 1;
  }
  return count;
}

if (jsonOut) {
  console.log(
    JSON.stringify(
      {
        consumer: consumerRoot,
        inheritedFiles: inheritedFiles.length,
        localFiles: localFiles.length,
        findings,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `[check:rule-duplication] Consumer: ${consumerRoot}`,
  );
  console.log(
    `[check:rule-duplication] Local rule files: ${localFiles.length} | Inherited rule files: ${inheritedFiles.length}`,
  );
  console.log(
    `[check:rule-duplication] Inherited markers detected: ${inheritedMarkers.size}`,
  );

  if (findings.length === 0) {
    console.log("✅ No duplicate rule expansions found in local rule files.");
    process.exit(0);
  }

  console.log(
    `\n⚠️  ${findings.length} potential duplicate rule expansion(s) found:`,
  );
  for (const f of findings) {
    console.log(
      `  • ${f.file} :: ${f.marker} — local expansions: ${f.localExpansions} (also defined in inherited corpus)`,
    );
  }
  console.log("\nGuidance:");
  console.log(
    "  • If the marker is fully covered by inherited content, replace the local expansion with a one-line reference.",
  );
  console.log(
    "  • If the local copy adds repo-specific facts/locks/tokens, mark it `(BGF-local)` / `(MMK-local)` etc. and keep it as an explicit override.",
  );
  console.log(
    "  • If the rule is genuinely duplicated, slim the local file (see RCA-206 / RCA-207).",
  );
}

if (strict && findings.length > 0) {
  process.exit(1);
}
process.exit(0);
