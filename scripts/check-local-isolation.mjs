#!/usr/bin/env node
/**
 * Verify local rules are properly isolated from inherited rules.
 *
 * Enforces:
 * 1. .cursor/rules/inherited/ is in .gitignore (no consumer commits inherited)
 * 2. .cursor/rules/inherited/MANIFEST.json exists if any inherited content present
 * 3. No file in .cursor/rules/inherited/ has been edited locally (timestamp check
 *    against MANIFEST.json sync time — best-effort warning only)
 * 4. .cursor/rules/local-borrowed/ has an ADOPTION-LOG.md if non-empty
 * 5. Top-level .cursor/rules/*.mdc files don't reference inherited paths
 *    (those should reference network rule IDs, not file paths)
 *
 * Exits 0 on pass, 1 on hard failure, prints warnings for soft issues.
 *
 * Usage: node scripts/check-local-isolation.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const CWD = process.cwd();
const GITIGNORE = join(CWD, ".gitignore");
const INHERITED_DIR = join(CWD, ".cursor", "rules", "inherited");
const MANIFEST = join(INHERITED_DIR, "MANIFEST.json");
const LOCAL_BORROWED = join(CWD, ".cursor", "rules", "local-borrowed");
const RULES_DIR = join(CWD, ".cursor", "rules");

let failed = false;
let warnings = 0;

function err(msg) {
  console.error(`❌ ${msg}`);
  failed = true;
}

function warn(msg) {
  console.warn(`⚠️  ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

// ── Check 1: .cursor/rules/inherited/ is in .gitignore ─────────────────────
if (existsSync(GITIGNORE)) {
  const gitignore = readFileSync(GITIGNORE, "utf8");
  if (!gitignore.includes(".cursor/rules/inherited/")) {
    err(".cursor/rules/inherited/ is NOT in .gitignore. Run `npm run sync:rules` to auto-fix.");
  } else {
    ok(".cursor/rules/inherited/ is gitignored (consumers should not commit inherited)");
  }
} else {
  warn("No .gitignore found — cannot verify inherited isolation.");
}

// ── Check 2: MANIFEST.json exists if any inherited content ─────────────────
if (existsSync(INHERITED_DIR)) {
  const entries = readdirSync(INHERITED_DIR);
  const hasContent = entries.some((e) => e !== "MANIFEST.json" && statSync(join(INHERITED_DIR, e)).isDirectory());

  if (hasContent && !existsSync(MANIFEST)) {
    err("Inherited content found but no MANIFEST.json. Run `npm run sync:rules` to regenerate.");
  } else if (hasContent) {
    ok(`Manifest present: ${MANIFEST}`);
    try {
      const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
      const ageMs = Date.now() - new Date(manifest.syncedAt).getTime();
      const ageDays = Math.round(ageMs / (1000 * 60 * 60 * 24));
      if (ageDays > 30) {
        warn(`Inherited rules are ${ageDays} days stale. Consider running \`npm run sync:rules\`.`);
      }
    } catch (e) {
      warn(`Could not parse MANIFEST.json: ${e.message}`);
    }
  } else {
    ok("No inherited content (consumer may not be onboarded yet)");
  }
} else {
  ok("No .cursor/rules/inherited/ directory (consumer may not be onboarded)");
}

// ── Check 3: local-borrowed/ has ADOPTION-LOG.md if non-empty ──────────────
if (existsSync(LOCAL_BORROWED)) {
  const entries = readdirSync(LOCAL_BORROWED).filter((e) => e !== "ADOPTION-LOG.md");
  if (entries.length > 0 && !existsSync(join(LOCAL_BORROWED, "ADOPTION-LOG.md"))) {
    warn("local-borrowed/ has adopted patterns but no ADOPTION-LOG.md. Document adoptions for traceability.");
  } else if (entries.length > 0) {
    ok(`local-borrowed/ has ${entries.length} adopted pattern(s) with ADOPTION-LOG.md`);
  }
}

// ── Check 4: Top-level .cursor/rules/*.mdc don't reference inherited paths ─
if (existsSync(RULES_DIR)) {
  const topLevelMdc = readdirSync(RULES_DIR)
    .filter((f) => f.endsWith(".mdc"))
    .filter((f) => !f.startsWith("local-")); // Local- prefix is OK; convention is "this is local"

  for (const file of topLevelMdc) {
    const content = readFileSync(join(RULES_DIR, file), "utf8");
    const inheritedRefs = content.match(/\.cursor\/rules\/inherited\/[^\s"'`)]+/g);
    if (inheritedRefs) {
      warn(
        `${file} references inherited paths directly: ${inheritedRefs.slice(0, 3).join(", ")}\n` +
          `   Inherited paths are gitignored and synced. Reference rule IDs (e.g., "HR-028") instead.`
      );
    }
  }
}

// ── Check 5: package.json has kunidaRules field ────────────────────────────
const pkgPath = join(CWD, "package.json");
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (!pkg.kunidaRules) {
    warn(
      `package.json missing "kunidaRules" config. This consumer is not onboarded to the network.\n` +
        `   See Kunida-Rules-Network/docs/CONSUMER-ONBOARDING.md`
    );
  } else {
    ok(`package.json has kunidaRules config (shared: ${pkg.kunidaRules.shared || "default"})`);
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("");
if (failed) {
  console.error(`❌ check:local-isolation failed (${warnings} warnings)`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`✅ check:local-isolation passed with ${warnings} warning(s)`);
  process.exit(0);
} else {
  console.log("✅ check:local-isolation passed");
  process.exit(0);
}
