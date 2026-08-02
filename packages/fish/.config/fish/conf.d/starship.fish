# Cache `starship init fish --print-full-init` and only regenerate when the
# starship binary changes (i.e. after an upgrade). The hot path is a plain
# `source` instead of running starship twice + psub/mktemp/rm (~25ms) on every
# shell. The init output is config-independent (starship.toml is read at render
# time), so the binary mtime is a precise, stable sentinel. STARSHIP_SESSION_KEY
# stays per-shell: it's `(random)` code in the cached file, run at source time.
# Force a refresh by deleting the cache file.
set -l starship_bin /opt/homebrew/bin/starship
set -l starship_init_cache $__fish_cache_dir/starship_init.fish

if not test -f $starship_init_cache; or test $starship_init_cache -ot $starship_bin
    mkdir -p $__fish_cache_dir
    $starship_bin init fish --print-full-init >$starship_init_cache
end
source $starship_init_cache
