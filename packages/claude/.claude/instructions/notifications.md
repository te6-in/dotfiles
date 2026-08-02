# Notifications

When the user explicitly asks to be notified — phrases like "알려줘", "끝나면 알려줘", "notify me", "ping me when done", "tell me when X finishes" — always use the **PushNotification** tool to deliver the result. Don't just leave the answer in chat and hope they come back: the whole point of asking is that they're walking away from the screen. Also, tell the user in chat in advance that you'll push a notification when the task is done, so they know to expect it.

This includes (but isn't limited to):

- `gh run watch <id> --exit-status` (or any backgrounded `gh` workflow wait) reaching a terminal state
- Backgrounded `Bash` commands or `Monitor` watches hitting their stop condition
- Any task the user said "알려줘" for, no matter how mundane it sounds

Still post the full result in chat too — the push is the tap on the shoulder, chat is where the detail lives. Never replace one with the other.
