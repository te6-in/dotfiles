# git worktree helper: creates a worktree in <parent>/worktrees/<repo>/<branch>.
# -b to create a new branch, -p to check out a pull request, --cd to move into it afterwards.
function gwt
    argparse --name=gwt b/new-branch= p/pr= cd -- $argv
    or return 1

    if set -q _flag_new_branch; and set -q _flag_pr
        echo "gwt: -b and -p are mutually exclusive"
        return 1
    end

    set -l mode checkout
    set -l target "$argv[1]"

    if set -q _flag_new_branch
        set mode create
        set target "$_flag_new_branch"
    else if set -q _flag_pr
        set mode pr
        set target "$_flag_pr"
    end

    if test -z "$target"
        echo "Usage: gwt [--cd] <branch-name>"
        echo "       gwt [--cd] -b <branch-name>"
        echo "       gwt [--cd] -p <pr-number|url|branch>"
        echo "  -b, --new-branch: create new branch"
        echo "  -p, --pr:         check out a pull request's head branch"
        echo "      --cd:         cd into the worktree afterwards"
        return 1
    end

    # the directory is named after the PR's head branch, so `gwt -p` and `gwt` land in the
    # same place for the same branch. gh may still pick a different *local* branch name for
    # a fork PR whose head matches the base repo's default branch — it prefixes the owner.
    set -l branch "$target"
    if test "$mode" = pr
        set branch (gh pr view "$target" --json headRefName -q .headRefName)
        or return 1
        if test -z "$branch"
            echo "gwt: no head branch found for PR $target"
            return 1
        end
    end

    set -l main_worktree (git worktree list --porcelain | head -1 | string replace "worktree " "")
    set -l repo_name (basename "$main_worktree")
    set -l parent_dir (dirname "$main_worktree")
    set -l worktree_dir (string replace -a "/" "-" "$branch")
    set -l worktree_path "$parent_dir/worktrees/$repo_name/$worktree_dir"

    switch $mode
        case create
            git worktree add -b "$branch" "$worktree_path"
            or return 1
        case pr
            # gh owns the fetch: a same-repo PR tracks origin/<branch>, a fork PR without a
            # remote comes from refs/pull/<n>/head. It creates the worktree itself, and reuses
            # one already sitting at that path, so re-running is a no-op plus a refresh.
            gh pr checkout "$target" --worktree "$worktree_path"
            or return 1
        case '*'
            git worktree add "$worktree_path" "$branch"
            or return 1
    end

    if set -q _flag_cd
        cd "$worktree_path"
    else if test "$mode" != pr
        # `git worktree add` never names the path it wrote to; gh already does.
        echo "gwt: $worktree_path"
    end
end
