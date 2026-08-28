---
description: How non-ASCII text has to be encoded inside tool-call parameters.
trigger: always_on
glob:
---

# Tool parameter encoding

Write Korean — and every other non-ASCII string — into tool-call parameters as literal UTF-8. Never as `\uXXXX` escapes. This covers every tool alike: internal tool options, MCP payloads, and the command string handed to the shell.
