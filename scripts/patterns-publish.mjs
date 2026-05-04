#!/usr/bin/env node
/**
 * Publish a local pattern from the consumer repo to the Kunida-Patterns-Library.
 *
 * Reads a sidecar `.kunida-pattern.json` next to the pattern files and copies
 * everything into the library at `patterns/<domain>/<name>/`. The library must
 * be on a writable path (file:) — for github: paths, you'll get a printout of
 * what to commit manually.
 *
 * Usage:
 *   npm run patterns:publish src/components/MyForm.astro \
 *     --domain forms \
 *     --name multi-step-quote-form \
 *     --version 1.0.0 \
 *     --rationale "12% conversion lift in 2-week A/B test" \
 *     --rca-id RCA-150
 *
 *   # OR with a .kunida-pattern.json sidecar:
 *   npm run patterns:publish .cursor/rules/local-quote-form.kunida-pattern.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, basename, extname } from "node:path";

const args = process.argv.slice(2);
const sourcePath = args.find((a) => !a.startsWith("--"));

function getArg(name, fallback = null) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : fallback;
}

if (!sourcePath) {
  console.error("Usage: npm run patterns:publish <source-path> --domain <d> --name <n> [...]");
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
  if (spec.startsWith("github:")) {
    console.error('❌ Publishing to a github: source requires a writable clone.');
    console.error('   Either: (1) clone the patterns library locally, switch to file: spec, publish, push;');
    console.error('   Or: (2) manually create the pattern in the library and push.');
    process.exit(1);
  }
  return spec;
}

function buildMetadata() {
  const pkg = readPackageJson();
  const sidecarPath = sourcePath.endsWith(".kunida-pattern.json") ? sourcePath : null;

  if (sidecarPath && existsSync(sidecarPath)) {
    return { meta: JSON.parse(readFileSync(sidecarPath, "utf8")), sidecarMode: true };
  }

  const domain = getArg("domain");
  const name = getArg("name");
  if (!domain || !name) {
    console.error("❌ --domain and --name are required.");
    process.exit(1);
  }

  return {
    meta: {
      id: `${domain}/${name}`,
      name: getArg("display-name") || name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      version: getArg("version", "1.0.0"),
      domain,
      source: {
        repo: pkg.name,
        rcaId: getArg("rca-id"),
        publishedAt: new Date().toISOString().split("T")[0],
      },
      summary: getArg("rationale") || "",
      metrics: {},
      compatibility: {
        stacks: [getArg("stack", "astro-5")],
      },
      adoptions: [],
    },
    sidecarMode: false,
  };
}

function main() {
  const pkg = readPackageJson();
  const libraryPath = resolveLibraryPath(pkg.kunidaRules?.patterns);

  const { meta, sidecarMode } = buildMetadata();
  const destDir = join(libraryPath, "patterns", meta.domain, meta.id.split("/")[1]);

  if (existsSync(destDir)) {
    console.error(`❌ Pattern already exists at ${destDir}`);
    console.error(`   To update, edit in place. To replace, delete and re-publish.`);
    process.exit(1);
  }

  mkdirSync(destDir, { recursive: true });
  console.log(`📦 Creating ${destDir}`);

  // Write metadata
  writeFileSync(
    join(destDir, ".kunida-pattern.json"),
    JSON.stringify(meta, null, 2) + "\n"
  );
  console.log(`✅ Wrote .kunida-pattern.json`);

  // Copy source file(s)
  if (!sidecarMode) {
    const srcAbs = resolve(process.cwd(), sourcePath);
    if (!existsSync(srcAbs)) {
      console.error(`❌ Source not found: ${srcAbs}`);
      process.exit(1);
    }

    if (statSync(srcAbs).isDirectory()) {
      let count = 0;
      for (const entry of readdirSync(srcAbs)) {
        const srcPath = join(srcAbs, entry);
        if (statSync(srcPath).isFile()) {
          copyFileSync(srcPath, join(destDir, entry));
          count++;
        }
      }
      console.log(`✅ Copied ${count} file(s)`);
    } else {
      const filename = basename(srcAbs);
      copyFileSync(srcAbs, join(destDir, filename));
      console.log(`✅ Copied ${filename}`);
    }
  }

  // Write README template
  const readmePath = join(destDir, "README.md");
  if (!existsSync(readmePath)) {
    const readme = `# ${meta.name}

${meta.summary || "(add description)"}

## Source

- **Repo:** ${meta.source.repo}
- **Published:** ${meta.source.publishedAt}
- **RCA-ID:** ${meta.source.rcaId || "(none)"}

## Validation

${meta.metrics?.conversionLift ? `- Conversion lift: ${meta.metrics.conversionLift}` : "(add metrics)"}
${meta.metrics?.testPeriod ? `- Test period: ${meta.metrics.testPeriod}` : ""}

## Compatibility

- Stacks: ${(meta.compatibility?.stacks || []).join(", ")}
- Dependencies: ${(meta.compatibility?.dependencies || []).join(", ") || "(none additional)"}

## Files

(list files in this pattern and their purpose)

## See Also

- Adoption guide: \`adoption-guide.md\`
`;
    writeFileSync(readmePath, readme);
    console.log(`✅ Wrote README.md template`);
  }

  // Write adoption guide template
  const adoptionPath = join(destDir, "adoption-guide.md");
  if (!existsSync(adoptionPath)) {
    const guide = `# Adoption Guide: ${meta.name}

How to integrate this pattern into your Kunida site.

## Prerequisites

- Stack: ${(meta.compatibility?.stacks || []).join(" or ")}
- Dependencies: ${(meta.compatibility?.dependencies || []).join(", ") || "(none additional)"}

## Step 1: Adopt the Pattern

\`\`\`bash
npm run patterns:adopt ${meta.id}
\`\`\`

This copies the pattern files to \`.cursor/rules/local-borrowed/${meta.id}/\` and logs the adoption.

## Step 2: Move Files into Place

(Describe where each file should go in the consumer repo, e.g., \`src/components/\`, \`functions/\`, etc.)

## Step 3: Customize for Your Business

(List \`{{TOKENS}}\` that need replacement, e.g., business name, phone, brand color)

## Step 4: Test

(Specific test cases for this pattern, e.g., form submission flow, mobile UX, accessibility)

## Step 5: Document in Your DECISION-LOG

\`\`\`markdown
- **YYYY-MM-DD: Adopted ${meta.id} pattern from network library**
  - Source: ${meta.source.repo} (RCA: ${meta.source.rcaId})
  - Why we adopted: (your reason)
  - Modifications: (any tweaks)
  - Verification: (how you confirmed it works)
\`\`\`

## Known Compatibility Issues

(Document any sites where this pattern conflicts with local rules)
`;
    writeFileSync(adoptionPath, guide);
    console.log(`✅ Wrote adoption-guide.md template`);
  }

  console.log("");
  console.log("Next steps:");
  console.log(`  1. Edit ${destDir}/README.md and adoption-guide.md to fill in details`);
  console.log(`  2. Verify .kunida-pattern.json is correct`);
  console.log(`  3. Update patterns/INDEX.md and CHANGELOG.md`);
  console.log(`  4. Commit and push the patterns library`);
  console.log(`  5. Notify the network (other consumers can now browse + adopt)`);
  console.log("");
}

main();
