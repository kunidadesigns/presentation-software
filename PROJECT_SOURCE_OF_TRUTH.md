# Project source of truth

This file is the project source of truth.

---

## 1. Project Source of Truth

- This file is the project source of truth.
- Do not rename ENV keys, form field names, tracking names, or pipeline endpoints unless this file is updated first.
- Preserve existing values. Do not overwrite with guesses.
- Harden information so it cannot be overwritten in ENV.
- Lock pipelines so AI agents cannot break them.
- **Secrets:** store tokens and API keys only in the **host environment**, OS keychain, or **GitHub Actions encrypted secrets** — never in git-tracked files, rules, or chat logs. Use `gh auth login`, SSH remotes, or CI `GITHUB_TOKEN` as appropriate. Rotate any credential that was pasted into an insecure channel.
- Use authenticated tooling to log in, audit, and work as needed (never commit the credential itself).

## 2. Website Build Philosophy - Architecture

- Templates, wrappers, global elements, and section libraries are the base for all pages and sections.
- Use section libraries, UI/UX library elements, and reusable building blocks for all front-end sections and elements.
- Prefer reusable building blocks.
- Make no or minimal ad hoc changes.
- Standardize all front-end UI/UX elements, spacing, padding, fonts, buttons, cards, and section patterns.
- Use the best architecture possible for the current needs.

## 3. Build / Deploy / Infrastructure

- Every run must fix all known issues, then stage, commit, and push all changes to GitHub `main` / `origin`.
- Leave a clean repo every time.
- Every run must be pushed to GitHub for deployment to Cloudflare.
- There should be no blockers.
- This is a permanent, non-negotiable hard rule.
- Do not regress, delete, or ignore this order.
- All agents must follow this order at all times and include it in the workflow.
