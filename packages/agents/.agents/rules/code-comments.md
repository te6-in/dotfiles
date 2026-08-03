---
description: When a comment earns its place in source code, and when the code should carry the meaning instead.
trigger: always_on
glob:
---

# Code comments

Applies to every language. The default is **no comment** — reach for one only when the code cannot carry the information itself.

## Two tests before writing one

1. **Delete and rebuild.** If a reader could reconstruct the comment from the code alone, it's redundant.
2. **Would they ask?** If someone who knows this codebase wouldn't stop and ask that question, don't answer it. If the answer sits three lines up or down, don't answer it either.

## Write for the next reader, not for this diff's reviewer

The most common bad comment explains *the change* instead of *the code*. What the code used to do, why the approach was swapped, which alternative lost — that belongs in the commit message and the PR, where it stays attached to the change. In the source it turns into noise the moment the diff merges.

```ts
// ❌ Explains the change; the old code isn't here any more
// Sniffing would have read this as a dimension and left the disagreement for
// the analyzer; dispatching on the declared type catches it here instead.
expect(() => parse(yaml)).toThrow('is declared as "color"');
```

## What earns a comment

Each of these carries something the code physically can't.

**Absence** — you can't grep for a thing that isn't there.

```ts
// ✅
/**
 * Deliberately absent from `parseValue`: a bare word has no shape to recognise, so
 * sniffing would accept every unrecognised string and turn a typo into a silent
 * enum value.
 */
function parseEnum(expr: unknown) { ... }
```

**A constraint that makes correct code look wrong.**

```ts
// ✅
/**
 * Kept out of `Value`: being `string`, it would swallow the template-literal
 * members and stop them rejecting a malformed colour or dimension.
 */
export type Enum = string;
```

**An invariant the type system can't state** — name who upholds it and what a violation means.

```ts
// ✅
// Callers filter token refs with `isTokenRef` before dispatching here, so
// reaching one is a caller bug.
if (result.kind === "TokenLit") throw new Error(...);
```

**A consequence the line doesn't telegraph.**

```ts
// ✅
// A slot holding nothing but enums, or a state left with no slots, would publish
// an empty object where consumers expect values.
if (Object.keys(property).length === 0) continue;
```

**Why a dead-looking branch exists**, so nobody deletes it.

**Facts from outside the repo** — spec quirks, browser or platform bugs, upstream API behavior. Link the source.

**Boilerplate the file already commits to.** If every sibling declaration carries a one-line doc header, match it; consistency beats trimming one entry.

## What doesn't

- **Restating the next line.** If the type already says `values?: never` vs `values: string[]`, don't write a sentence saying the same.
- **Narrating control flow.** "X is settled first, then Y" — the order is right there.
- **Development history.** Rejected approaches, "we used to…". Git has it.
- **Speculation.** "If token declarations ever gain a declared type, this could go away." Not actionable, and it rots.
- **The same rationale twice.** When two adjacent declarations explain one problem, keep it on the one that owns it.
- **A comment standing in for a name.** If a line is needed to say what a variable holds, rename the variable.
- **Doc blocks that restate the signature.** `@param name The name.`

## Length

A sentence or two. A six-line block over a four-line function is a smell unless it's public API. When the explanation genuinely needs a paragraph, first check whether a clearer structure, a better name, or a type would remove the need for it.
