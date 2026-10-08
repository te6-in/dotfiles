# Notifications

When the user explicitly asks to be notified about completion or a condition,
use a notification mechanism actually available in the current host. Discover
an available notification tool or an already configured mechanism; do not
assume a tool with a particular name exists. For a later check or recurring
monitor, use the host's supported automation tool and preserve the requested
notification condition. Keep unchanged or non-actionable monitoring quiet unless
the user asked for periodic updates.

Confirm in chat what notification has actually been arranged. Do not promise a
push before the mechanism is available and the setup succeeds. If the host
provides only its normal task-completion notification, describe that honestly;
if no delivery mechanism is available, say so. Do not create a new external
delivery channel or send to another person without authorization.

Post the full result in chat too. The notification draws attention; the task
holds the detail. A workflow wait, background process, or monitor reaching its
stop condition follows the same rule.

For an immediate notification requested by the user on this host, prefer the
existing `~/.local/bin/notify` CLI when available. Use
`~/.local/bin/notify --source Codex -t '<brief sentence>' -m '<short summary>'`;
shell-quote the actual text. It uses the existing desktop and configured ntfy
channels. Do not run it automatically after every task.

The CLI launches delivery in the background: exit 0 means an attempt was queued,
not that a phone or desktop received it. Report that distinction and keep the full
result in chat. An unavailable channel or denied `topic.secret` fallback must not
be described as successful phone delivery. Do not print the topic or bypass secret
file restrictions; use an already available environment configuration or report
the missing channel. For later or recurring notifications, arrange the supported
automation instead of starting a sleeping shell process.
