---
description: How to split what you write — the sections of a reply, the parts of a document — so no two parts cover the same ground and no case falls between them.
trigger: always_on
glob:
---

# MECE

Anything split into parts should split cleanly: no two parts covering the same ground, nothing left uncovered. Both failures are quiet.

- **Overlap** reads as two separate points, so a reader weighs it twice, and the next edit updates one copy and leaves the other standing as a contradiction.
- **A gap** announces nothing at all. It just falls through.

One point, one place. If a paragraph restates the one above it in different words, cut it — don't soften it into "to be clear" or "in other words". Two adjacent sentences justifying the same thing from different angles are one sentence that hasn't been written yet.

Test a split by naming the part that owns a given case, then by naming a case no part owns. "Both" means a boundary is in the wrong place; "none" means a branch is missing. Either way the boundary is what to fix, not the wording.

**❌** Three branches cut on three different criteria, so they overlap and leave a hole at the same time:

> - Use the batch endpoint for large payloads.
> - Use the streaming endpoint when the caller is a browser.
> - Use the sync endpoint when latency matters.

A browser sending a large payload where latency matters hits all three, and two readers pick differently. A server job sending a small payload where latency doesn't matter hits none, and nothing in the list admits it.

**✅** One criterion, subdivided from there — every case lands in exactly one branch, and each branch says where it stops:

> - Payload under 1 MB: the sync endpoint.
> - 1 MB or more, response consumed as it arrives: the streaming endpoint.
> - 1 MB or more, response consumed whole: the batch endpoint.
