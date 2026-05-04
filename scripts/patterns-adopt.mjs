#!/usr/bin/env node
/**
 * Adopt a pattern from the Kunida-Patterns-Library into the consumer repo.
 *
 * - Copies pattern files to .cursor/rules/local-borrowed/<pattern-id>/
 * - Records adoption in .cursor/rules/local-borrowed/ADOPTION-LOG.md
 * - Does NOT touch network library (adoption tracking is consumer-side; the
 *   network library's .kunida-pattern.json adoptions[] is updated when the
 *   consumer runs `patterns:publish-adoption` separately)
 *
 * Usage:
 *   npm run patterns:adopt <pattern-id>
 *   npm run patterns:adopt forms/multi-step-quote-form -- --note "Adapted for welding context"
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const patternId = args.find((a) => !a.startsWith("--"));
const note = (() => {
  const idx = args.indexOf("--note");
  return idx >= 0 ? args[idx + 1] : null;
})();

if (!patternId) {
  console.error("Usage: npm run patterns:adopt <pattern-id> [-- --note '...']");
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

function copyDir(src, dst) {
  if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const dstPath = join(dst, entry);
    if (statSync(srcPath).isDirectory()) {
      count += copyDir(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
      count++;
    }
  }
  return count;
}

function main() {
  const pkg = readPackageJson();
  const libraryPath = resolveLibraryPath(pkg.kunidaRules?.patterns);
  const patternSrc = join(libraryPath, "patterns", patternId);

  if (!existsSync(patternSrc)) {
    console.error(`❌ Pattern not found: ${patternId}`);
    console.error(`   Searched: ${patternSrc}`);
    console.error(`   Run "npm run patterns:browse" to see available patterns.`);
    process.exit(1);
  }

  // Read metadata for the adoption log
  const metaPath = join(patternSrc, ".kunida-pattern.json");
  let meta = null;
  if (existsSync(metaPath)) {
    meta = JSON.parse(readFileSync(metaPath, "utf8"));
  }

  // Destination
  const destDir = join(process.cwd(), ".cursor", "rules", "local-borrowed", patternId);

  if (existsSync(destDir)) {
    console.log(`⚠️  Pattern already adopted at ${destDir}`);
    console.log(`   To re-adopt (overwrite), delete first: rm -rf ${destDir}`);
    process.exit(1);
  }

  // Copy pattern
  console.log(`📦 Adopting ${patternId}...`);
  const count = copyDir(patternSrc, destDir);
  console.log(`✅ Copied ${count} file(s) to ${destDir}`);

  // Append to adoption log
  const adoptionLogPath = join(process.cwd(), ".cursor", "rules", "local-borrowed", "ADOPTION-LOG.md");
  const isNew = !existsSync(adoptionLogPath);
  const adoptedAt = new Date().toISOString().split("T")[0];

  let entry = "";
  if (isNew) {
    entry += `# Adopted Patterns Log\n\n`;
    entry += `Patterns adopted from Kunida-Patterns-Library. Each adoption is intentional and attributed.\n\n`;
    entry += `## Precedence\n\n`;
    entry += `Adopted patterns sit in \`.cursor/rules/local-borrowed/\` and are treated as **local rules** (override inherited, but not local-*.mdc).\n\n`;
    entry += `## Adoptions\n\n`;
  }
  entry += `### ${adoptedAt} — ${patternId}\n\n`;
  if (meta) {
    entry += `- **Name:** ${meta.name}\n`;
    entry += `- **Version:** ${meta.version}\n`;
    if (meta.source) entry += `- **Source:** ${meta.source.repo} (${meta.source.publishedAt})\n`;
    if (meta.summary) entry += `- **Summary:** ${meta.summary}\n`;
    if (meta.metrics?.conversionLift) entry += `- **Metric:** ${meta.metrics.conversionLift}\n`;
  }
  entry += `- **Adopted at:** ${adoptedAt}\n`;
  if (note) entry += `- **Note:** ${note}\n`;
  entry += `- **Files:** \`${destDir.replace(process.cwd() + "/", "")}/\`\n\n`;

  if (isNew) {
    writeFileSync(adoptionLogPath, entry);
  } else {
    appendFileSync(adoptionLogPath, entry);
  }
  console.log(`✅ Logged adoption in ${adoptionLogPath}`);

  // Inform user of next steps
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Read the adoption guide: ${destDir}/adoption-guide.md`);
  console.log(`  2. Integrate the pattern files into your repo (likely src/)`);
  console.log(`  3. Customize for your business context (sanitize {{TOKENS}})`);
  console.log(`  4. Test thoroughly`);
  console.log(`  5. Document in your DECISION-LOG with citation to ${patternId}`);
  console.log(`  6. (Optional) Run patterns:publish-adoption to notify network`);
  console.log("");
}

main();
