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

## Quick access to iOS/Android simulators

Fish abbreviations expand inline to the real `xcrun` / `adb` command, so the URL stays editable. Swap it for any deep link like `myapp://route`.

- `simsaf <PORT>` opens `localhost:<PORT>` in iOS Simulator Safari.
- `emwv <PORT>` opens `10.0.2.2:<PORT>` in Android Emulator's WebView Shell.

## Self-renaming cmux workspaces

[cmux](https://cmux.com/) runs coding agents in parallel tabs. The agent updates its own tab title whenever focus shifts, so you can find the right session at a glance.

## Warm-dark, agent and terminal

`material-stone-dark` covers Ghostty(cmux), Fish, and Claude Code. One palette either side of the agent boundary.

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

# 5. (Optional) Enable brew autoupdate
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
