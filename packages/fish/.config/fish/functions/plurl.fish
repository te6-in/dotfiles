function plurl --description 'Print a portless URL — a named service, or the only route currently running'
    # With a name, defer to portless so worktree prefixing stays its job.
    if test (count $argv) -gt 0
        portless get $argv
        return $status
    end

    # Without one, read the live routes instead of re-deriving portless's name inference
    # (portless.json -> package.json -> git root), which would drift from the real thing.
    # The *p abbreviations open an already-running dev server, so a route always exists.
    set -l urls (portless list 2>/dev/null | string match -rg '(https?://\S+)')

    switch (count $urls)
        case 0
            echo "plurl: no portless routes are running" >&2
            return 1
        case 1
            echo $urls[1]
        case '*'
            echo "plurl: "(count $urls)" routes running — name one:" >&2
            printf '  %s\n' $urls >&2
            return 1
    end
end
