# te6-in/dotfiles

An opinionated macOS web dev environment, powered by a custom Claude Code config.

## Claude Code config

### CLAUDE.md with habits Claude doesn't form on its own

Covers how the agent investigates, edits, and asks, with each rule naming the failure it prevents.

- Pipe expensive command output to `/tmp` once and grep locally.
- Programmatic shell edits like `sed -i` require a clean git state and a dry-run first.
- Lean on `AskUserQuestion` at any hint of ambiguity, not free-form chat questions.
- ... and more

### Hooks that catch agent footguns

- `rm` calls go to macOS Trash and stay recoverable.
- Lockfile edits are blocked.

### MCP servers, ready out of the box

Every project picks up [Chrome DevTools for Agents](https://github.com/ChromeDevTools/chrome-devtools-mcp) and [SEED Design](https://seed-design.io/) Figma/Docs integration.

### One workflow across Linear, Slack, and Notion

Decisions, state changes, and findings move out of the private chat onto surfaces the team actually checks.

- Sessions anchor to a Linear issue and auto-transition its status (Todo → In Progress → In Review).
- `/comment` posts decisions back to the issue thread.
- `/notion` promotes durable findings to a default Notion page.
- Slack self-DMs are pre-approved for quick notes.

## One set of instructions, two agents

Anything that holds regardless of which agent is running — skills and standing instructions alike — lives once in `packages/agents/` and is written harness-neutral: it says "ask the user", not the name of one harness's prompt tool. The package projects that single copy into each agent's expected path with symlinks, so both read the same file and an edit lands everywhere at once:

```
packages/agents/
├─ .agents/skills/<name>/        # the actual files
├─ .agents/rules/<name>.md       #  ″
├─ .claude/skills/<name>         # → ../../.agents/skills/<name>
├─ .claude/rules/<name>.md       # → ../../.agents/rules/<name>.md
├─ .gemini/config/skills/<name>  # → ../../../.agents/skills/<name>
└─ .gemini/config/rules/<name>.md
```

One frontmatter serves both, because each ignores the other's keys. Claude Code scopes a rule with `paths:` and loads it unconditionally when that key is absent; `agy` needs an explicit `trigger:` and scopes with `glob:`:

```yaml
---
description: JavaScript, TypeScript, and React code style conventions.
paths: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,vue,svelte,astro,mdx}"]
trigger: glob
glob: "**/*.ts, **/*.tsx, **/*.mts, **/*.cts, **/*.js, **/*.jsx, **/*.mjs, **/*.cjs, **/*.vue, **/*.svelte, **/*.astro, **/*.mdx"
---
```

Write a `description` that says what the file *governs*, not what it says, so it survives edits to the body. For `trigger: model_decision` the description is the only thing the model sees up front, so there it has to carry the "when does this apply" on its own.

Both agents also honor `disable-model-invocation`, so a `/`-only skill stays `/`-only in both.

What can't be neutral stays in `packages/claude/`. The skills: `recall` and `recap` parse Claude Code's own JSONL transcripts, `linear-read-issue` depends on forking into a subagent, and the Linear/Notion ones need MCP servers only Claude Code has. The instructions: `asking-the-user`, `notifications`, `local-references`, `notion`, and `model-name` each name a Claude Code tool or setting outright. Those five are the adapter layer — the neutral rules say "ask the user", these say which tool that means here. They stay `@`-imported from `CLAUDE.md`; the neutral ones must **not** be, or they load twice.

Gotchas worth remembering, all found the hard way:

- **`agy` needs an absolute path.** Its `skills.json` documents `~/`-relative entries, but the CLI rejects them (`path is not absolute`). Linking into `~/.gemini/config/`, its global discovery directory, sidesteps the config file entirely and ranks higher in its precedence order.
- **`agy` parses frontmatter as strict YAML.** An unquoted `description` containing `: ` is invalid YAML; Claude Code accepts it anyway, so a broken file can sit there for months looking fine. Use a `>-` block for anything long.
- **`glob` is singular, and its value is one comma-separated string.** `globs: ["*.ts"]` fails to unmarshal and silently discards the *entire* rule, `trigger` and all. Brace expansion doesn't survive the comma split either — write `**/*.ts, **/*.tsx`, not `**/*.{ts,tsx}`. Quote the value, since a bare `*` opens a YAML alias.
- **`trigger` accepts exactly `always_on`, `model_decision`, `manual`, `glob`.** Anything else, including a missing frontmatter block, drops the rule without a word.
- **`agy` truncates a rule body at 24,000 characters** — not the 12,000 its public docs claim.

### Third-party skills stay on `npx skills`

[`npx skills`](https://github.com/vercel-labs/skills) owns `~/.agents/skills/` for skills pulled from other people's repos, and materializes them there as real directories. Stow puts its symlinks in the same directory, which is fine — the two only collide if the *same skill name* is managed by both. Don't let that happen.

Don't hand your own skills to `npx skills` either: it copies from the source instead of linking, and `skills update` ignores `sourceType: local`, so every edit would need a re-install to take effect.

Its lockfile is stowed out of `packages/agents/.agents/.skill-lock.json`, so this repo carries the manifest — a Brewfile for skills, listing every source repo and which skills came from it. `npx skills add -g` writes through the symlink, so it stays current on its own. There's no matching `bundle install`, though: the CLI's `experimental_install` only replays a project's `skills-lock.json` into `./.agents/skills/` and never reads the global one, hence the loop in step 5 of the bootstrap.

## Quick access to iOS/Android simulators

Fish abbreviations expand inline to the real `xcrun` / `adb` command, so the URL stays editable. Swap it for any deep link like `myapp://route`.

- `simsaf <PORT>` opens `localhost:<PORT>` in iOS Simulator Safari.
- `emwv <PORT>` opens `10.0.2.2:<PORT>` in Android Emulator's WebView Shell.

## One URL per app, no port numbers

[portless](https://portless.sh) fronts every dev server with a named host under a fixed `.test` domain, so the address survives restarts and reaches phones and emulators unchanged. `PORTLESS_TLD` picks the domain, in a gitignored `portless.local.fish`.

- `<app>.<name>.test` per project, `<branch>.<app>.<name>.test` per git worktree.
- The `*p` abbreviations resolve that URL for you: `simsafp`, `emwvp`.
- Claude Code is told to read the URL off `portless list` instead of guessing `localhost:3000`.

portless binds loopback only. Its `--lan` flag opens `0.0.0.0` but hard-forces the TLD to `.local`, discarding the issued domain — so `portless-lan-forward` installs a root daemon that relays `0.0.0.0:80` to `127.0.0.1:80` instead, leaving the TLD alone. It knows nothing about the machine's IP, so it ports to a new machine as-is. `docs/portless-drop-lan-forwarder.md` retires it if portless ever decouples the two.

## Bootstrap

Install with [Homebrew](https://brew.sh/) and [GNU Stow](https://www.gnu.org/software/stow/).

```sh
# 1. Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Clone
git clone <this-repo> ~/Projects/dotfiles
cd ~/Projects/dotfiles

# 3. Install everything from Brewfile
brew bundle install

# 4. Stow every package into $HOME
cd packages && stow -t ~ */

# Or selectively
stow -t ~ fish git starship

# 5. Reinstall third-party skills from the committed lockfile
jq -r '.skills | to_entries | group_by(.value.source)[] | "\(.[0].value.source) \(map(.key) | join(" "))"' \
  ~/.agents/.skill-lock.json | while read -r src skills; do npx skills add "$src" -g -y --skill $skills; done

# 6. (Optional) Enable brew autoupdate
brew autoupdate start --upgrade --immediate --cleanup --sudo
```

## Per-machine overrides

Anything matching `*.local.*` or `*.secret.*` is gitignored, so machine-specific values live next to their checked-in counterpart.

```
packages/fish/.config/fish/conf.d/
├─ linear.fish.example   # checked in template
└─ linear.local.fish     # ignored, real values
```

### When `.local` naming doesn't fit, fold / unfold

When the filename itself is meaningful (e.g. Claude Code's `commands/X.md`, where the filename _is_ the slash command), the per-machine file has to live outside the repo, directly under `~/...`. But if stow has _folded_ that directory into a single symlink back to the repo, new files inside it will land in the repo instead. Unfold once first.

```fish
rm ~/<path> && mkdir ~/<path>
cd ~/Projects/dotfiles/packages && stow -R -t ~ <package>
```

## Uninstall

```fish
cd ~/Projects/dotfiles/packages
stow -D -t ~ <package>   # one package
stow -D -t ~ */          # everything
```

## Notes

- `~/.config/karabiner` must be symlinked as a whole directory ([Docs](https://karabiner-elements.pqrs.org/docs/manual/misc/configuration-file-path/)).
