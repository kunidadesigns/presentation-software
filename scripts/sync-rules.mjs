#!/usr/bin/env node
/**
 * Kunida Rules Sync — Consumer Repo Side
 *
 * Pulls latest rules from Kunida-Shared-Business-Rules and the appropriate stack core
 * (Astro or WordPress) into the consumer repo's `.cursor/rules/inherited/` directory.
 *
 * Reads `kunidaRules` field from `package.json`:
 *   {
 *     "kunidaRules": {
 *       "shared": "github:kunidadesigns/Kunida-Shared-Business-Rules#main",
 *       "stack": "github:kunidadesigns/Kunida-Astro-Rules-Core#main",
 *       "version": "1.0.0"
 *     }
 *   }
 *
 * For local development, supports filesystem paths:
 *   {
 *     "kunidaRules": {
 *       "shared": "file:../Kunida-Rules-Network/Kunida-Shared-Business-Rules",
 *       "stack": "file:../Kunida-Rules-Network/Kunida-Astro-Rules-Core",
 *       "version": "1.0.0"
 *     }
 *   }
 *
 * Usage:
 *   npm run sync:rules
 *   npm run sync:rules -- --dry-run     # preview changes
 *   npm run sync:rules -- --force       # overwrite local-experiments.mdc backup
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[sync-rules] ${msg}`);
}

function logErr(msg) {
  console.error(`[sync-rules] ❌ ${msg}`);
}

function logOk(msg) {
  console.log(`[sync-rules] ✅ ${msg}`);
}

function logWarn(msg) {
  console.warn(`[sync-rules] ⚠️  ${msg}`);
}

function readPackageJson() {
  const pkgPath = join(process.cwd(), "package.json");
  if (!existsSync(pkgPath)) {
    logErr("No package.json found. Run from the consumer repo root.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(pkgPath, "utf8"));
}

function resolveSource(spec) {
  // Accepts:
  //   "github:owner/repo#branch"
  //   "file:relative/path"
  //   "/absolute/path"
  //   "https://github.com/owner/repo.git"

  if (spec.startsWith("file:")) {
    const path = spec.replace(/^file:/, "");
    return { type: "file", path: resolve(process.cwd(), path) };
  }

  if (spec.startsWith("/")) {
    return { type: "file", path: spec };
  }

  if (spec.startsWith("github:")) {
    const match = spec.match(/^github:([^/]+)\/([^#]+)(?:#(.+))?$/);
    if (!match) {
      logErr(`Invalid github: spec: ${spec}`);
      process.exit(1);
    }
    const [, owner, repo, branch = "main"] = match;
    return {
      type: "git",
      url: `https://github.com/${owner}/${repo}.git`,
      branch,
    };
  }

  if (spec.startsWith("https://") || spec.startsWith("git@")) {
    return { type: "git", url: spec, branch: "main" };
  }

  logErr(`Unknown source spec format: ${spec}`);
  process.exit(1);
}

function fetchFromGit(source) {
  const tmpDir = join("/tmp", `kunida-rules-${Date.now()}`);
  log(`Cloning ${source.url} to ${tmpDir} (shallow, branch ${source.branch})`);
  if (DRY_RUN) {
    log("[dry-run] Would clone repo");
    return null;
  }
  try {
    execSync(`git clone --depth 1 --branch ${source.branch} ${source.url} ${tmpDir}`, {
      stdio: "pipe",
    });
    return tmpDir;
  } catch (err) {
    logErr(`Failed to clone: ${err.message}`);
    process.exit(1);
  }
}

function copyRules(sourceDir, destDir, label) {
  if (!existsSync(sourceDir)) {
    logWarn(`Source ${sourceDir} does not exist. Skipping ${label}.`);
    return 0;
  }

  // Files to sync
  const items = [
    { src: ".cursorrules", dst: ".cursorrules" },
    { src: "rules", dst: "rules", isDir: true },
    { src: "scripts", dst: "scripts", isDir: true },
  ];

  let count = 0;
  for (const item of items) {
    const srcPath = join(sourceDir, item.src);
    const dstPath = join(destDir, item.dst);

    if (!existsSync(srcPath)) continue;

    if (item.isDir) {
      if (!existsSync(dstPath)) {
        if (!DRY_RUN) mkdirSync(dstPath, { recursive: true });
      }
      const files = readdirSync(srcPath);
      for (const file of files) {
        const fileSrc = join(srcPath, file);
        const fileDst = join(dstPath, file);
        if (statSync(fileSrc).isFile()) {
          if (DRY_RUN) {
            log(`[dry-run] Would copy ${file} → ${fileDst}`);
          } else {
            copyFileSync(fileSrc, fileDst);
          }
          count++;
        }
      }
    } else {
      if (DRY_RUN) {
        log(`[dry-run] Would copy ${item.src} → ${dstPath}`);
      } else {
        copyFileSync(srcPath, dstPath);
      }
      count++;
    }
  }

  logOk(`${label}: synced ${count} file(s)`);
  return count;
}

function ensureGitignoreExclusions() {
  const gitignorePath = join(process.cwd(), ".gitignore");
  if (!existsSync(gitignorePath)) {
    logWarn("No .gitignore found in consumer repo. Creating one.");
    if (!DRY_RUN) writeFileSync(gitignorePath, "");
  }

  const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";

  // Default network exclusions are MINIMAL — only files that would cause
  // outright harm if committed and have NO valid reason to track:
  //
  // - artifacts/                = transient CI build output
  // - screenshots/              = transient visual regression output
  // - .cursor/rules/inherited/  = synced from network; committing would freeze
  //                               stale rules and obscure source provenance
  //
  // What is NOT default-excluded (consumer self-manages via plain .gitignore):
  //
  // - AGENTS.md: every consumer tracks this for CI parity (auto-generated from
  //   .cursorrules but useful to commit as the canonical agent-readable view).
  // - Governance docs (REMINDERS, LEARNED-PATTERNS, SESSION-LOG, DECISION-LOG,
  //   ai-feedback/): human/agent-authored per HR-010 and HR-026. RCA-201 bloat
  //   is fixed at source (append-only, not regenerated), not by exclusion.
  //
  // Lesson learned (RCA-203 / RCA-204 / RCA-205): if you can't say "this file
  // would NEVER be wanted in any consumer," it does not belong in REQUIRED.
  //
  // Consumers can opt out of any default via .kunida-gitignore-optout.json.
  const REQUIRED = [
    "artifacts/",
    "screenshots/",
    ".cursor/rules/inherited/",
  ];

  // Honor local opt-outs (.kunida-gitignore-optout.json)
  const optoutPath = join(process.cwd(), ".kunida-gitignore-optout.json");
  let optedOutPaths = [];
  if (existsSync(optoutPath)) {
    try {
      const optout = JSON.parse(readFileSync(optoutPath, "utf8"));
      optedOutPaths = (optout.optOuts || []).map((o) => o.path);
      if (optedOutPaths.length > 0) {
        log(`Honoring ${optedOutPaths.length} local opt-out(s) from .kunida-gitignore-optout.json`);
        for (const o of optout.optOuts || []) {
          log(`  - ${o.path} (${o.rule || "no rule"}: ${o.reason || "no reason given"})`);
        }
      }
    } catch (e) {
      logWarn(`Could not parse .kunida-gitignore-optout.json: ${e.message}`);
    }
  }

  // Critical exclusions can never be opted out (these prevent breakage)
  const NON_OPTOUTABLE = [".cursor/rules/inherited/"];

  const effective = REQUIRED.filter((path) => {
    if (NON_OPTOUTABLE.includes(path)) return true;
    return !optedOutPaths.includes(path);
  });

  // Active (non-commented) entries only — a commented entry means the
  // consumer wants the path NOT excluded, equivalent to opting out.
  const activeLines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const isActivelyExcluded = (path) =>
    activeLines.some((line) => line === path || line === path.replace(/\/$/, ""));

  // Warn on commented network entries that aren't in opt-outs
  // (likely intentional overrides without audit trail)
  const commentedNetworkEntries = REQUIRED.filter(
    (path) =>
      !isActivelyExcluded(path) &&
      content.includes(path) &&
      !optedOutPaths.includes(path) &&
      !NON_OPTOUTABLE.includes(path)
  );
  if (commentedNetworkEntries.length > 0) {
    logWarn(
      `${commentedNetworkEntries.length} network exclusion(s) appear commented out without an opt-out entry:`
    );
    for (const e of commentedNetworkEntries) {
      logWarn(`  - ${e}`);
    }
    logWarn(
      `  Add these to .kunida-gitignore-optout.json with a documented reason for proper audit trail.`
    );
  }

  const missing = effective.filter((path) => !isActivelyExcluded(path));

  if (missing.length === 0) {
    logOk("All required .gitignore exclusions present (local opt-outs honored)");
    return;
  }

  log(`Adding ${missing.length} missing exclusion(s) to .gitignore`);
  const additions = `\n# --- Kunida network bloat prevention (auto-added by sync-rules) ---\n${missing.join("\n")}\n`;

  if (DRY_RUN) {
    log("[dry-run] Would append:\n" + additions);
  } else {
    writeFileSync(gitignorePath, content + additions);
    logOk(`.gitignore updated with: ${missing.join(", ")}`);
  }
}

function writeManifest(sources) {
  const manifestPath = join(process.cwd(), ".cursor", "rules", "inherited", "MANIFEST.json");
  const manifest = {
    syncedAt: new Date().toISOString(),
    sources: sources.map((s) => ({
      label: s.label,
      type: s.type,
      origin: s.origin,
      branch: s.branch || null,
    })),
  };

  if (DRY_RUN) {
    log("[dry-run] Would write manifest:\n" + JSON.stringify(manifest, null, 2));
    return;
  }

  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  logOk(`Manifest written: ${manifestPath}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  log("Kunida Rules Sync starting...");

  const pkg = readPackageJson();
  const config = pkg.kunidaRules;

  if (!config) {
    logErr(`No "kunidaRules" field in package.json. Add:`);
    console.error(`
  "kunidaRules": {
    "shared": "github:kunidadesigns/Kunida-Shared-Business-Rules#main",
    "stack": "github:kunidadesigns/Kunida-Astro-Rules-Core#main",
    "version": "1.0.0"
  }
`);
    process.exit(1);
  }

  log(`Consumer repo: ${pkg.name}`);
  log(`Target version: ${config.version || "latest"}`);

  // Resolve sources
  const sharedSpec = config.shared || "github:kunidadesigns/Kunida-Shared-Business-Rules#main";
  const stackSpec = config.stack || "github:kunidadesigns/Kunida-Astro-Rules-Core#main";

  const sharedSource = resolveSource(sharedSpec);
  const stackSource = resolveSource(stackSpec);

  // Fetch sources
  const sharedDir = sharedSource.type === "file" ? sharedSource.path : fetchFromGit(sharedSource);
  const stackDir = stackSource.type === "file" ? stackSource.path : fetchFromGit(stackSource);

  // Prepare destination
  const inheritedBase = join(process.cwd(), ".cursor", "rules", "inherited");
  const sharedDest = join(inheritedBase, "shared");
  const stackDest = join(inheritedBase, "stack");

  if (!DRY_RUN) {
    // Clean previous inherited (preserve local-experiments.mdc and other locals)
    if (existsSync(sharedDest)) rmSync(sharedDest, { recursive: true, force: true });
    if (existsSync(stackDest)) rmSync(stackDest, { recursive: true, force: true });
    mkdirSync(sharedDest, { recursive: true });
    mkdirSync(stackDest, { recursive: true });
  }

  // Copy rules
  copyRules(sharedDir, sharedDest, "Kunida-Shared-Business-Rules");
  copyRules(stackDir, stackDest, "Kunida-Stack-Rules-Core");

  // Sync .gitignore exclusions
  ensureGitignoreExclusions();

  // Write manifest
  writeManifest([
    { label: "shared", type: sharedSource.type, origin: sharedSpec, branch: sharedSource.branch },
    { label: "stack", type: stackSource.type, origin: stackSpec, branch: stackSource.branch },
  ]);

  // Cleanup tmp dirs
  if (sharedSource.type === "git" && !DRY_RUN) rmSync(sharedDir, { recursive: true, force: true });
  if (stackSource.type === "git" && !DRY_RUN) rmSync(stackDir, { recursive: true, force: true });

  if (DRY_RUN) {
    log("Dry-run complete. No changes made.");
  } else {
    logOk("Sync complete!");
    log("Next steps:");
    log("  1. Review .cursor/rules/inherited/ — these are read-only");
    log("  2. Local overrides in .cursor/rules/local-*.mdc");
    log("  3. Run check:gate to verify");
    log("  4. Commit & push (the inherited dir is gitignored, but updates to .gitignore should be committed)");
  }
}

main();
