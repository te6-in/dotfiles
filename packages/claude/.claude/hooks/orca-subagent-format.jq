def trunc($n): if length > $n then .[0:$n] + "…" else . end;
def oneline: gsub("\\s+"; " ") | ltrimstr(" ") | rtrimstr(" ");
def home: if $HOME == "" then . else gsub($HOME; "~") end;

def bold:  "\u001b[1m"  + . + "\u001b[22m";
def dim:   "\u001b[2m"  + . + "\u001b[22m";
# Bright black, not a 256-cube grey: slots 0-15 follow the terminal theme, 16-255
# do not. dim (2m) recedes too far for the line you actually scan.
def gray:  "\u001b[90m" + . + "\u001b[39m";
def cyan:  "\u001b[36m" + . + "\u001b[39m";
def amber: "\u001b[33m" + . + "\u001b[39m";
def green: "\u001b[32m" + . + "\u001b[39m";
def red:   "\u001b[31m" + . + "\u001b[39m";

def lines_of: (tostring | split("\n") | map(select(. != "")) | length);

# Just enough markdown for a streaming pane. A real renderer (glow, mdcat) needs
# a finished document, but lines arrive one at a time, so styling has to work per
# line and without shelling out of the tail | jq pipeline.
def md:
  if test("^[[:space:]]*#{1,6} ") then
    (sub("^(?<i>[[:space:]]*)#{1,6}[[:space:]]+"; "\(.i)") | bold)
  else
    # A link target is dead weight in a pane — never clickable, and usually the
    # same path the link text already names. Keep the text, drop the rest.
    gsub("\\[(?<t>[^\\]]+)\\]\\((?<u>[^)]+)\\)"; "\(.t)")
    | gsub("\\*\\*(?<t>[^*]+)\\*\\*"; "\u001b[1m\(.t)\u001b[22m")
    | gsub("(?<b>^|[^`])`(?<t>[^`]+)`"; "\(.b)\u001b[36m\(.t)\u001b[39m")
    | sub("^(?<i>[[:space:]]*)[-*][[:space:]]+"; "\(.i)• ")
  end;

# Keeps the model's own line breaks — headings, bullets and blank lines are the
# structure of the report — while continuation lines stay inside the "› " gutter
# instead of restarting at column 0.
def gutter($prefix; $indent):
  split("\n")
  | to_entries
  | map(if .key == 0 then $prefix + (.value | md)
        elif (.value | test("^[[:space:]]*$")) then ""
        else $indent + (.value | md) end)
  | join("\n");
def short_model: tostring | sub("^claude-"; "") | sub("-[0-9]{8}$"; "");

# Prefer the field that actually names the work; `input` shapes differ per tool.
def tool_arg:
  (.input.description // .input.file_path // .input.command // .input.pattern
   // .input.url // .input.prompt // (.input | tostring))
  | tostring | oneline | home | trunc(80);

# `toolUseResult` is structured per tool, so a result can report what it did
# instead of showing the first 140 bytes of whatever it returned.
def result_summary:
  if .file then
    ((.file.numLines // 0 | tostring) + " lines"
     + (if (.file.totalLines // 0) > (.file.numLines // 0)
        then " of " + (.file.totalLines | tostring) else "" end))
  elif .agentId then
    ("spawned · " + (.resolvedModel // "?" | short_model) + " · " + (.status // "?"))
  elif (.stdout != null or .stderr != null) then
    (if (.stdout // "") == "" then (.stderr // "") else .stdout end) as $raw
    # A command can exit 0 and still have written to stderr; that used to leak
    # into the preview, and summarising would now hide it outright.
    | (if (.stdout // "") != "" and (.stderr // "") != "" then " · stderr" else "" end) as $warn
    | ($raw | oneline | home) as $o
    | if $o == "" then "no output"
      elif ($o | length) <= 60 then $o + $warn
      else ($raw | lines_of | tostring) + " lines" + $warn
      end
  else empty end;

def fallback_summary:
  (if (.content | type) == "array"
   then (.content | map(select(.type == "text") | .text) | join(" "))
   else (.content | tostring) end)
  | oneline | home
  | if length <= 60 then . else (lines_of | tostring) + " lines" end;

if .type == "assistant" then
  (.message.content // [])[]
  | if .type == "text" then
      # Neither truncated nor flattened: this is the agent's actual report, the
      # one thing worth reading in full, and its markdown structure is most of
      # what makes it readable. Thinking is dropped entirely — it restated the
      # adjacent tool call and dominated the pane.
      "\n" + (.text | rtrimstr("\n") | home | gutter(("› " | cyan); "  ")) + "\n"
    elif .type == "tool_use" then
      ("→ " | amber) + ((.name | . + (" " * (if length < 7 then 7 - length else 1 end))) | bold)
        + ((tool_arg) | gray)
    else empty end

elif .type == "user" then
  . as $line
  | (.message.content // [])
  # The brief the agent was handed arrives as a plain string on the transcript's
  # first line, where every later user entry carries an array of tool results.
  | if type == "string" then
      "\n" + (rtrimstr("\n") | home | gutter(("» " | cyan); "  ")) + "\n"
    elif type == "array" then
      .[] | select(.type == "tool_result")
      | if .is_error then
          ("  ✗ " | red) + ((.content | tostring | oneline | home | trunc(90)) | red)
        else
          ("  ✓ " | green)
            + (((($line.toolUseResult // {}) | result_summary) // fallback_summary) | dim)
        end
    else empty end

else empty end
