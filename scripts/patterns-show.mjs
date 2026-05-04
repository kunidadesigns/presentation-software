#!/usr/bin/env node
/**
 * Show full details of a pattern in the Kunida-Patterns-Library.
 *
 * Usage:
 *   npm run patterns:show <pattern-id>
 *   e.g., npm run patterns:show forms/multi-step-quote-form
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const patternId = args.find((a) => !a.startsWith("--"));

if (!patternId) {
  console.error("Usage: npm run patterns:show <pattern-id>");
  console.error("Example: npm run patterns:show forms/multi-step-quote-form");
  process.exit(1);
}

function readPackageJson() {
  const pkgPath = join(process.cwd(), "package.json");
  if (!existsSync(pkgPath)) {
    console.error("❌ No package.json found.");
    process.exit(1);
  }
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
  if (spec.startsWith("github:")) {
    const match = spec.match(/^github:([^/]+)\/([^#]+)(?:#(.+))?$/);
    const [, owner, repo, branch = "main"] = match;
    const tmpDir = join("/tmp", `kunida-patterns-${Date.now()}`);
    execSync(`git clone --depth 1 --branch ${branch} https://github.com/${owner}/${repo}.git ${tmpDir}`, { stdio: "pipe" });
    return tmpDir;
  }
  return spec;
}

function main() {
  const pkg = readPackageJson();
  const libraryPath = resolveLibraryPath(pkg.kunidaRules?.patterns);
  const patternDir = join(libraryPath, "patterns", patternId);

  if (!existsSync(patternDir) || !statSync(patternDir).isDirectory()) {
    console.error(`❌ Pattern not found: ${patternId}`);
    console.error(`Run "npm run patterns:browse" to see available patterns.`);
    process.exit(1);
  }

  const metaPath = join(patternDir, ".kunida-pattern.json");
  const readmePath = join(patternDir, "README.md");
  const adoptionPath = join(patternDir, "adoption-guide.md");

  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  ${patternId}`);
  console.log("═══════════════════════════════════════════════════════════════");

  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    console.log("");
    console.log(`  Name:    ${meta.name}`);
    console.log(`  Version: ${meta.version}`);
    console.log(`  Domain:  ${meta.domain}`);
    if (meta.source) {
      console.log(`  Source:  ${meta.source.repo} (${meta.source.publishedAt})`);
      if (meta.source.rcaId) console.log(`           RCA: ${meta.source.rcaId}`);
    }
    if (meta.summary) console.log(`  Summary: ${meta.summary}`);
    if (meta.metrics) {
      console.log("");
      console.log("  Metrics:");
      for (const [k, v] of Object.entries(meta.metrics)) {
        console.log(`    ${k}: ${v}`);
      }
    }
    if (meta.compatibility) {
      console.log("");
      console.log("  Compatibility:");
      console.log(`    stacks: ${(meta.compatibility.stacks || []).join(", ")}`);
      if (meta.compatibility.dependencies?.length) {
        console.log(`    deps:   ${meta.compatibility.dependencies.join(", ")}`);
      }
    }
    if (meta.adoptions?.length) {
      console.log("");
      console.log("  Adoptions:");
      for (const a of meta.adoptions) {
        console.log(`    - ${a.repo} (${a.adoptedAt}, v${a.version})`);
      }
    }
  }

  if (existsSync(readmePath)) {
    console.log("");
    console.log("  ── README ──────────────────────────────────────────────────");
    console.log("");
    console.log(readFileSync(readmePath, "utf8").split("\n").map((l) => "  " + l).join("\n"));
  }

  console.log("");
  console.log("  Files in this pattern:");
  for (const file of readdirSync(patternDir)) {
    console.log(`    ${file}`);
  }

  if (existsSync(adoptionPath)) {
    console.log("");
    console.log("  ── Adoption guide available: adoption-guide.md ─────────────");
  }

  console.log("");
  console.log(`  To adopt: npm run patterns:adopt ${patternId}`);
  console.log("");
}

main();
