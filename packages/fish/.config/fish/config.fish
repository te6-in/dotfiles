if status is-interactive

  set --global --export EDITOR cot --wait
  set --global --export ENABLE_LSP_TOOL 1

  # no welcome message
  set --global fish_greeting

  if test "$PWD" = "$HOME"
      cd $HOME/Projects
  end

end
