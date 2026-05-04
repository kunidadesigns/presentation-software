#!/usr/bin/env node
/**
 * Publish a consumer-side RCA to the network learnings index.
 *
 * Reads the RCA from the consumer's docs/ops/DECISION-LOG.md by ID, sanitizes
 * business-specific data, and adds an entry to learnings/network-rcas.json
 * in the Kunida-Patterns-Library.
 *
 * Usage:
 *   npm run learnings:publish -- --rca-id RCA-200
 *   npm run learnings:publish -- --rca-id RCA-200 --category git-health
 *   npm run learnings:publish -- --rca-id RCA-200 --lateral-candidates "ASBWeldingPros,MMKRemodel"
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);

function getArg(name, fallback = null) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : fallback;
}

const rcaId = getArg("rca-id");
if (!rcaId) {
  console.error("Usage: npm run learnings:publish -- --rca-id RCA-NNN");
  process.exit(1);
}

function readPackageJson() {
  const pkgPath = join(process.cwd(), "package.json");
  return JSON.parse(readFileSync(pkgPath, "utf8"));
}

function resolveLibraryPath(spec) {
  if (!spec) {
    console.error('❌ No "kunidaRules.patterns" in package.json.');
    process.exit(1);
  }
  if (spec.startsWith("file:")) {
    return resolve(process.cwd(), spec.replace(/^file:/, ""));
  }
  console.error("❌ Publishing learnings requires a writable patterns library (file: spec).");
  process.exit(1);
}

function extractRcaFromDecisionLog(rcaId) {
  const logPath = join(process.cwd(), "docs", "ops", "DECISION-LOG.md");
  if (!existsSync(logPath)) {
    console.error(`❌ docs/ops/DECISION-LOG.md not found.`);
    process.exit(1);
  }

  const content = readFileSync(logPath, "utf8");
  const lines = content.split("\n");

  // Find the line with this RCA-ID
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`RCA-ID:** ${rcaId}`) || lines[i].includes(`RCA-ID: ${rcaId}`)) {
      // Walk backwards to find the entry start (a line starting with "- **YYYY-MM-DD")
      for (let j = i; j >= 0; j--) {
        if (/^- \*\*\d{4}-\d{2}-\d{2}/.test(lines[j])) {
          startIdx = j;
          break;
        }
      }
      break;
    }
  }

  if (startIdx === -1) {
    console.error(`❌ RCA ${rcaId} not found in DECISION-LOG.md`);
    process.exit(1);
  }

  // Find end (next "- **YYYY-MM-DD" or end of file)
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^- \*\*\d{4}-\d{2}-\d{2}/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  const entryLines = lines.slice(startIdx, endIdx);
  const entryText = entryLines.join("\n");

  // Parse out fields
  const titleMatch = entryLines[0].match(/\*\*(\d{4}-\d{2}-\d{2}):\*\*\s*(.+?)$/);
  const date = titleMatch?.[1] || "";
  const title = titleMatch?.[2]?.trim() || "";

  const fieldRegex = (label) => {
    const m = entryText.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+(?:\\n\\s+[^\\-\\*][^\\n]*)*)`));
    return m ? m[1].trim().replace(/\s+/g, " ") : "";
  };

  return {
    rcaId,
    date,
    title,
    rootCause: fieldRegex("Root cause"),
    fix: fieldRegex("Correction") || fieldRegex("Change"),
    prevention: fieldRegex("Prevention \\(PIP\\)") || fieldRegex("Prevention"),
    summary: title,
    rawEntry: entryText,
  };
}

function main() {
  const pkg = readPackageJson();
  const libraryPath = resolveLibraryPath(pkg.kunidaRules?.patterns);

  const rca = extractRcaFromDecisionLog(rcaId);

  const sourceRepo = pkg.name;
  const category = getArg("category", "uncategorized");
  const lateralCandidates = (getArg("lateral-candidates", "") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const tags = (getArg("tags", "") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const learningsPath = join(libraryPath, "learnings", "network-rcas.json");
  const data = existsSync(learningsPath)
    ? JSON.parse(readFileSync(learningsPath, "utf8"))
    : { version: "1.0.0", lastUpdated: new Date().toISOString().split("T")[0], rcas: [] };

  // Check for duplicate
  const dupe = data.rcas.find((r) => r.rcaId === rcaId && r.repo === sourceRepo);
  if (dupe) {
    console.error(`❌ ${rcaId} from ${sourceRepo} already published.`);
    console.error(`   To update, edit ${learningsPath} directly.`);
    process.exit(1);
  }

  const newEntry = {
    rcaId,
    repo: sourceRepo,
    date: rca.date,
    title: rca.title,
    summary: rca.summary,
    category,
    rootCause: rca.rootCause,
    fix: rca.fix,
    prevention: rca.prevention,
    appliedTo: [sourceRepo],
    lateralCandidates,
    tags,
    publishedAt: new Date().toISOString(),
  };

  data.rcas.push(newEntry);
  data.lastUpdated = new Date().toISOString().split("T")[0];

  writeFileSync(learningsPath, JSON.stringify(data, null, 2) + "\n");
  console.log(`✅ Published ${rcaId} from ${sourceRepo} to network-rcas.json`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Review the entry in ${learningsPath}`);
  console.log(`  2. Update learnings/INDEX.md with a row in the appropriate theme`);
  console.log(`  3. Commit + push the patterns library`);
  console.log(`  4. Notify lateral candidates: ${lateralCandidates.join(", ") || "(none specified)"}`);
  console.log("");
}

main();
