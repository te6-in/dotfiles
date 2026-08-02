# Cache `brew shellenv fish` and only regenerate when Homebrew changes, so the
# hot path is a plain `source` instead of spawning brew (Ruby) + path_helper
# (~110ms) on every shell. Sentinels: the shellenv source (tracks output-format
# changes precisely) and the brew launcher (stable fallback if that path moves).
# The explicit `fish` arg avoids zsh-syntax output (Homebrew/brew#21388).
# Force a refresh by deleting the cache file.
set -l brew_bin /opt/homebrew/bin/brew
set -l brew_shellenv_src /opt/homebrew/Homebrew/Library/Homebrew/cmd/shellenv.sh
set -l brew_shellenv_cache $__fish_cache_dir/brew_shellenv.fish

if not test -f $brew_shellenv_cache; or test $brew_shellenv_cache -ot $brew_bin; or test $brew_shellenv_cache -ot $brew_shellenv_src
    mkdir -p $__fish_cache_dir
    $brew_bin shellenv fish >$brew_shellenv_cache
end
source $brew_shellenv_cache

# fnm needs to find homebrew first
fnm env --use-on-cd --log-level=quiet --shell fish | source
