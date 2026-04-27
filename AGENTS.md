# Agent Instructions

This repository is the source-controlled workspace for Presentation Software.

## Permanent Workflow

Every agent run in this repo must follow this order:

1. Fix all known issues that can be addressed in the session.
2. Verify the repository state with `npm run check:workspace` and any app-specific checks that exist.
3. Stage all intentional changes.
4. Commit with a clear message.
5. Push `main` to `origin`.
6. Run the configured Cloudflare/app deploy command when one exists.
7. End with a clean working tree or report the exact blocker.

Do not regress, delete, or ignore this workflow.

## Workspace Type

This is a Windows application development workspace. Default to C#/.NET desktop app patterns unless future source files clearly establish another stack. Keep UI, app logic, build, installer, and deployment concerns separated cleanly.

Do not treat this as a WordPress, Astro, or web-marketing workspace unless the repository source of truth is explicitly changed.

## Secrets

Never commit GitHub tokens, API keys, `.env` values, or raw credentials. Use SSH remotes, `gh auth`, host environment variables, or GitHub Actions encrypted secrets.
