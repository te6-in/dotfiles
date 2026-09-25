abbr --add - --description="Change to the previous directory" "cd -"
abbr --add ... --description="Go up two directories" "../.."
abbr --add .... --description="Go up three directories" "../../.."

abbr --add rm --description="Remove files, prompting for each" "rm -i"

abbr --add prj --description="Change to ~/Projects" "cd $HOME/Projects"
abbr --add dotfiles --description="Open dotfiles in VS Code" "code $HOME/Projects/dotfiles"

abbr --add brewup --description="Update, upgrade, clean up and check Homebrew" "brew update && brew upgrade && brew outdated && brew autoremove && brew cleanup && brew doctor"
abbr --add yt-dlpx --description="Download audio only as best-quality m4a" "yt-dlp -x --audio-format m4a --audio-quality 0"
abbr --add randstr --description="Copy a random alphanumeric string" --set-cursor=LEN "LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c LEN | pbcopy; echo copied (pbpaste | wc -c | string trim) chars"

abbr --add dock-lock --description="Freeze the Dock's contents" "defaults write com.apple.Dock contents-immutable -bool true; killall Dock"
abbr --add dock-unlock --description="Unfreeze the Dock's contents" "defaults write com.apple.Dock contents-immutable -bool false; killall Dock"

abbr --add c --description="Open the current directory in VS Code" "code ."
abbr --add f --description="Open the current directory in Fork" "fork ."

abbr --add cc --description="Start Claude Code" "claude"
abbr --add ccr --description="Resume a Claude Code session" "claude --resume"

abbr --add cx --description="Start Codex" "codex"
abbr --add cxr --description="Resume a Codex session" "codex resume"

abbr --add b --description="Run a bun script" "bun run"
abbr --add bd --description="Start the bun dev server" "bun run dev"
abbr --add bi --description="Install dependencies with bun" "bun i"
abbr --add bb --description="Build with bun" "bun run build"
abbr --add bx --description="Run a package binary with bunx" "bunx"

abbr --add y --description="Run yarn" "yarn"
abbr --add yd --description="Start the yarn dev server" "yarn run dev"
abbr --add yb --description="Build with yarn" "yarn run build"

abbr --add p --description="Run pnpm" "pnpm"
abbr --add pi --description="Install dependencies with pnpm" "pnpm i"
abbr --add pd --description="Start the pnpm dev server" "pnpm run dev"
abbr --add pb --description="Build with pnpm" "pnpm run build"

abbr --add kp --description="Free the common dev-server ports" killports

abbr --add pl --description="Run portless" "portless"
abbr --add plr --description="Start a dev server on a portless route" "portless run"
abbr --add pll --description="List running portless routes" "portless list"
abbr --add plg --description="Print one route's URL" --set-cursor=NAME "portless get NAME"
abbr --add pld --description="Diagnose the portless proxy" "portless doctor"
abbr --add plo --description="Open a portless route in the browser" --set-cursor=NAME "open \$(showurl \$(plurl NAME))"

abbr --add simsaf --description="Open a portless route in the iOS simulator" --set-cursor=NAME "xcrun simctl openurl booted \$(showurl \$(plurl NAME))"
abbr --add simsafu --description="Open a URL in the iOS simulator" --set-cursor=URL "xcrun simctl openurl booted \$(showurl 'URL')"

abbr --add andshell --description="Open a portless route in the Android WebView shell" --set-cursor=NAME "adb shell am start -n org.chromium.webview_shell/.WebViewBrowserActivity -d \$(showurl \$(plurl NAME))"
abbr --add andshellu --description="Open a URL in the Android WebView shell" --set-cursor=URL "adb shell am start -n org.chromium.webview_shell/.WebViewBrowserActivity -d \$(showurl 'URL')"
