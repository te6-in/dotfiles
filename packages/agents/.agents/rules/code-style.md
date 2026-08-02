---
description: JavaScript, TypeScript, and React code style conventions.
paths: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,vue,svelte,astro,mdx}"]
trigger: glob
glob: "**/*.ts, **/*.tsx, **/*.mts, **/*.cts, **/*.js, **/*.jsx, **/*.mjs, **/*.cjs, **/*.vue, **/*.svelte, **/*.astro, **/*.mdx"
---

# Code Style

## JavaScript Syntax

General JavaScript syntax preferences beyond what the formatter enforces. Since TypeScript is a superset of JavaScript, every rule below applies to `.ts` / `.tsx` code as well. TypeScript-specific rules live under `## TypeScript`.

### Declarations: `function` for multi-statement, arrow `const` for single expression

```ts
// ✅ Multi-statement body → named function
export function createToken(input: string): Token {
  const normalized = input.trim().toLowerCase();
  if (!normalized) throw new Error("empty");

  return { value: normalized };
}

// ✅ Single expression → const + arrow
export const getContentId = (id: string) => `content:${id}`;

// ✅ Curried factory whose body is a single call
export const createHandler = (ctx: Ctx) =>
  defineHandler(ctx.key, (node) => { ... });

// ❌ Avoid block-bodied arrow assigned to const for multi-statement code
export const createToken = (input: string) => { ...multiple statements... };
```

### Early return with a blank line after the guard

Exit on guards at the top; separate them from the real body with exactly one blank line.

```ts
// ✅
function process(x: Input | null) {
  if (!x) return;

  const y = derive(x);
  ...
}

// ❌ — body glued to guard
function process(x: Input | null) {
  if (!x) return;
  const y = derive(x);
}
```

### One-line early returns: no braces

```ts
// ✅
if (!ready) return;
if (event.defaultPrevented) return;
if (!x) return null;

// ❌
if (!ready) {
  return;
}
```

Only add braces when more than one statement follows.

### Destructuring placement: pick based on how the argument is used

Decide per function, not by blanket default.

- **Destructure in the signature** when you want inline default values, or when you're pulling out a few fields and forwarding the rest via `...rest`.
- **Keep the argument whole** (destructure in the body) when you need to pass the object through to another function as-is, or when destructuring at multiple layers would bloat the signature.

```ts
// ✅ Signature — inline defaults
export function paginate({ page = 1, size = 20 }: PaginationOpts) {
  ...
}

// ✅ Signature — pull one field out, forward the rest
export function wrap({ internal, ...forwarded }: Options) {
  return inner(forwarded);
}

// ✅ Body — pass the whole object through, refer to it by name
export function useThing(props: UseThingProps) {
  const { open, setOpen } = useThingState(props);
  const { disabled } = props;
  ...
}
```

### Group declarations into stanzas with single blank lines

Inside a function body, separate logical groups of declarations by a single blank line. Don't cram everything together; don't double-space.

```ts
// ✅
function useThing(props: Props) {
  const { open, setOpen } = useState(props);
  const { disabled } = props;

  const id = genId();
  const contentId = `content:${id}`;

  const ref = createRef();
  const [height, setHeight] = useState<number>();

  const hidden = !open;
  ...
}
```

### `??` over `||` for fallbacks

Use `??` whenever the fallback should only apply to `null`/`undefined`. Reach for `||` only when you genuinely want `0`, `""`, and `false` to trigger the fallback.

```ts
// ✅
const timeout = config.timeout ?? 5000;
const label = props.label ?? "Default";

// ❌ — treats 0 / "" as missing
const timeout = config.timeout || 5000;
```

### Arrow returning an object: wrap with `(...)`, don't open a block

```ts
// ✅
items.map((item) => ({ id: item.id, label: item.name }));
useMemo(() => ({ open, setOpen }), [open, setOpen]);

// ❌
items.map((item) => {
  return { id: item.id, label: item.name };
});
```

Only open a block body when you need multiple statements (guards, side effects).

### Discarded tuple slots: `_` placeholder

```ts
// ✅
Object.entries(data)
  .filter(([_, value]) => value !== null)
  .map(([key]) => key);

// ❌ — harder to read at a glance
Object.entries(data).filter(([, value]) => value !== null);
```

### Inline single-use, non-exported declarations

If a type, function, or variable is used exactly once and isn't exported, inline it rather than giving it a name. A separate declaration adds navigation cost for the reader without the payoff of reuse or a public API surface.

Extract only when one of these applies:

- The value / function / type is used in more than one place.
- It's exported (the name itself is part of the public API).
- Inlining would genuinely hurt readability — usually when the expression is complex enough that a meaningful name earns its keep at the call site.

