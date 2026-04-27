# Project source of truth

This file is the project source of truth.

---

## 1. Project Source of Truth

- This file is the project source of truth.
- This repo is for **Windows application development**. Default to C#/.NET desktop app conventions unless future source files explicitly establish a different stack.
- Repository-local files (`AGENTS.md`, `.cursor/rules/workflow-push-deploy.mdc`, `.vscode/settings.json`, `.vscode/extensions.json`) are authoritative for agent workflow and workspace defaults.
- Recommended Cursor profile: **Custom App Development**. Do not use the **WordPress Builds** profile for this workspace.
- Do not rename ENV keys, form field names, tracking names, or pipeline endpoints unless this file is updated first.
- Preserve existing values. Do not overwrite with guesses.
- Harden information so it cannot be overwritten in ENV.
- Lock pipelines so AI agents cannot break them.
- **Secrets:** store tokens and API keys only in the **host environment**, OS keychain, or **GitHub Actions encrypted secrets** — never in git-tracked files, rules, or chat logs. Use `gh auth login`, SSH remotes, or CI `GITHUB_TOKEN` as appropriate. Rotate any credential that was pasted into an insecure channel.
- Use authenticated tooling to log in, audit, and work as needed (never commit the credential itself).

## 2. Windows App Build Philosophy - Architecture

- Keep application UI, presentation logic, domain logic, persistence, build, packaging, and deployment concerns separated.
- Prefer reusable controls, services, and configuration over one-off app-specific patches.
- Standardize desktop UI behavior, spacing, typography, commands, dialogs, and error handling through shared components or styles when the app stack supports it.
- Preserve Windows build outputs and generated installer artifacts outside source history unless explicitly required.
- Use the best architecture possible for the current needs without introducing unnecessary framework churn.

## 3. Build / Deploy / Infrastructure

- Repository policy check: `npm run check:workspace`.
- Every run must fix all known issues, then stage, commit, and push all changes to GitHub `main` / `origin`.
- Leave a clean repo every time.
- Every run must be pushed to GitHub for deployment to Cloudflare.
- Cloudflare deploy command is not configured yet. Do not invent one; add the real deploy command only after the app or Cloudflare project config exists.
- There should be no blockers.
- This is a permanent, non-negotiable hard rule.
- Do not regress, delete, or ignore this order.
- All agents must follow this order at all times and include it in the workflow.
