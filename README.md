# Presentation Software

**Agent and project rules:** [`PROJECT_SOURCE_OF_TRUTH.md`](PROJECT_SOURCE_OF_TRUTH.md)  
**Cursor agent workflow (always on):** [`.cursor/rules/workflow-push-deploy.mdc`](.cursor/rules/workflow-push-deploy.mdc)

Local development folder for the GitHub repo [`kunidadesigns/presentation-software`](https://github.com/kunidadesigns/presentation-software).

**GitHub org URL pattern:** `https://github.com/kunidadesigns/<repo-name>`

## WSL layout

- **Path:** `~/Dev/Presentation Software`
- **Clone:** SSH (`git@github.com:kunidadesigns/presentation-software.git`)

## Requirements

- WSL with `git` and [`gh`](https://cli.github.com/) authenticated to `kunidadesigns`.

`GH_TOKEN` is set in new shells from `gh auth token` when unset (see `~/.bashrc`).

## Codex (OpenAI)

Install the **Codex** / ChatGPT extension when prompted (`openai.chatgpt`), or from the Extensions view. Open the Codex side bar and sign in with your ChatGPT account (Plus/Pro/etc.) or API key. This workspace turns on **Open Codex on startup** and **to-do CodeLens** in [`.vscode/settings.json`](.vscode/settings.json); with Remote-WSL from Windows, **`chatgpt.runCodexInWindowsSubsystemForLinux`** stays `true` so the agent runs in WSL. Agent behavior can be tuned in `~/.codex/config.toml` ([docs](https://developers.openai.com/codex/ide/settings/)).