```ts
// ❌ Intermediate variable the reader has to track across one hop
const trimmed = input.trim();
return trimmed.toLowerCase();

// ✅ Inline
return input.trim().toLowerCase();

// ❌ Single-use comparator extracted into a named arrow
const byCreatedAt = (a: Item, b: Item) => b.createdAt - a.createdAt;
return items.sort(byCreatedAt);

// ✅ Inline
return items.sort((a, b) => b.createdAt - a.createdAt);

// ❌ Type alias used exactly once, only to label a small object shape
type PaginationArgs = { page: number; size: number };
function paginate<T>(items: T[], { page, size }: PaginationArgs) { ... }

// ✅ Inline
function paginate<T>(items: T[], { page, size }: { page: number; size: number }) { ... }

// ✅ Worth extracting — the name does explanatory work at the call site
const hasValidPaymentMethod =
  user.cards.some((c) => !c.expired) ||
  (user.wallet.balance > amount && !user.wallet.frozen);
if (hasValidPaymentMethod) { ... }
```

### Conditional inclusion: spread over ternary-to-`undefined`

When conditionally adding a key to an object, an item to an array, or a prop in JSX, prefer the spread pattern over a ternary that falls back to `undefined`.

```ts
// ✅ Object key
const payload = { id, ...(includeMeta && { meta }) };

// ✅ Array item
const middlewares = [base, ...(devMode ? [devLogger] : [])];

// ✅ JSX prop
<Button {...(disabled && { "aria-disabled": true })} />

// ❌ Ternary to undefined
const payload = { id, meta: includeMeta ? meta : undefined };
<Button aria-disabled={disabled ? true : undefined} />
```

An absent key isn't the same as one explicitly set to `undefined` — `in` checks differ, destructuring defaults don't apply to explicit `undefined`, and downstream consumers (React, validators, JSON serializers) may treat the two cases differently.

### Drop a field via destructure + rest, not `delete`

```ts
// ✅ — immutable, clear intent
const { debug, ...cleaned } = options;
return cleaned;

// ❌ — mutates input
delete options.debug;
return options;
```

### Reshape objects via `Object.fromEntries(Object.entries(x).map(...))`

Prefer the pipeline over manual loops for filtering/mapping an object's keys. Combine with rest-spread destructuring to drop a field.

```ts
// ✅ Good
Object.fromEntries(
  Object.entries(defs).map(([key, { defaultValue, ...rest }]) => [key, rest]),
);

// ❌ Avoid — imperative, more lines, easier to mis-type
const out: Record<string, T> = {};
for (const key in defs) {
  const { defaultValue, ...rest } = defs[key];
  out[key] = rest;
}
```

### Array vs object literal: pick the shape that matches how you read it

- **Array** when you sweep through entries and the key name doesn't matter (`for..of`, `find`, `filter`, `map`).
- **Object** when the key itself carries meaning — lookup by name, distinct roles per entry, or downstream access via `X.specificKey`.

Don't invent keys just to use an object. If every usage site is `Object.values(X)` or `Object.keys(X)`, an array was the right container.

```ts
// ✅ Array — iterating through interchangeable candidates
const PREFIX_KEYS = [
  components.componentItemPrefixCheckbox.key,
  components.componentItemPrefixRadiomark.key,
  components.componentItemPrefixIcon.key,
];

for (const key of PREFIX_KEYS) {
  const found = findByKey(key);
  if (found) return found;
}

// ✅ Object — each key names a distinct role accessed by name
const TRANSITIONS = {
  ENTER_DURATION: 0.3,
  EXIT_DURATION: 0.2,
  OVERLAY_ENTER_TIMING_FUNCTION: "cubic-bezier(0, 0, 0.15, 1)",
};

element.style.transitionDuration = `${TRANSITIONS.ENTER_DURATION}s`;

// ❌ Object with arbitrary keys that you only ever iterate
const PREFIX_KEYS = {
  checkmark: "...",
  radiomark: "...",
  icon: "...",
} as const;

for (const key of Object.values(PREFIX_KEYS)) { ... }  // signal this should have been an array
```

### Sort generated or extracted lists alphabetically

Any list that'll be checked into the repo as generated output — codegen artifacts, metadata tables, static entries — sort with `localeCompare` before writing. It keeps diffs small and deterministic: adding one entry shows a single insertion at its sorted position instead of reshuffling unrelated lines.

```ts
// ✅ Sort at the end of the pipeline
const metadata = (await getMetadataItems({ fileKey }))
  .filter(filter)
  .map(transform)
  .sort((a, b) => a.name.localeCompare(b.name));

// ✅ Bare string/id arrays too
const ids = rawIds.sort((a, b) => a.localeCompare(b));

// ✅ Tuple entries
Object.entries(data).sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
```

