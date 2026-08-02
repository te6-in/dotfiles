abbr --add - "cd -"
abbr --add ... "../.."
abbr --add .... "../../.."

abbr --add rm "rm -i"

abbr --add prj "cd $HOME/Projects"
abbr --add dotfiles "code $HOME/Projects/dotfiles"

abbr --add brewup "brew update && brew upgrade && brew outdated && brew autoremove && brew cleanup && brew doctor"
abbr --add yt-dlpx "yt-dlp -x --audio-format m4a --audio-quality 0"
abbr --add randstr --set-cursor=LEN "LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c LEN | pbcopy; echo copied (pbpaste | wc -c | string trim) chars"

abbr --add crw "cmux rename-workspace"

abbr --add dock-lock "defaults write com.apple.Dock contents-immutable -bool true; killall Dock"
abbr --add dock-unlock "defaults write com.apple.Dock contents-immutable -bool false; killall Dock"

abbr --add c "code ."
abbr --add f "fork ."

abbr --add cc "claude"
abbr --add ccr "claude --resume"
abbr --add cct "cmux claude-teams"

abbr --add b "bun run"
abbr --add bd "bun run dev"
abbr --add bi "bun i"
abbr --add bb "bun run build"
abbr --add bx "bunx"

abbr --add y "yarn"
abbr --add yd "yarn run dev"
abbr --add yb "yarn run build"

abbr --add p "pnpm"
abbr --add pi "pnpm i"
abbr --add pd "pnpm run dev"
abbr --add pb "pnpm run build"

abbr --add kp killports

abbr --add pl "portless"
abbr --add pll "portless list"
abbr --add plg --set-cursor=NAME "portless get NAME"
abbr --add pld "portless doctor"

abbr --add simsaf --set-cursor=PORT "xcrun simctl openurl booted 'http://localhost:PORT'"
abbr --add simsafu --set-cursor=URL "xcrun simctl openurl booted 'URL'"
abbr --add simsafp --set-cursor=NAME "xcrun simctl openurl booted \$(plurl NAME)"

abbr --add emwv --set-cursor=PORT "adb shell am start -n org.chromium.webview_shell/.WebViewBrowserActivity -d 'http://10.0.2.2:PORT'"
abbr --add emwvu --set-cursor=URL "adb shell am start -n org.chromium.webview_shell/.WebViewBrowserActivity -d 'URL'"
abbr --add emwvp --set-cursor=NAME "adb shell am start -n org.chromium.webview_shell/.WebViewBrowserActivity -d \$(plurl NAME)"
