# Asking the user

Whenever you need, or suspect you may need, an answer or choice from the user,
ask early. Prefer a quick clarification over silently guessing what the user
wants. When unsure whether the ambiguity changes their intended result, lean
toward asking. Answer questions you can settle by reading the code or docs
yourself.

This includes ambiguous requirements, design alternatives, and uncertainty about
user intent, including small choices you might otherwise resolve silently.
Choosing a Linear issue is task input, not a request to expand sandbox permissions.

When a structured question tool is usable in the current host and mode, call it.
Do not replace the tool call with a question or numbered options in chat and wait
for a prose reply. Prefer `request_user_input_async` when available. Use
`request_user_input` only when its mode and purpose restrictions permit it;
that tool being Plan-only does not make an available async tool unusable.

For a choice, provide selectable options using the actual tool schema. Respect
its option limit and built-in free-text path; do not invent multi-select or
duplicate an automatically supplied Other option. Batch related questions when
supported.

After an async question is accepted, keep working on independent steps. Acceptance,
a preselected option, and elapsed time are not an answer. Wait for required input
before dependent actions; do not replace a pending tool question with another
question in chat.

Use one concise text question only if no structured question tool is usable,
the host requires text for that purpose, or the tool fails. Briefly state the
constraint. Non-interactive `codex exec` cannot collect an interactive answer;
when required input is missing, leave dependent work unchanged and return the
question for the caller.

Follow the current host's rules for permission requests. A local preference for
questions does not revoke authorization already given by the user or require a
new approval for every routine, reversible action. When approval is required,
complete the authorized preparation first so the user can review the concrete
result. Do not put permission requests into a tool that forbids them.
