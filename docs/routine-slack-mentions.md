# Slack mentions in the briefing

Added 2026-10-19 to routine `trig_01E7UKfY4deYS2R5tQR7WKkp` (the stored prompt was diffed against the intended one).

**What the routine does:** new STEP 2b finds the last 3 messages from other people in the last 3 days that mention
Abhishek (an @-mention or a direct message), skips bots and his own messages, and prints them as cards under a new
"Slack mentions" heading, after Calendar. "At a glance" gets a Slack row.

**Connector:** the Slack connector (`https://mcp.slack.com/mcp`, id `52796ff0-f32d-4c4c-9bda-69d37c28cb09`) is attached to the
routine with a read-only allowlist: `slack_search_users`, `slack_search_public_and_private`, `slack_read_thread`,
`slack_read_channel`, `slack_read_user_profile`. The send, canvas, list and reaction tools are not permitted, and the
prompt also says never to change anything in Slack.

**PDF layout the reader parses** (one bordered card per mention, newest first, at most 3):

```
**<Sender> · <#channel or DM>
Text: <message, at most 160 characters>
Time: Mon, 19 Oct 2026 14:05 IST
Open: <permalink>
```

With no mentions the card says `No new mentions`; if Slack fails, `Slack not reachable`.

**In OFD:** the section is parsed into mention items (`server/normalize/parsers.ts`), and Today shows the newest three
as rows (avatar, sender, place, message, time ago). Tapping a row opens the message in Slack.

**Privacy:** message text (up to 160 characters) goes into the PDF in the Drive folder, and secrets are replaced by
`[message hides a secret]`. To stop it, remove STEP 2b and layout rule 4b from the prompt, or detach the Slack
connector at https://claude.ai/code/routines.

**Not yet confirmed:** no run has happened since the change. The first run shows whether the connector's allowlist
names are accepted (if not, the PDF says `Slack not reachable`).
