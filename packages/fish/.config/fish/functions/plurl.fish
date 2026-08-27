function plurl --description 'Print a portless URL — the route serving this directory, a named service, or the only one running'
    # With a name, defer to portless so worktree prefixing stays its job.
    if test (count $argv) -gt 0
        portless get $argv
        return $status
    end

    set -l listing (portless list 2>/dev/null)
    set -l urls (printf '%s\n' $listing | string match -rg '(https?://\S+)')

    # Live routes print their pid, and that process's cwd is the directory the dev server
    # was started in. Matching against it beats re-deriving portless's own name inference
    # (portless.json -> package.json -> git root -> directory name), which would drift from
    # the real thing and still couldn't tell two worktrees of one package apart.
    set -l pairs (printf '%s\n' $listing | string match -rg '(https?://\S+)\s+->\s+\S+\s+\(pid (\d+)\)')
    set -l pids
    set -l pidurls
    for i in (seq 1 2 (count $pairs))
        set -a pidurls $pairs[$i]
        set -a pids $pairs[(math $i + 1)]
    end

    set -l best
    set -l bestlen 0
    set -l pid

    if test (count $pids) -gt 0
        for field in (lsof -a -d cwd -p (string join , $pids) -Fpn 2>/dev/null)
            set -l value (string sub -s 2 -- $field)
            switch (string sub -l 1 -- $field)
                case p
                    set pid $value
                case n
                    if test "$PWD" != "$value"; and not string match -q -- "$value/*" "$PWD"
                        continue
                    end
                    # Deepest enclosing directory wins, so an app beats the monorepo above it.
                    set -l len (string length -- $value)
                    if test $len -gt $bestlen
                        set bestlen $len
                        set best $pidurls[(contains -i -- $pid $pids)]
                    end
            end
        end
    end

    if test -n "$best"
        echo $best
        return 0
    end

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
