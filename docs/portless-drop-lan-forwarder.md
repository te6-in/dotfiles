# Prompt: drop the portless LAN forwarder

Hand this file to Claude Code once portless can bind beyond loopback without hijacking the TLD. Until then it is a no-op — the check in step 1 tells you which.

---

## Context

Dev servers here run behind portless on a fixed `.test` domain issued per machine (`$PORTLESS_TLD`). Two settings have to hold at once:

- the proxy answers to `<app>.<name>.test`
- the proxy is reachable from phones, Android emulators, and teammates

portless couples them. `--lan` is the only thing that binds `0.0.0.0`, and it also hard-forces the TLD to `local`, discarding the issued domain:

```js
// portless dist/cli.js, verified present in 0.15.4 and 0.15.5
const effectiveTlds = options.lanMode ? ["local"] : [...new Set(requestedTlds)];
```

`.local` is mDNS, not DNS, so it doesn't use the issued domain at all and dies on networks with client isolation. So LAN mode stays off, and a separate root daemon (`portless-lan-forward`, socat) listens on `0.0.0.0:80` and relays to `127.0.0.1:80` where portless sits. Loopback traffic hits portless's more specific bind directly, so there's no loop, and TCP is relayed verbatim so the Host header survives.

The forwarder exists purely to work around that coupling. When portless can bind all interfaces while keeping a custom TLD, it becomes dead weight.

## What to do

### 1. Check whether the coupling is gone

```sh
brew upgrade portless
portless --version

CLI=$(find "$(brew --prefix)/Cellar/portless" -name cli.js | head -1)
grep -n 'lanMode ? \["local"\]' "$CLI"
```

- **Matches printed** → the coupling is still there. Stop; nothing to do. Optionally re-check the changelog at https://portless.sh/changelog for a flag that separates bind address from TLD.
- **No matches** → read the release notes to confirm how the new behavior is spelled (a `--bind`/`--host` flag, or `--lan` no longer rewriting the TLD), then continue.

### 2. Prove the new path works before tearing anything down

Run the proxy on a high port with the real TLD plus whatever the new option is, and confirm both paths answer:

```sh
portless proxy stop
portless proxy start --no-tls --tld "$PORTLESS_TLD" --port 8080 <new-bind-option>
portless smoke node -e "require('http').createServer((q,s)=>s.end('OK '+q.headers.host)).listen(process.env.PORT)" &

portless list                                    # route must read smoke.$PORTLESS_TLD, NOT smoke.local
curl -s --resolve "smoke.$PORTLESS_TLD:8080:127.0.0.1" "http://smoke.$PORTLESS_TLD:8080/"
curl -s "http://smoke.$PORTLESS_TLD:8080/"       # real DNS -> LAN IP; this is the device path
```

Both must return `OK`, and the route must carry the issued domain. If the route says `.local`, the coupling is not actually fixed — stop and revert to the forwarder.

### 3. Swap the setup over

```sh
sudo portless-lan-forward uninstall
sudo portless service install --no-tls --tld "$PORTLESS_TLD" <new-bind-option>
```

### 4. Clean up the repo

- Delete `packages/bin/.local/bin/portless-lan-forward` and re-run `stow -R -t ~ bin` from `packages/` to drop the stale symlink.
- Drop `brew "socat"` from `Brewfile` unless something else uses it (`grep -rn socat` first).
- In `packages/fish/.config/fish/conf.d/portless.local.fish` and `portless.fish.example`, replace the "Deliberately NOT set: PORTLESS_LAN" comment with whatever the new option is.
- Update the forwarder paragraph in `packages/claude/.claude/instructions/local-dev-server.md` and the portless section in `README.md`.
- Delete this file.

### 5. Verify end to end

```sh
portless <some-project> <dev-command>
```

Open the printed URL on the Mac and on a phone on the same network. Both must load, with no port in the URL.

## Rollback

```sh
sudo portless service install --no-tls --tld "$PORTLESS_TLD"   # LAN mode off again
sudo portless-lan-forward install
```

Then `git checkout` the repo files above.
