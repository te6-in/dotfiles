/opt/homebrew/bin/brew shellenv | source

# fnm needs to find homebrew first
fnm env --use-on-cd --log-level=quiet --shell fish | source
