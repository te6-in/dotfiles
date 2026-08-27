# Notion

When not specified, make a new page under the database whose ID is in the `$NOTION_DEFAULT_DATABASE_ID` environment variable. If the env var is not set, ask the user (via AskUserQuestion) which database to use before creating the page.

When writing a new document, prepend a red background callout (NOT quotation/quote) which reads: `LLM 도구로 작성한 글 ({{the model (you)}})`, without callout emoji.

Don't use dividers — headings already separate sections, so a divider on top of one is redundant noise.
