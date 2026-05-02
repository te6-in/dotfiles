# git worktree helper: creates a worktree in a sibling directory <repo>-worktrees/<branch> and cd into it. -b to create new branch
function gwt
    set create_branch false
    set branch ""

    if test "$argv[1]" = "-b"
        set create_branch true
        set branch "$argv[2]"
    else
        set branch "$argv[1]"
    end

    if test -z "$branch"
        echo "Usage: gwt [-b] <branch-name>"
        echo "  -b: create new branch"
        return 1
    end

    set main_worktree (git worktree list --porcelain | head -1 | string replace "worktree " "")
    set repo_name (basename "$main_worktree")
    set parent_dir (dirname "$main_worktree")
    set worktree_dir (string replace -a "/" "-" "$branch")
    set worktree_path "$parent_dir/$repo_name-worktrees/$worktree_dir"

    if test "$create_branch" = true
        git worktree add -b "$branch" "$worktree_path"
        or return 1
    else
        git worktree add "$worktree_path" "$branch"
        or return 1
    end

    cd "$worktree_path"
end
