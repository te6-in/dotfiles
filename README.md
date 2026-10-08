# te6-in/dotfiles

An opinionated macOS web dev environment, powered by a custom Claude Code config.

## Claude Code config

### CLAUDE.md with habits Claude doesn't form on its own

Covers how the agent investigates, edits, and asks.

- Pipe expensive command output to `/tmp` once and grep locally.
- Programmatic shell edits like `sed -i` require a clean git state and a dry-run first.
- Lean on `AskUserQuestion` at any hint of ambiguity, not free-form chat questions.
- Korean in a tool-call parameter goes in as literal UTF-8, never as `\uXXXX` escapes.
- ... and more

### Hooks that catch agent footguns

- `rm` and `rmdir` are turned back with a pointer to `trash`, so deletes stay recoverable.
- Lockfile edits are blocked.

### MCP servers, ready out of the box

Every project picks up [Chrome DevTools for Agents](https://github.com/ChromeDevTools/chrome-devtools-mcp) and [SEED Design](https://seed-design.io/) Figma/Docs integration.

### One workflow across Linear, Slack, and Notion

Decisions, state changes, and findings move out of the private chat onto surfaces the team actually checks.

- Sessions anchor to a Linear issue and drive its status (Todo → In Progress → In Review → Done). No GitHub integration does this — the agent does, at the first code edit and then off PR events, and it asks first on any issue with sub-issues, where the status is a signal other people read.
- `/comment` posts decisions back to the issue thread.
- `/notion` promotes durable findings to a default Notion page.
- Slack self-DMs are pre-approved for quick notes.

## Codex config

`packages/codex/` supplies Codex copies of the harness-specific skills in `packages/claude/` and harness-specific instructions. Stow it into the home directory alongside `agents`. Its global `AGENTS.md` links to `packages/codex/.codex/AGENTS.md`, which includes the full text of the shared rules and all Codex-specific instructions. Codex loads this body at startup without asking the model to read another instruction file. It does not discover the Markdown rules directory or filter it by `paths` itself.

After editing the rule or Codex instruction sources, run `python3 scripts/sync-codex-instructions.py` to regenerate `AGENTS.md`; `--check` detects a stale snapshot. No `developer_instructions` loader is needed. Existing Codex model and app preferences are preserved.

`claude-recall` and `claude-recap` live under `.codex/skills/` for Codex-only discovery: the former searches local Claude sessions and returns resume commands, while the latter reconstructs a known Claude session's dialogue into the current Codex conversation. The Claude originals remain separate. After an app restart, Slack self-DM approval and prompting for other destinations were verified. GitHub human-approval routing remains unregistered. The adapter uses direnv per command when project environment is needed and the existing notify CLI for explicit notification requests.

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

`context: fork` is worth setting on a neutral skill even though only Claude Code reads it. A read-heavy, report-shaped one — `catchup`, `review-comments` — spends its whole budget on raw material the caller never needs (a branch diff, an unfiltered dump of every PR comment), and forking keeps all of it out of the calling conversation. `agy` ignores the key and runs the skill inline as it always did, so the body has to hold up either way: it says the skill *may* run in a fork, and a step that wanted to ask the user makes the call itself and reports which way it went, since a fork has nobody to ask.

Harness-specific originals stay in `packages/claude/`, with Codex equivalents in `packages/codex/`. The Claude session skills have Codex-only copies named `claude-recall` and `claude-recap`. Both harnesses have adapters for `asking-the-user`, `notifications`, `local-references`, `notion`, and `model-name`. These translate shared intent into the tools and settings each host provides. Claude imports its five adapters from `CLAUDE.md`; Codex includes their complete bodies and its shell/workflow instructions in the generated global `AGENTS.md`. The neutral rules must not also be imported from `CLAUDE.md`, or they load twice there.

Gotchas worth remembering, all found the hard way:

- **`agy` needs an absolute path.** Its `skills.json` documents `~/`-relative entries, but the CLI rejects them (`path is not absolute`). Linking into `~/.gemini/config/`, its global discovery directory, sidesteps the config file entirely and ranks higher in its precedence order.
- **`agy` parses frontmatter as strict YAML.** An unquoted `description` containing `: ` is invalid YAML; Claude Code accepts it anyway, so a broken file can sit there for months looking fine. Use a `>-` block for anything long.
- **`glob` is singular, and its value is one comma-separated string.** `globs: ["*.ts"]` fails to unmarshal and silently discards the *entire* rule, `trigger` and all. Brace expansion doesn't survive the comma split either — write `**/*.ts, **/*.tsx`, not `**/*.{ts,tsx}`. Quote the value, since a bare `*` opens a YAML alias.
- **`trigger` accepts exactly `always_on`, `model_decision`, `manual`, `glob`.** Anything else, including a missing frontmatter block, drops the rule without a word.
- **`agy` truncates a rule body at 24,000 characters** — not the 12,000 its public docs claim.

### Self-contained, and MECE

Every file here that instructs an agent — a `SKILL.md`, a rule, `CLAUDE.md` itself — holds both properties at once, and the obvious fix for either one breaks the other.

**Self-contained** means whoever acts on a section can act from that section. The tell that it isn't is a cross-reference by section name: "run *Whose issue is it* first", "per *When the flow runs late* above". Each one is a jump taken mid-task, with the work already in hand.

**MECE** means every rule written down in exactly one place, and every case the file claims to cover reachable from somewhere. Duplication is the more expensive half — two copies drift, nothing marks which one is current, and whoever finds the stale copy has no way to tell. A gap at least announces itself when somebody hits it.

The trap is that inlining a rule to remove a cross-reference duplicates it, and adding a pointer to remove a duplicate breaks self-containedness. Neither is the fix. **A rule referenced from several places is a rule living in the wrong place** — move it to where it is used and the references go away with it. `linear-workflow` kept its late-arrival rule in the issue-identification section and pointed at it three times from the lifecycle section; moving the rule into the lifecycle retired all three pointers and left one statement. Where no single home exists, keep the one statement and point at it by what it does rather than by its heading — "the sub-issue check below" survives a rename, and tells the reader whether they need to go at all.

Both properties break through ordinary editing rather than through bad writing: a rule appended under the nearest heading instead of its own, a section that quietly grew a second copy of something two headings up. So read the file back for both after editing it.

### Third-party skills stay on `npx skills`

[`npx skills`](https://github.com/vercel-labs/skills) owns `~/.agents/skills/` for skills pulled from other people's repos, and materializes them there as real directories. Stow puts its symlinks in the same directory, which is fine — the two only collide if the *same skill name* is managed by both. Don't let that happen.

Don't hand your own skills to `npx skills` either: it copies from the source instead of linking, and `skills update` ignores `sourceType: local`, so every edit would need a re-install to take effect.

Its lockfile is stowed out of `packages/agents/.agents/.skill-lock.json`, so this repo carries the manifest — a Brewfile for skills, listing every source repo and which skills came from it. `npx skills add -g` writes through the symlink, so it stays current on its own. There's no matching `bundle install`, though: the CLI's `experimental_install` only replays a project's `skills-lock.json` into `./.agents/skills/` and never reads the global one, hence the loop in step 5 of the bootstrap.

## Quick access to iOS/Android targets

Fish abbreviations expand inline to the real `xcrun` / `adb` command, so the URL stays editable. Swap it for any deep link like `myapp://route`.

- `simsaf <NAME>` opens a portless route in iOS Simulator Safari.
- `andshell <NAME>` opens one in WebView Shell, on whichever device adb is attached to. `and`, not `em`, because the URL names no host — emulator and physical device take the same command. Only WebView Shell itself is emulator-flavored: system images ship it, retail devices generally don't.
- The `*u` variants take a literal URL instead, for a server portless isn't fronting.
- Each one pipes the URL through `showurl` on the way in, so the address that actually got assembled is on screen — a launcher opens the app without a word otherwise, and a deep link built wrong looks identical to one built right. `showurl` prints on stderr precisely because the launcher is reading it off stdout.

### Deep links into a host app, from the shell and the agent alike

Opening a dev server *inside* an app — its web view, its native renderer — means percent-encoding the whole dev URL into a single query parameter of a private scheme. Three things about that resist being written inline, and each one fails silently: a partly encoded URL still parses, so the app opens a blank screen rather than complaining; the scheme is internal and shouldn't reach a public commit; and `simctl openurl booted` refuses outright once two simulators are booted, as `adb` does with two devices.

`deeplink` holds all three, and both callers go through it — the `simw`/`andw`/`qrw` abbreviations in a gitignored `abbreviations.local.fish`, and the `open-deeplink` skill the agent loads. The schemes live in `~/.config/deeplink/deeplinks.local.json`, gitignored beside a committed `deeplinks.json.example`, so adding a view is a config edit rather than a code change. It looks no address up — `--url` is required, and resolving a portless route stays with the caller: `plurl` in the abbreviations, and for the agent whatever `local-dev-server.md` says. The script is therefore free of any assumption about how dev servers are addressed here, while the scheme, the encoding, and the several-devices-attached case still exist exactly once.

`--qr` hands the link to `showqr`, which picks its rendering off the caller — half-block glyphs on a terminal, a PNG opened in a viewer everywhere else. An agent's shell strips the ESC byte out of every colour code, which unpicks the light and dark modules a text QR is made of, and `deeplink` runs the same check to keep the bold link plain there rather than leaving `[1m` behind. `showqr` encodes any string, so it stands on its own outside a deep link, and it replaced the fish function of the same name so that one rendering serves both callers.

## One URL per app, no port numbers

[portless](https://portless.sh) fronts every dev server with a named host under a fixed `.test` domain, so the address survives restarts and reaches phones and emulators unchanged. `PORTLESS_TLD` picks the domain, in a gitignored `portless.local.fish`.

- `<app>.<name>.test` per project, `<branch>.<app>.<name>.test` per git worktree.
- The simulator abbreviations resolve that URL through `plurl`, so no host or port is ever typed — not `localhost`, not Android's `10.0.2.2`, not a LAN or tailnet IP for a physical device.
- Claude Code is told to read the URL off `portless list` instead of guessing `localhost:3000`.

`plurl` with no name resolves the route serving the current directory. `portless get` needs a name and has no cwd fallback, and its `inferProjectName` (portless.json → package.json → git root → directory name) is internal, so the obvious move is to reimplement that chain — which drifts from portless the moment it changes, and still can't separate two worktrees of one package, since the hostname prefix comes off the branch rather than the directory. Instead `plurl` reads the pid `portless list` already prints for every live route and matches `$PWD` against that process's cwd, deepest enclosing directory first. That is measurement, not inference: it cannot answer wrongly, only fail to answer, and then it falls back to listing the routes for you to name. Alias routes carry no pid and never match, which is correct — a static route has no project directory.

Like `showqr`, it replaced the fish function of the same name and lives in `bin` as POSIX `sh`, so the abbreviations and the agent's tool shell reach one implementation by name. A fish function is invisible to every other shell, and documenting a `fish -c plurl` workaround only spreads the shell's name into instructions that have nothing to do with it.

portless binds loopback only. Its `--lan` flag opens `0.0.0.0` but hard-forces the TLD to `.local`, discarding the issued domain — so `portless-lan-forward` installs a root daemon that relays `0.0.0.0:80` to `127.0.0.1:80` instead, leaving the TLD alone. It knows nothing about the machine's IP, so it ports to a new machine as-is. `docs/portless-drop-lan-forwarder.md` retires it if portless ever decouples the two.

`portless-proxy-service` installs the other half, the root daemon that holds port 80. It replaces `portless service install`, which pins the plist to the versioned Cellar path of the node it ran under — one `brew upgrade node` later the daemon cannot exec, an unprivileged proxy takes over on a high loopback port, and every device URL breaks while the machine keeps working. This one execs the `portless` launcher instead, so no version appears in the plist. `portless-proxy-service status` names that failure when it happens.

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

# 4. Stow every package into $HOME. Run stow from packages/, where .stowrc
#    sets the target to ~ and ignores .DS_Store.
cd packages && stow */

# Or selectively
stow fish git starship

# 5. Reinstall third-party skills from the committed lockfile
jq -r '.skills | to_entries | group_by(.value.source)[] | "\(.[0].value.source) \(map(.key) | join(" "))"' \
  ~/.agents/.skill-lock.json | while read -r src skills; do npx skills add "$src" -g -y --skill $skills; done

# 6. Install the portless root daemons — proxy on port 80, plus the LAN relay in front
#    of it. Needs portless.local.fish in place first, for $PORTLESS_TLD.
sudo portless-proxy-service install
sudo portless-lan-forward install

# 7. (Optional) Enable brew autoupdate
brew autoupdate start --upgrade --immediate --cleanup --sudo
```

## Nothing that identifies the work

This repo is public. Nothing committed may reveal the employer, the people there, or what the work is: no company or product names, no colleagues' names, no internal hostnames, Slack channels or their IDs, no issue keys, and no decisions, specs, or numbers lifted from real work. Paths go through `~` or `$HOME`, never a literal username.

A value the setup genuinely needs, like the GitHub orgs that count as work repos, goes in an environment variable set from a gitignored per-machine file, and the committed file refers to the variable. Anything that only illustrates a point uses made-up values instead — `Acme-Corp`, `ABC-1234`, `example.invalid`.

The usual leak is a skill or rule written from a real session: the case that motivated it comes along as its example, with the real channel, the real colleague, and the real numbers still in it. Swap those for invented ones before committing, and when a diff adds prose, read it for this as well as for correctness.

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
cd ~/Projects/dotfiles/packages && stow -R <package>
```

## Uninstall

```fish
cd ~/Projects/dotfiles/packages
stow -D <package>   # one package
stow -D */          # everything
```

## Notes

- `~/.config/karabiner` must be symlinked as a whole directory ([Docs](https://karabiner-elements.pqrs.org/docs/manual/misc/configuration-file-path/)).
- `~/.config/openlogi` must be symlinked as a whole directory too. The OpenLogi GUI saves `config.toml` by renaming a temp file over it, which would replace a file-level symlink with a plain file.
