# `package.json` dependencies

Use the package manager's `add` command to install or update dependencies. Don't hand-edit `package.json` and then run `install` — the `add` command places the dependency in the right section (`dependencies` / `devDependencies` / `peerDependencies`), resolves and writes the correct version range, and updates the lockfile atomically. Check the lockfile to determine which package manager the repo uses.

```sh
# ✅
bun add change-case
pnpm add -D vitest

# ❌ Edit package.json by hand, then run install
```

Exception: if the user explicitly asks you to hand-edit `package.json` (pinning a specific version, reordering, adding a field like `resolutions` that the add command doesn't cover), follow that request.
