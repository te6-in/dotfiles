if status is-interactive

  set --global --export EDITOR cot --wait

  # no welcome message
  set --global fish_greeting

  # Chosen per session, never saved: `theme save` writes universal variables,
  # and those stop following the terminal once it switches between light and
  # dark. Naming the fallback matters — when the terminal has not answered,
  # fish_terminal_color_theme is unset, and a bare `choose` then matches no
  # section, sets no colors, and still exits 0.
  if set -q fish_terminal_color_theme
    fish_config theme choose material-stone
  else
    fish_config theme choose material-stone --color-theme=unknown
  end

  if test "$PWD" = "$HOME"
      cd $HOME/Projects
  end

end
