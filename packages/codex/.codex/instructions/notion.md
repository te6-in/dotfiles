# Notion

Unless the user specifies another destination, create a new page under the
database in `$NOTION_DEFAULT_DATABASE_ID`. If it is unset, ask which database to
use before creating the page, using the current host's supported question flow.

Discover the connected Notion tools and inspect their schemas. If the connector
uses a data-source identifier rather than a database identifier, resolve the
database to the supported parent before writing; do not reinterpret IDs by
guessing.

Prepend a red-background callout, not a quotation, with this text and no emoji:
`LLM 도구로 작성한 글 ({{the model (you)}})`. Use the actual model attribution
provided by the active instructions; when it is unavailable, use `Codex`.
If the connected tool cannot represent the required callout, report that
limitation instead of silently changing the format.

Do not use dividers; headings already separate sections.
