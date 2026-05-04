#!/usr/bin/env node
/**
 * Browse patterns in the Kunida-Patterns-Library.
 *
 * Reads the consumer repo's `package.json` `kunidaRules.patterns` field to find
 * the library location, then lists available patterns by domain.
 *
 * Usage:
 *   npm run patterns:browse                  # all domains
 *   npm run patterns:browse -- --domain forms
 *   npm run patterns:browse -- --json        # machine-readable
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const domainFilter = (() => {
  const idx = args.indexOf("--domain");
  return idx >= 0 ? args[idx + 1] : null;
})();
const JSON_OUT = args.includes("--json");

function log(msg) {
  if (!JSON_OUT) console.log(msg);
}

function logErr(msg) {
  console.error(`❌ ${msg}`);
}

function readPackageJson() {
  const pkgPath = join(process.cwd(), "package.json");
  if (!existsSync(pkgPath)) {
    logErr("No package.json found. Run from the consumer repo root.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(pkgPath, "utf8"));
}

function resolveLibraryPath(spec) {
  if (!spec) {
    logErr(`No "kunidaRules.patterns" in package.json. Add:`);
    console.error(`
  "kunidaRules": {
    "patterns": "file:../Kunida-Rules-Network/Kunida-Patterns-Library"
    // or "github:kunidadesigns/Kunida-Patterns-Library#main"
  }
`);
    process.exit(1);
  }

  if (spec.startsWith("file:")) {
    return resolve(process.cwd(), spec.replace(/^file:/, ""));
  }

  if (spec.startsWith("github:")) {
    const match = spec.match(/^github:([^/]+)\/([^#]+)(?:#(.+))?$/);
    if (!match) {
      logErr(`Invalid github: spec: ${spec}`);
      process.exit(1);
    }
    const [, owner, repo, branch = "main"] = match;
    const tmpDir = join("/tmp", `kunida-patterns-${Date.now()}`);
    if (!JSON_OUT) console.log(`Cloning ${owner}/${repo}#${branch} (shallow)...`);
    try {
      execSync(`git clone --depth 1 --branch ${branch} https://github.com/${owner}/${repo}.git ${tmpDir}`, {
        stdio: "pipe",
      });
      return tmpDir;
    } catch (err) {
      logErr(`Failed to clone: ${err.message}`);
      process.exit(1);
    }
  }

  return spec; // raw path
}

function readPatternMeta(patternDir) {
  const metaPath = join(patternDir, ".kunida-pattern.json");
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

function listDomain(patternsDir, domain) {
  const domainDir = join(patternsDir, domain);
  if (!existsSync(domainDir)) return [];
  const patterns = [];
  for (const entry of readdirSync(domainDir)) {
    const entryPath = join(domainDir, entry);
    if (!statSync(entryPath).isDirectory()) continue;
    const meta = readPatternMeta(entryPath);
    if (meta) patterns.push(meta);
  }
  return patterns;
}

function main() {
  const pkg = readPackageJson();
  const config = pkg.kunidaRules || {};
  const libraryPath = resolveLibraryPath(config.patterns);
  const patternsDir = join(libraryPath, "patterns");

  if (!existsSync(patternsDir)) {
    logErr(`Patterns directory not found: ${patternsDir}`);
    process.exit(1);
  }

  const domains = domainFilter
    ? [domainFilter]
    : readdirSync(patternsDir).filter((d) => statSync(join(patternsDir, d)).isDirectory());

  const result = {};
  for (const domain of domains) {
    const patterns = listDomain(patternsDir, domain);
    if (patterns.length > 0) result[domain] = patterns;
  }

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  // Human-readable output
  log("");
  log("═══════════════════════════════════════════════════════════════");
  log("  Kunida Patterns Library — Browse");
  log("═══════════════════════════════════════════════════════════════");

  if (Object.keys(result).length === 0) {
    log("");
    log("  No patterns published yet.");
    log("");
    log("  See patterns/INDEX.md for what's expected to be published.");
    log("  To publish your pattern: npm run patterns:publish -- ...");
    log("");
    return;
  }

  for (const [domain, patterns] of Object.entries(result)) {
    log("");
    log(`  📁 ${domain.toUpperCase()} (${patterns.length})`);
    log("  ─────────────────────────────────────────────────────────────");
    for (const p of patterns) {
      log(`    • ${p.id || domain + "/" + p.name} — ${p.summary || "(no summary)"}`);
      if (p.source?.repo) {
        log(`      from: ${p.source.repo} (${p.source.publishedAt || "unknown date"})`);
      }
      if (p.metrics?.conversionLift) {
        log(`      metric: ${p.metrics.conversionLift} ${p.metrics.testPeriod ? `(${p.metrics.testPeriod})` : ""}`);
      }
      if (p.adoptions?.length) {
        log(`      adopted by: ${p.adoptions.map((a) => a.repo).join(", ")}`);
      }
    }
  }

  log("");
  log("  To see a pattern's details: npm run patterns:show <id>");
  log("  To adopt a pattern:         npm run patterns:adopt <id>");
  log("");
}

main();
