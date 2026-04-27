# Repo Comparison

Compared against the local repos under `/home/david/Dev` on 2026-04-27.

## What This Repo Already Has

- Permanent stage, commit, push, and deploy-when-configured workflow rule.
- Repo source-of-truth doc.
- Codex/OpenAI extension defaults.
- Windows app profile guidance.
- Windows/.NET-focused editor recommendations and ignore rules.

## Gaps Found

- No executable `package.json` check entrypoint existed.
- No CI workflow existed to run a repo policy check on push or pull request.
- No project-local script enforced the Windows app profile, Codex settings, secret hygiene, and workflow lock.
- No app solution/project file exists yet.
- No Cloudflare/Wrangler deploy config exists yet, so deployment cannot be run safely.

## Improvements Added

- Added `npm run check:workspace` and aliases through `package.json`.
- Added `scripts/check-workspace.mjs` to enforce source-of-truth, Cursor rule, VS Code settings/extensions, ignore rules, CI wiring, and secret-pattern hygiene.
- Added `.github/workflows/workspace-check.yml` to run the check in GitHub Actions.
- Added `.nvmrc` and `package-lock.json` so CI uses a pinned Node 20+ lane with `npm ci`.

## Next Improvements After App Source Exists

- Add the actual Windows app solution/project file.
- Extend `check:workspace` with stack-specific build/test commands once the app stack is selected.
- Add a real deploy script only after Cloudflare or app packaging configuration exists.
