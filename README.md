# Presentation Software

- **Agent and project rules:** [`PROJECT_SOURCE_OF_TRUTH.md`](PROJECT_SOURCE_OF_TRUTH.md)
- **Codex/agent instructions:** [`AGENTS.md`](AGENTS.md)
- **Cursor agent workflow (always on):** [`.cursor/rules/workflow-push-deploy.mdc`](.cursor/rules/workflow-push-deploy.mdc)

Local development folder for the Windows application development repo [`kunidadesigns/presentation-software`](https://github.com/kunidadesigns/presentation-software).

**GitHub org URL pattern:** `https://github.com/kunidadesigns/<repo-name>`

## Workspace purpose

- Windows app development workspace.
- C#/.NET desktop app tooling is the default.
- Native Windows/C++ tooling is available when the app needs it.
- Do not use WordPress, Astro, or web-marketing workspace assumptions here unless the source of truth is changed.

## Cursor profile

- Recommended profile: **Custom App Development**.
- Acceptable alternate: **Custom Software Development**.
- Do not use the **WordPress Builds** profile for this repo; it carries PHP/WordPress settings that do not belong in this workspace.

## WSL layout

- **Path:** `~/Dev/Presentation Software`
- **Clone:** SSH (`git@github.com:kunidadesigns/presentation-software.git`)

## Requirements

- WSL with `git`, .NET SDK, and [`gh`](https://cli.github.com/) authenticated to `kunidadesigns`.
- Node 20 or newer for repository policy checks.
- Windows-side build tools as needed for the chosen desktop app stack.

`GH_TOKEN` is set in new shells from `gh auth token` when unset (see `~/.bashrc`).

## Checks

- `npm run check:workspace` validates the repo workflow lock, Windows app profile settings, recommended extensions, ignore rules, CI wiring, and secret-pattern hygiene.
- GitHub Actions runs the same check on pushes and pull requests to `main`.

## Codex (OpenAI)

Install the **Codex** / ChatGPT extension when prompted (`openai.chatgpt`), or from the Extensions view. Open the Codex side bar and sign in with your ChatGPT account (Plus/Pro/etc.) or API key. This workspace turns on **Open Codex on startup** and **to-do CodeLens** in [`.vscode/settings.json`](.vscode/settings.json); with Remote-WSL from Windows, **`chatgpt.runCodexInWindowsSubsystemForLinux`** stays `true` so the agent runs in WSL. Agent behavior can be tuned in `~/.codex/config.toml` ([docs](https://developers.openai.com/codex/ide/settings/)).

## Recommended extensions

[`.vscode/extensions.json`](.vscode/extensions.json) keeps this workspace centered on Codex, GitHub, Cloudflare deployment work, and Windows app development tooling:

- OpenAI Codex / ChatGPT extension
- C# extension, C# Dev Kit, and .NET runtime support
- PowerShell for Windows automation scripts
- XML support for project files, app manifests, and XAML-adjacent configuration
- C++ and CMake support for native Windows modules when needed
