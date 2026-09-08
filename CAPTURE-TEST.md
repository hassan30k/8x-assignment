# CAPTURE-TEST.md

## Tool and model

- **Tool:** opencode (terminal/desktop agent) â€” plugin system, no native prompt/response hooks like Claude Code
- **Model:** `opencode/big-pickle` (display name `big-pickle`), which plans and executes in a single agent
- **Lifecycle mechanism:** opencode **plugins** (`.opencode/plugins/*.js`), which are loaded automatically by every opencode server at startup. A plugin subscribes to the server **event bus** (`session.idle`, `message.updated`, `session.created`) and writes the relevant entries with no manual action per turn. It fires on its own; nothing has to be re-invoked by the user.

## Mechanism and config changed

- **Config file:** `.opencode/plugins/capture.js` (project plugin directory). Project-level plugin directories are auto-scanned and loaded by opencode at server/session startup. No entry in `opencode.json` is required for local plugins.
- **What it does:**
  - Filters to the **primary session** (subagent sessions, identified by `parentID`, are excluded so tool-call subagent chatter is not recorded).
  - On turn completion (`session.idle`) and on assistant message completion (`message.updated`), pulls the session transcript through the opencode SDK (`client.session.messages`).
  - Logs a `PROMPT` entry per user message and a **single `RESPONSE` per prompt â€” the last text message of that turn only**. Mid-turn thought messages and tool-only assistant messages are never logged. Responses pair to their prompt via a persisted pending-queue, so late-arriving parts still attach to the correct exchange even across restarts.
  - Only **text parts** are used (reasoning/thinking and tool-call parts are discarded).
  - Each entry carries a UTC timestamp (from the message's own `time.created` / `time.completed`), the model (`info.modelID`), and the session id, one file per session, matching the required log format.
  - Dedup/state (`agent-capture-state.json`) lives in `~/.cache/opencode/`, **outside the repo**, so restarts never duplicate or re-sweep already-logged turns.
- **Log path:** `.agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md` in the repo root. Committed with the repo.

## Canary entries

### Canary 1 â€” first session

File: `.agent-logs/2026-09-08-11-33-01_ses_f7f352482ffeMq2E.md`

```
---
session_id: ses_f7f352482ffeMq2ES1AQ4dYFz4
date: 2026-09-08
author: hassan30k
model: big-pickle
tool: opencode
project: 8x-assignment
total_exchanges: 1
first_prompt_time: 2026-09-08T11:33:01.319Z
last_prompt_time: 2026-09-08T11:33:01.319Z
---

# Session Log - 2026-09-08

Session: `ses_f7f352482ffeMq2ES1AQ4dYFz4` | Project: `8x-assignment` | Author: `hassan30k`

---

[LOG_ENTRY type=PROMPT num=1 session=ses_f7f352482ffeMq2ES1AQ4dYFz4]
timestamp: 2026-09-08T11:33:01.319Z
model: big-pickle

"CAPTURE TEST - 8x assignment, Bakht Tahmasbi"


[LOG_ENTRY type=RESPONSE num=1 session=ses_f7f352482ffeMq2ES1AQ4dYFz4]
timestamp: 2026-09-08T11:33:01.344Z
model: big-pickle

Test received. How can I help you with your project?
```

### Canary 2 â€” second session (proves it is installed outside the session that created it)

File: `.agent-logs/2026-09-08-11-33-35_ses_f7f349931ffeidkS.md`

```
---
session_id: ses_f7f349931ffeidkSAuJIIZfvZL
date: 2026-09-08
author: hassan30k
model: big-pickle
tool: opencode
project: 8x-assignment
total_exchanges: 1
first_prompt_time: 2026-09-08T11:33:35.441Z
last_prompt_time: 2026-09-08T11:33:35.441Z
---

# Session Log - 2026-09-08

Session: `ses_f7f349931ffeidkSAuJIIZfvZL` | Project: `8x-assignment` | Author: `hassan30k`

---

[LOG_ENTRY type=PROMPT num=1 session=ses_f7f349931ffeidkSAuJIIZfvZL]
timestamp: 2026-09-08T11:33:35.441Z
model: big-pickle

"CAPTURE TEST - second session, Bakht Tahmasbi"


[LOG_ENTRY type=RESPONSE num=1 session=ses_f7f349931ffeidkSAuJIIZfvZL]
timestamp: 2026-09-08T11:33:35.442Z
model: big-pickle

Test message received and captured successfully. Session is active and operational.
```

Both canaries were run as **separate, fresh** headless sessions (`opencode run`), each spawning its own server instance that loaded `.opencode/plugins/capture.js` from scratch. Both prompt and response landed in both.

## What I tried first that did not work

1. **Capture v1 (`.opencode/plugins/capture.js`, first version)** â€” listened only to `message.updated` and read the message from `event.info`. Wrong shape: in this opencode version the payload is `event.properties.info`, so the handler never saw the message. Produced zero entries. Fixed after dumping the real event shapes.
2. **Reliance on the running session picking up the plugin mid-session** â€” opencode loads plugins at server startup; this setup conversation started before the plugin existed, so the current session is not captured. Canaries required fresh sessions (done above). The plugin IS project-level, so every future session in this repo loads it automatically.
3. **`tui.prompt.append` as a prompt source** â€” would only cover interactive TUI prompts and carries no reliable transcript access; dropped in favour of SDK transcript pulls at `session.idle`, which covers TUI, desktop, and `opencode run` sessions uniformly.
4. **Accumulating text from streaming `message.part.updated` events** â€” parts are keyed independently of messages; associating them reliably is fragile. Replaced with fetching the persisted transcript parts via `client.session.messages` at turn completion (authoritative, only text parts extracted).
5. **Logging every completed assistant text message as the response** â€” mid-turn utterances ("Let me checkâ€¦", "Now I'll runâ€¦") that precede tool calls are separate assistant messages; they are not the final response. Now only the **last** text message of each turn is recorded (verified with a tool-use prompt: exactly one PROMPT + one RESPONSE).
6. **Sweeping on `message.updated` immediately at completion** â€” a sweep can catch an assistant message with `completed` set but its text parts not yet persisted, then permanently skip it. Assistant messages are never marked processed until their text is actually extracted, and a later sweep reassigns them. A tool-use canary that previously lost its RESPONSE now captures both entries.