# watch a GitHub Actions run from a pasted run/job URL, then fire a notification (desktop + ntfy) when it finishes.
# assumes cwd is the URL's repo — only the run id is parsed out of the URL, the owner/repo part is ignored.
# so paste any `.../actions/runs/<id>/...` link while sitting in that repo and it just works.
function ghw --description "Watch a GH Actions run from its URL, notify when done"
    set -l url $argv[1]
    if test -z "$url"
        echo "Usage: ghw <github-actions-run-or-job-url>"
        return 2
    end

    # grab the digits after /runs/ — matches both run (.../runs/<id>) and job (.../runs/<id>/job/<id>) URLs.
    set -l run_id (string match -rg '/runs/(\d+)' -- $url)
    if test -z "$run_id"
        echo "ghw: no run id found in URL: $url"
        return 2
    end

    # --exit-status makes watch exit non-zero when the run isn't a success, so $status drives the return code below.
    gh run watch $run_id --exit-status
    set -l rc $status

    set -l root (git rev-parse --show-toplevel 2>/dev/null)
    if test -z "$root"
        set root $PWD
    end
    set -l repo (basename $root)

    # watch's exit code only says pass / not-pass, so read the real conclusion for an honest label:
    # skipped and cancelled both make --exit-status non-zero, but neither is a genuine failure.
    set -l conclusion (gh run view $run_id --json conclusion -q '.conclusion' 2>/dev/null)
    test -z "$conclusion"; and set conclusion (test $rc -eq 0; and echo success; or echo failure)

    set -l icon
    set -l sound
    switch $conclusion
        case success
            set icon ✅
            set sound Hero
        case skipped neutral
            set icon ⏭
            set sound Pop
        case '*' # failure, cancelled, timed_out, action_required, startup_failure, stale, ...
            set icon ❌
            set sound Basso
    end

    # notify fans out to terminal-notifier and ntfy.sh; clicking either jumps straight to the run page.
    notify --source ghw -t "$icon $repo" -m "run $run_id · $conclusion" -s $sound -o "$url"

    # keep watch's exit code so `ghw <url>; and deploy` still gates on a real success.
    return $rc
end
