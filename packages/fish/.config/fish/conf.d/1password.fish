source $HOME/.config/op/plugins.sh

abbr --add vsce --description="Run vsce with 1Password secrets injected" "op run --account=my.1password.com --env-file="$HOME/.env.personal.1password" -- command vsce"
