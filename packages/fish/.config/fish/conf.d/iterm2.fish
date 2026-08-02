source ~/.iterm2_shell_integration.fish

function iterm2_print_user_vars
  iterm2_set_user_var cwdTail (basename $PWD)
end