Applies to: codegen/extraction output, registry/manifest files, anything a human will see in `git diff`.
Doesn't apply to: order-carrying business data (priority lists, render order, user-specified sequences).

## TypeScript

These are general preferences for TS code. Every rule below is Scope: everywhere unless tagged otherwise — a few are looser in scripts/CLIs where bundle size doesn't matter.

### `as const` + `satisfies` for literal constants

Prefer `as const satisfies T` over `: T =` when defining literal tables. It validates the shape without widening the literal types, so downstream indexed access (`T[K]`) still yields the narrow union.

```ts
// ✅ Good — narrow literal types are preserved, shape is validated
const SIZES = [
  { min: 0, scale: "small" },
  { min: 10, scale: "large" },
] as const satisfies ReadonlyArray<{ min: number; scale: string }>;

const MAP = {
  brand: { color: "red" },
  neutral: { color: "gray" },
} as const satisfies Record<Tone, { color: string }>;

// ❌ Avoid — widens literals, loses narrow types
const SIZES: Array<{ min: number; scale: string }> = [ ... ];
```

### Derive types from values, not the other way around

Don't redeclare what the compiler can infer. Use `typeof`, `T["key"]`, `ReturnType<typeof fn>`, and `z.infer<typeof schema>` to keep types tied to a single source of truth.

```ts
// ✅ Good
const tones = ["brand", "neutral", "critical"] as const;
type Tone = (typeof tones)[number];

type UseThingReturn = ReturnType<typeof useThing>;

const optSchema = z.object({ verbose: z.boolean() });
type Opts = z.infer<typeof optSchema>;

// ❌ Avoid — two sources of truth that will drift
type Tone = "brand" | "neutral" | "critical";
const tones: Tone[] = ["brand", "neutral", "critical"];
```

### Don't annotate return types unless the annotation does real work

Default to inferred return types — hand-written annotations add maintenance cost and can drift from the body while inference stays accurate. Applies to any function, exported or internal.

Annotate the return only when the annotation does something the body alone doesn't:

