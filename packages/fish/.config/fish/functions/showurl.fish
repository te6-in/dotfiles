function showurl --description 'Print a URL in bold, then pass it through unchanged'
    if test (count $argv) -eq 0
        echo "showurl: no URL to show" >&2
        return 1
    end

    # Bold copy goes to stderr: every caller wraps this in a command substitution,
    # which would otherwise swallow it into the URL being handed to the launcher.
    set_color --bold >&2
    printf '%s\n' $argv >&2
    set_color normal >&2

    printf '%s\n' $argv
end
