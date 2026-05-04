#!/usr/bin/env node
/**
 * Detect contradictions between network-mandated policy and local repo state.
 *
 * Catches the contamination class of bug discovered in RCA-203 / RCA-204 /
 * RCA-205, where the network's default .gitignore exclusions silently
 * overrode an intentional local tracking policy (e.g. HR-010).
 *
 * Audits performed:
 *   1. Files .gitignore excludes but Git is still tracking.
 *      → Hard fail (state lies; either opt-out or git rm --cached).
 *   2. Network-default exclusion that the repo hasn't acted on but a tracked
 *      file with the same path exists.
 *      → Warning; suggest opt-out file entry.
 *   3. .kunida-gitignore-optout.json entries that no longer match anything
 *      in current network defaults.
 *      → Notice (no-op opt-outs are harmless but clutter the audit trail).
 *   4. Consumer's .gitignore has commented-out network entries with no
 *      corresponding opt-out (silent override).
 *      → Warning; nudge to formalize the override.
 *
 * Exits 0 on pass (warnings allowed), 1 on hard failure.
 *
 * Usage: node scripts/check-network-policy-conflicts.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const CWD = process.cwd();
const GITIGNORE = join(CWD, ".gitignore");
const OPTOUT = join(CWD, ".kunida-gitignore-optout.json");
const SYNC_RULES = join(CWD, "scripts", "sync-rules.mjs");

let failed = false;
let warnings = 0;
let notices = 0;

const err = (m) => {
  console.error(`❌ ${m}`);
  failed = true;
};
const warn = (m) => {
  console.warn(`⚠️  ${m}`);
  warnings++;
};
const note = (m) => {
  console.log(`ℹ️  ${m}`);
  notices++;
};
const ok = (m) => console.log(`✅ ${m}`);

// ── Extract REQUIRED list from sync-rules.mjs (single source of truth) ─────
function getNetworkDefaults() {
  if (!existsSync(SYNC_RULES)) return [];
  const src = readFileSync(SYNC_RULES, "utf8");
  // Match: const REQUIRED = [ ... ];
  const m = src.match(/const\s+REQUIRED\s*=\s*\[([\s\S]*?)\];/);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((mm) => mm[1]);
}

const REQUIRED = getNetworkDefaults();
if (REQUIRED.length === 0) {
  warn("Could not parse REQUIRED list from scripts/sync-rules.mjs — skipping policy audit.");
  process.exit(0);
}
ok(`Network defaults parsed (${REQUIRED.length} required exclusion${REQUIRED.length === 1 ? "" : "s"})`);

// ── Load opt-outs ──────────────────────────────────────────────────────────
let optOuts = [];
if (existsSync(OPTOUT)) {
  try {
    const data = JSON.parse(readFileSync(OPTOUT, "utf8"));
    optOuts = (data.optOuts || []).map((o) => o.path);
    ok(`.kunida-gitignore-optout.json: ${optOuts.length} opt-out(s)`);
  } catch (e) {
    err(`.kunida-gitignore-optout.json is invalid JSON: ${e.message}`);
    process.exit(1);
  }
}

// ── Load .gitignore content (line-aware) ───────────────────────────────────
let activeIgnoreLines = [];
let commentedIgnoreLines = [];
if (existsSync(GITIGNORE)) {
  const lines = readFileSync(GITIGNORE, "utf8").split("\n").map((l) => l.trim());
  activeIgnoreLines = lines.filter((l) => l && !l.startsWith("#"));
  commentedIgnoreLines = lines.filter((l) => l.startsWith("#"));
}
const isActivelyExcluded = (p) =>
  activeIgnoreLines.some((line) => line === p || line === p.replace(/\/$/, ""));

// ── Audit 1: tracked files that .gitignore says to exclude ─────────────────
let conflictsFound = 0;
let trackedFiles = [];
try {
  trackedFiles = execSync("git ls-files", { cwd: CWD, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
} catch {
  warn("Could not run `git ls-files` — skipping tracked-vs-ignored audit.");
}

for (const path of REQUIRED) {
  if (!isActivelyExcluded(path)) continue;
  const matchesTracked = trackedFiles.filter((f) => {
    if (path.endsWith("/")) return f.startsWith(path);
    return f === path;
  });
  if (matchesTracked.length > 0) {
    err(
      `Tracked vs ignored CONFLICT for "${path}":\n` +
        `   .gitignore excludes it, but ${matchesTracked.length} file(s) are tracked:\n` +
        matchesTracked.slice(0, 3).map((f) => `     - ${f}`).join("\n") +
        (matchesTracked.length > 3 ? `\n     ... and ${matchesTracked.length - 3} more` : "") +
        `\n   Resolve via either:\n` +
        `     A) git rm --cached <files>  (align with exclusion), OR\n` +
        `     B) Remove the .gitignore entry + add an opt-out to .kunida-gitignore-optout.json`
    );
    conflictsFound++;
  }
}
if (conflictsFound === 0) ok("No tracked-vs-ignored conflicts");

// ── Audit 2: opt-out entries that don't match any network default ──────────
const noopOptOuts = optOuts.filter((p) => !REQUIRED.includes(p));
if (noopOptOuts.length > 0) {
  note(
    `${noopOptOuts.length} opt-out(s) no longer match a network default (likely defensive ` +
      `holdovers from earlier policy):\n` +
      noopOptOuts.map((p) => `     - ${p}`).join("\n") +
      `\n   These are harmless but can be removed for clarity (network won't try to add them).`
  );
}

// ── Audit 3: silently commented network entries ────────────────────────────
const silentlyCommented = REQUIRED.filter(
  (p) =>
    !isActivelyExcluded(p) &&
    !optOuts.includes(p) &&
    commentedIgnoreLines.some((l) => l.includes(p))
);
if (silentlyCommented.length > 0) {
  warn(
    `${silentlyCommented.length} network exclusion(s) commented out without an opt-out file ` +
      `entry:\n` +
      silentlyCommented.map((p) => `     - ${p}`).join("\n") +
      `\n   Add to .kunida-gitignore-optout.json with a documented reason, or remove the ` +
      `comment. Silent overrides break the audit trail.`
  );
}

// ── Audit 4: missing required exclusions (not opted-out, not in .gitignore) ─
const missing = REQUIRED.filter(
  (p) => !isActivelyExcluded(p) && !optOuts.includes(p)
);
if (missing.length > 0) {
  warn(
    `${missing.length} network-required exclusion(s) missing from .gitignore (no opt-out ` +
      `either):\n` +
      missing.map((p) => `     - ${p}`).join("\n") +
      `\n   Run \`npm run sync:rules\` to add them, or document the override in ` +
      `.kunida-gitignore-optout.json.`
  );
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("");
if (failed) {
  console.error(`❌ check:network-policy-conflicts FAILED (${warnings} warning${warnings === 1 ? "" : "s"}, ${notices} notice${notices === 1 ? "" : "s"})`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`✅ check:network-policy-conflicts passed with ${warnings} warning${warnings === 1 ? "" : "s"}`);
  process.exit(0);
} else {
  console.log(`✅ check:network-policy-conflicts passed${notices ? ` (${notices} notice${notices === 1 ? "" : "s"})` : ""}`);
  process.exit(0);
}