- **Contract enforcement** — the function must conform to an external signature (plugin, adapter, callback that's passed somewhere typed). Annotating locks the return to the contracted shape.
- **Named-type lock-in for factories** — the function produces a value that's meant to be used as a specific named interface (`Handler<T>`, `Recipe`, etc.), so callers see the intended name instead of a structural inference.
- **Single-purpose utilities** whose return is a small named type (`Size`, `Result`, `ParsedUrl`), where the annotation acts as a lightweight contract and catches mistakes at the return site.

If none of those apply — especially for complex returns assembled over many lines whose shape the caller can derive via `ReturnType<typeof fn>` — skip the annotation.

```ts
// ❌ Redundant — complex return duplicated as an annotation that has to be maintained
export function useThing(props: UseThingProps): UseThingReturn {
  // ... lots of state, memo, derived props ...
  return { open, setOpen, api, stateProps, ... };
}

// ✅ Inferred; derive the name at the use site only when needed
export function useThing(props: UseThingProps) {
  // ... lots of state, memo, derived props ...
  return { open, setOpen, api, stateProps, ... };
}
export type UseThingReturn = ReturnType<typeof useThing>;

// ✅ Factory — annotation carries the generic and locks the return to a named contract
export function defineHandler<T>(
  key: string,
  transform: (node: Node<T>) => Element,
): Handler<T> {
  return { key, transform };
}

// ✅ Simple utility — annotation acts as a lightweight contract
function computeSize(input: Input): Size {
  return { width: input.w * 2, height: input.h * 2 };
}
```

### Don't re-annotate what contextual typing already provides

When you pass a callback into a function/prop whose parameter type is already known — event handlers, array methods, typed option callbacks — leave the parameters untyped. TypeScript's contextual typing applies the correct, most specific type automatically. Re-annotating is redundant at best and silently widens/narrows the type at worst.

```ts
// ✅ Trust contextual typing
<button onClick={(event) => handleClick(event)} />
items.map((item) => item.id);
options.onReady((context) => { ... });

// ❌ Redundant — restates what the caller already declared
<button onClick={(event: React.MouseEvent<HTMLButtonElement>) => ...} />
items.map((item: Item) => item.id);

// ❌ Worse — silently widens.
// React.MouseEvent defaults to MouseEvent<Element>, losing HTMLButtonElement specificity,
// so currentTarget/target end up less precise than what onClick actually provides.
<button onClick={(event: React.MouseEvent) => ...} />
```

Only annotate when you genuinely can't get the type from context — e.g., a standalone function defined elsewhere that'll later be passed in.

### Chain utility types instead of hand-writing derived shapes

When a type exists nearby, reach for `NonNullable`, `Exclude`, `Pick`, `Omit`, `Parameters`, `ReturnType`, `ConstructorParameters`, and indexed access to carve it into the shape you need. This keeps the derived type in lockstep with the source.

```ts
// ✅ Good
type CloseReason = Exclude<NonNullable<DialogProps["onOpenChange"]>, ...>;
type SecondArg = Parameters<NonNullable<Props["onChange"]>>[1];
type AccessibilityOpts = NonNullable<ConstructorParameters<typeof Accessibility>[1]>;

// ❌ Avoid — manually restating what the source type already knows
type CloseReason = "closeButton" | "escapeKeyDown" | "interactOutside";
```

### XOR fields via discriminated union with `?: never`

When two fields are mutually exclusive, encode it in the type so callers get a compile error if they mix them.

```ts
// ✅ Good
type AuthOptions =
  | { token: string; apiKey?: never }
  | { token?: never; apiKey: string };

// ❌ Avoid — both allowed, runtime guard needed
interface AuthOptions {
  token?: string;
  apiKey?: string;
}
```

### Avoid `!` non-null assertion

Use a guard, an early throw, or `?? fallback` instead. `!` silently swallows a bug the day the invariant breaks.

```ts
// ✅
const value = map.get(key);
if (!value) throw new Error(`missing: ${key}`);
value.push(x);

// ✅
const value = map.get(key) ?? [];

// ❌
map.get(key)!.push(x);
```

### Avoid `any` / `as unknown` — ask before using, report if already used

No implicit `any`, no explicit `any`, no `as unknown` escape hatches. If you believe a situation genuinely requires one (e.g., an upstream type is broken), **stop and ask the user before writing it** — explain what's forcing your hand and propose the alternatives you considered.

If you realize partway through that you've already written one (or inherited one from a tool-generated diff), **report it explicitly** in your next message to the user rather than leaving it buried in the diff. Don't silently disable the lint rule.

When the user has approved it, disable the lint rule inline with a specific reason:

```ts
// ✅ Only after user approval
// biome-ignore lint/suspicious/noExplicitAny: matches upstream @stackflow/react's `initialContext: any`
| ((args: { initialContext?: any }) => Options)

// ❌ Never without asking
const x = value as unknown as SomeType;
const y: any = whatever;
```

### `ts-pattern` `match().with().exhaustive()` — scripts only

`ts-pattern` is a runtime dependency that adds bundle weight. Use it freely in codegen, CLIs, Node scripts, build tooling, Figma plugins. **Do not** introduce it into code that ships to a consumer browser bundle.

```ts
// ✅ Scripts / codegen / CLI
const { tag } = match(value)
  .with("A", () => ({ tag: "X" as const }))
  .with("B", () => ({ tag: "Y" as const }))
  .exhaustive();
```

For consumer browser code, do not substitute a hand-rolled `never`-exhaustive switch or any other clever workaround — pick the plainest control flow that fits the actual problem (a simple `if`/`switch`, a lookup object, or whatever reads naturally at the call site). When in doubt, ask the user.

## React

### Don't type components as `React.FC` / `React.FunctionComponent`

Declare components as plain functions (or named `const` arrows for trivial ones) and type the props argument directly. `React.FC` implicitly adds `children`, makes generics awkward, and discourages default-value destructuring in the signature.

```tsx
// ✅ Plain function declaration
interface CardProps {
  title: string;
  onSelect?: () => void;
}

export function Card({ title, onSelect }: CardProps) {
  return <button onClick={onSelect}>{title}</button>;
}

// ✅ Generic component reads cleanly without FC
export function List<T>({
  items,
  render,
}: {
  items: T[];
  render: (item: T) => React.ReactNode;
}) {
  return <ul>{items.map(render)}</ul>;
}

// ❌ Avoid
export const Card: React.FC<CardProps> = ({ title, onSelect }) => (
  <button onClick={onSelect}>{title}</button>
);
```

### Avoid IIFE for derived `const` in render paths

`const x = (() => { ... })()` inside a render function creates a new closure every render and obscures stack traces. Prefer these in order:

1. Hoist a `const` mapping table outside the component (`as const satisfies Record<...>`) and index it.
2. Use early return to exit before the branch.
3. Extract a plain function (not a hook) above the component.
4. Only then consider IIFE.

```tsx
// ❌ Avoid in render path
function Component({ size }: Props) {
  const style = (() => {
    switch (size) {
      case "sm":
        return smallStyle;
      case "lg":
        return largeStyle;
    }
  })();
  return <div style={style} />;
}

// ✅ Hoisted const table
const SIZE_STYLE = {
  sm: smallStyle,
  lg: largeStyle,
} as const satisfies Record<Size, Style>;

function Component({ size }: Props) {
  return <div style={SIZE_STYLE[size]} />;
}
```

Scope: render paths = avoid; scripts/CLIs = fine.
