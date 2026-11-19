# HDFC AMB Outreach Chat: Project Context

> **How to use this file.** It describes the whole system, so it is identical in both repositories. Read it
> top to bottom once, then use sections 12-13 to find the code. If you are an LLM: treat this as the system
> overview, read the actual source before proposing changes, and show a diff for approval rather than editing
> unasked.
>
> Derived from reading the code, not from running it. Items marked **[verify]** are unconfirmed.

---

## 1. What the system does

An outreach campaign for HDFC Bank savings-account customers whose **Average Monthly Balance (AMB)** is below the
required level (campaign `AMB_SHORTFALL_Q2`).

1. An internal caller asks the API for a personal chat link for a customer (account no., batch, date, phone).
2. The link is delivered to the customer (by WhatsApp/SMS, outside this system).
3. The customer opens it in a phone browser, retypes their phone number to confirm it is them, and chats with a
   scripted bot: *fund now / funds shortly / cash-flow trouble / unaware / want to leave*.
4. The bot records the outcome (a reminder is "set", a callback is requested, etc.) and every step is logged for
   campaign analytics.

The system has **two deployable parts**:

| Part | Repo | Stack | Role |
|---|---|---|---|
| **Web app** (`chat-ui`) | https://github.com/Anuj-Gaonkar/chat-ui | Next.js 16, React 19, Tailwind 4, `jose` | What the customer sees. A thin client with no business logic: it renders what the API returns. |
| **API service** (`whatsapp-flow-engine-service-v3`) | https://github.com/Anuj-Gaonkar/whatsapp-flow-engine-service-v3 | Spring Boot 4.1, Java 21, Postgres, Spring Security (JWT), Resilience4j, springdoc | All logic and data: links, sessions, verification, the conversation engine, event logging. |

You need both running to see the product end to end. Everything below describes the system as a whole; section 12
says which part each piece of code lives in.

---

## 2. Architecture

```
 Internal caller (campaign/ops system)        Customer's phone browser
        |                                              |
        | POST /api/link/t | /api/link/p               | https://<host>/dp/webchat/?t=<token>
        | (internal network only)                      v
        |                                    +----------------------+
        |                                    |  Web app (Next.js)   |
        |                                    |  basePath /dp/webchat|
        |                                    |  dev port 3001       |
        |                                    +----------+-----------+
        |                                               | same-origin /dp/waoutreach/api/*
        |                                               | (Next.js rewrite = proxy, so no CORS)
        v                                               v
 +--------------------------------------------------------------+
 |  API service (Spring Boot, port 8082, base /dp/waoutreach)   |
 +------------------------------+-------------------------------+
                                |
                         PostgreSQL (schema "cern")
```

- The browser only ever talks to the web app's origin. `next.config.ts` rewrites an **allowlist** of
  `/dp/waoutreach/api/...` paths to the API (`NEXT_PUBLIC_API_BASE_URL`). Anything not listed, including
  `/api/link/*`, is unreachable from the public site on purpose.
- A public gateway only routes `/dev/*` and strips it. The web app therefore prefixes fetches with `/dev` and sets
  `assetPrefix: /dev/dp/webchat`.
- Selected endpoints use **end-to-end JWE payload encryption** (section 7).

---

## 3. End-to-end flow

### 3.0 Link creation (internal)
`POST /dp/waoutreach/api/link/t` (token link) or `/api/link/p` (phone link). Parameters, all required:

| Param | Rule |
|---|---|
| `cod_acct_no` | max 20 chars |
| `batch_id` | max 50 chars |
| `business_dt` | `yyyy-MM-dd` |
| `phone_number` | exactly 10 digits after stripping non-digits |

All validation errors are returned together in the `ApiResponse` shape. On success a **`LINK_SENT`** event (with account,
batch, date) is written, and that write is *required*: if it fails the call fails, because the link would be refused
later anyway.

- **Token link** (`/api/link/t`): random token, only its hash is stored in `chat_link_token`; URL is
  `<chat.ui-base-url>/?t=<token>` and contains no phone number. Each call is its own outreach.
- **Phone link** (`/api/link/p`): nothing stored in `chat_link_token`; URL is `/?p=<phone>[&e=<entryCode>]`.
- With `chat.require-link-sent=true` (default) a link only opens if a matching `LINK_SENT` event exists. This stops
  guessed numbers/tokens from opening anything.
- **These endpoints have no authentication.** Keep them off the internet.

### 3.1 Customer opens the link: `POST /api/chat-session/start`
Body `{ token? | phoneNumber?, entryCode? }` (token wins). Logic in `ChatDeviceSessionService.start`:
1. Link must have been sent (see above) else `403 INVALID_LINK`.
2. Resolve phone and entry code (from the token row, or from the URL / default `AMB_SHORTFALL_Q2`).
3. Take a DB lock for that number/token so two browsers can't both be "first".
4. If the first-ever session for this link started more than 48h ago (`chat.link-window`): `403 LINK_EXPIRED`.
   An unopened token expires 48h after minting.
5. If this browser already holds a live session for the link, reuse it.
6. Else if a different browser holds it (compared via `client_hash`, a hash of User-Agent + Accept-Language):
   `403 LINK_ALREADY_OPENED`. A browser that merely lost its cookie but matches `client_hash` takes the link back
   (the window is **not** extended) and must verify again.
7. Else insert a pending `chat_device_session` and set the **`chat_sid`** cookie (HttpOnly, SameSite=Lax, Secure per
   config). Only the cookie's SHA-256 is stored.
8. Events: `LINK_OPENED_FIRST` or `LINK_OPENED_AGAIN`; `SESSION_CREATED` if a session was created; on refusal
   `LINK_REJECTED` with the error code in `detail`.

Response `{ verified, customerId:null, entryCode, completed, token:null }`. `completed=true` means the customer already
finished, so the web app shows "Feedback submitted" without asking for the number. A pending session lasts
`chat.pending-ttl` (15m) and never outlives the link window.

### 3.2 Customer retypes the number: `POST /api/chat-session/verify`
Body `{ phoneNumber }`, must match `\d{10}` (rejected as a 400 *before* the service, so typos don't count toward
lockout).
- Wrong: `chat_verify_lockout.failed_attempts++`; after `chat.max-verify-attempts` (5) the number is locked for
  `chat.lock-duration` (15m). Errors `403 PHONE_MISMATCH` / `TOO_MANY_ATTEMPTS`; events `VERIFY_FAILED` / `VERIFY_LOCKED`.
- Right: `verified_at` set, lockout cleared, a **chat JWT** returned in the body (not stored server-side), event `VERIFIED`.
  The web app keeps it in `sessionStorage` (`chat_token`).

### 3.3 Chat starts: `POST /api/conversations`
Needs `Authorization: Bearer <jwt>` **and** the `chat_sid` cookie. Body `{ entryCode, customerId, context:{}, restart }`.
`ChatConversationService.start` finds the customer's latest session **for this link** (by token hash for `?t=`, or by
number + entry with no token for `?p=`):
- `COMPLETED` then `409 CHAT_COMPLETED`
- `OPENED`/`IN_PROGRESS` then resume (HTTP 200) with a full **transcript** rebuilt from `chat_session_event` + `chat_node_content`
- none or `EXPIRED` then create `flow_session` (`flow_token = "CHAT-" + UUID`, `IN_PROGRESS`) + `chat_session_ext` (HTTP 201)

`restart=true` is honoured only when `chat.allow-restart` is on (local testing).

### 3.4 Each reply: `POST /api/conversations/{sessionId}/messages`
Body `{ rawInput }` (an option number, or free text on an `INPUT` node).
- Not a valid option then `INVALID_INPUT` is logged and the same question repeats.
- Valid then log `chat_session_event` (`OPTION`) and campaign event `OPTION_CLICKED`; apply the node's chat rule (below);
  follow the `flow_transition`; apply the destination node's simulated action; write `flow_node_history`; keep going
  through `MESSAGE` nodes until a `QUESTION`, `INPUT` or `END`.
- On `END`: `flow_session.status = COMPLETED`, `completed_at` set, and `chat_session_ext.conclusion_code` +
  `entry_reason_code` are frozen.
- Every authenticated response carries a **renewed JWT** in the `X-Chat-Token` header, so token life runs from the
  customer's last click. JWT TTL defaults to **1 minute**.

| Node | Chat rule |
|---|---|
| `AMB_MENU` | store `entry_reason_code` in context (from `chat_transition_meta`) |
| `FUNDS_TIMING` | option 1/2/3 sets `reminder_date` = today (UTC) + 3 / 7 / 15 days |
| `CASH_FLOW_MENU` | store `assistance_type` = chosen label |
| `CHURN_REASON_MENU` | store `reason` for options 1-4; option 5 "Other" leads to a free-text `INPUT` node |

### 3.5 Browser-only event: `POST /api/chat-events`
Only `{ type: "PAY_OPENED" }` is accepted (the Fund-now button opened the UPI pay sheet). The customer is taken from the
verified session, never from the body. The web app fires it and ignores failures (`logPayOpened()`). The request schema
also allows an optional `app` label, but the web app does not send it. `UPI_APP_CLICKED` exists in the event enum but
**nothing writes it yet**.

### 3.6 Coming back later
- JWT expired (`401 TOKEN_EXPIRED`): the web app asks for the number again, re-verifies, resumes the chat.
- 48h after the first claim the link is dead for everyone (`LINK_EXPIRED`).

### 3.7 Web app pages
- `/` main chat. `access` state machine: checking, then needs-number / verified / completed / expired / error. Reads `?t=`, `?p=`, `?e=`.
- `/journey` looks up a phone number and replays its whole conversation.
- `/pay` UPI hand-off (GPay `gpay://upi/pay?`, PhonePe, BHIM, CRED, or an Android `intent://pay` chooser). The same panel
  opens as a sheet inside the chat. Query params: `pa`, `pn`, `am`, `tn`, `tr`.
- `/api/health` health check.

---

## 4. Database

PostgreSQL, schema **`cern`** (`jdbc:postgresql://localhost:5437/cern_v2?currentSchema=cern` by default).
`spring.jpa.hibernate.ddl-auto` is **`validate`**: the app never creates or alters schema, so changes must go through SQL
scripts. Older docs mention `flow_engine`/`chatbot_v3`; those names are stale.

**Setup scripts** (API repo, `db/new_schema/`, run in order): `01_create_tables.sql`, `02_seed_flow_data.sql`,
`03_seed_test_data.sql` (non-production `chat_campaign_master` rows), `04_grants.sql` (replace `<ROLE_NAME>`).
`db/db.sql` drops only this service's tables. The numbered `db/01`-`db/10` and `96`-`99` files are earlier history.

### A. Flow definition (reference data; the app only reads)
| Table | Columns | Notes |
|---|---|---|
| `flow_node` | `node_id` PK, `flow_code`, `screen_id` UNIQUE, `node_type` (SCREEN/TERMINAL), `back_target_node_id`, `action_code` | One row per step. `action_code`: `SCHEDULE_FUNDS_REMINDER`, `ROUTE_TO_EXECUTIVE`, `CONVERT_SALARY_ACCOUNT`, `LOG_CALLBACK_REQUEST`, `GENERATE_FUND_LINK`. |
| `flow_transition` | `transition_id` PK, `from_node_id`, `to_node_id`, `option_value`, `option_label`, `display_order` | An arrow. On a QUESTION node, `display_order` is the number the customer types. |
| `chat_entry_point` | `entry_code` PK, `flow_code` | `AMB_SHORTFALL_Q2` maps to `AMB_REMINDER`; `AMB_SHORTFALL_Q2_V2` maps to `AMB_REMINDER_V2`. |
| `chat_node_content` | `node_id` PK/FK, `chat_node_type` (MESSAGE/QUESTION/INPUT/END), `node_code`, `title`, `message`, `answer_field`, `conclusion_code`, `button_label`, `button_url` | What the bot says. `conclusion_code` is set on END nodes. `button_url` is an https URL or `/pay`. |
| `chat_transition_meta` | `transition_id` PK/FK, `entry_reason_code`, `option_label_override` | Business reason of the top-level menu choice; label overrides. |

### B. Conversation (written on every start and click)
| Table | Columns | Notes |
|---|---|---|
| `flow_session` | `flow_token` PK, `wa_id` (phone, varchar 32), `current_node_id`, `status` (OPENED/IN_PROGRESS/COMPLETED/EXPIRED), `context` jsonb, `started_at`, `last_interaction_at`, `completed_at` | One row per chat. API clients see `ACTIVE` for OPENED/IN_PROGRESS. |
| `chat_session_ext` | `flow_token` PK/FK, `customer_id`, `entry_code`, `link_token_hash`, `conclusion_code`, `entry_reason_code` | Ties a chat to a number and link; stores the final outcome. |
| `chat_session_event` | `id` PK, `flow_token` FK, `node_id`, `event_code` (OPTION/AUTO/INVALID_INPUT), `raw_input`, `created_at` | Per-chat journey log; also the source of transcripts. |
| `flow_node_history` | `id` PK, `flow_token`, `customer_id`, `node_id`, `screen_id`, `action_type` (INIT/DATA_EXCHANGE/COMPLETED...), `selected_value`, `request_data`, `response_data` jsonb, `occurred_at` | Audit trail. |

### C. Browser binding and link control
| Table | Columns | Notes |
|---|---|---|
| `chat_device_session` | `session_hash` PK (SHA-256 of `chat_sid`), `phone_number`, `claimed_at`, `expires_at`, `verified_at`, `client_hash`, `entry_code`, `link_token_hash`, `claim_ip`, `claim_user_agent` | One row per browser that opened a link. The first row's `claimed_at` starts the 48h window. |
| `chat_link_token` | `token_hash` PK, `phone_number`, `entry_code`, `created_at` | One row per `?t=` link. Raw token never stored. |
| `chat_verify_lockout` | `phone_number` PK, `failed_attempts`, `locked_until`, `updated_at` | Wrong-number counter. |

### D. Campaign analytics
| Table | Notes |
|---|---|
| `chat_campaign_event` | Append-only, **partitioned monthly by `business_dt`** plus a `DEFAULT` partition. PK `(id, business_dt)`. Columns: `business_dt`, `cod_acc_no`, `campaign_matched`, `event_type`, `entry_code`, `phone_number`, `link_token_hash`, `session_hash`, `flow_token`, `node_id`, `option_input`, `option_label`, `detail`, `created_at`, `link_url`, `batch_id`. Partitions shipped: 2026-08 to 2027-03. **Create future months by hand before they start**; a month can't be added while `DEFAULT` holds rows for it. |
| `chat_campaign_master` | PK `(cod_acc_no, business_dt)`; `phone_number`, `campaign_code`. A **dummy stand-in** for a table a Databricks job should fill. |

**Event types:** `LINK_SENT`, `LINK_OPENED_FIRST`, `LINK_OPENED_AGAIN`, `LINK_REJECTED`, `SESSION_CREATED`, `VERIFIED`,
`VERIFY_FAILED`, `VERIFY_LOCKED`, `OPTION_CLICKED`, `PAY_OPENED`, `UPI_APP_CLICKED` (unused).

**Account/date resolution** (`ChatCampaignResolver`): `LINK_SENT` carries `cod_acc_no`, `batch_id` and `business_dt` from the
caller. Other events take the newest `chat_campaign_master` row for the phone + campaign dated on or before the event day;
with none, they are logged with `cod_acc_no` NULL, `campaign_matched=false`, `business_dt` = that day (Asia/Kolkata).

**Logging policy:** each event is written in its own transaction; failures are logged but never break a request, **except
`LINK_SENT`**, which is mandatory. Most events are written after the main transaction commits.

---

## 5. The conversation script (`AMB_SHORTFALL_Q2`, flow `AMB_REMINDER`, nodes 1000-1210)

```
1000 INTRO
 -> 1010 AMB_MENU  "What would you like to do?"
   1 Fund now               -> 1020 END FUND_LINK_SENT                                   [reason FUND_NOW]
   2 Expect funds shortly   -> 1030 ack -> 1040 FUNDS_TIMING (3/7/15 days) -> 1050 END REMINDER_SET   [FUNDS_SHORTLY]
   3 Cash-flow constraints  -> 1060 ack -> 1070 CASH_FLOW_MENU                           [CASH_FLOW_CONSTRAINTS]
        remind me later     -> 1040 -> 1050 END REMINDER_SET
        speak to executive  -> 1080 END ESCALATED_TO_EXECUTIVE
        understand charges  -> 1090 END INFO_REDIRECT
   4 Unaware of requirement -> 1100 ack -> 1110 INFO_MENU -> 1120 END INFO_REDIRECT | 1130 END UPGRADE_INTEREST   [UNAWARE_OF_REQUIREMENT]
   5 No longer use account  -> 1140 ack -> 1150 CHURN_REASON_MENU                        [CHURN_RISK]
        salary moved        -> 1190 END SALARY_ACCOUNT_OFFERED
        better offer        -> 1200 END RETENTION_APPEAL
        account not needed  -> 1210 END VISIT_BRANCH
        service concern     -> 1170 callback confirm -> 1180 END CALLBACK_REQUESTED
        other (free text)   -> 1160 INPUT -> 1170 -> 1180 END CALLBACK_REQUESTED
```
`AMB_SHORTFALL_Q2_V2` (flow `AMB_REMINDER_V2`, nodes 3000-3210) has the same shape, shorter copy, a **button** on the
fund-now end (`Fund Your Account` -> `/pay`), "Learn More" links on info ends, and the unaware branch going straight to
an info END (3105).

- **`conclusion_code`:** `FUND_LINK_SENT`, `REMINDER_SET`, `ESCALATED_TO_EXECUTIVE`, `INFO_REDIRECT`, `UPGRADE_INTEREST`,
  `CALLBACK_REQUESTED`, `SALARY_ACCOUNT_OFFERED`, `RETENTION_APPEAL`, `VISIT_BRANCH`.
- **`entry_reason_code`:** `FUND_NOW`, `FUNDS_SHORTLY`, `CASH_FLOW_CONSTRAINTS`, `UNAWARE_OF_REQUIREMENT`, `CHURN_RISK`.
- Message text supports `{placeholders}` from session context (`ChatTemplateRenderer`) and `**bold**` (web `RichText`).
- To add a flow: add rows to `flow_node`, `flow_transition`, `chat_entry_point`, `chat_node_content`
  (+ `chat_transition_meta`), register it in `flows.definitions`, and use unused `node_id` ranges (next free: 4000+).
  No Java change is needed.

---

## 6. API reference (base `/dp/waoutreach`)

| Endpoint | Auth | Purpose | Errors |
|---|---|---|---|
| `POST /api/link/t`, `/api/link/p` | none, **internal only** | Create link, log `LINK_SENT` | 400 validation list, 500 |
| `POST /api/chat-session/start` | cookie (optional) | Open link, pending session | 403 `INVALID_LINK` / `LINK_EXPIRED` / `LINK_ALREADY_OPENED` |
| `POST /api/chat-session/verify` | cookie | Retype number, receive JWT | 403 `PHONE_MISMATCH` / `TOO_MANY_ATTEMPTS` / `SESSION_EXPIRED` |
| `GET /api/chat-session` | cookie | Session status | 403 `SESSION_REQUIRED` / `SESSION_EXPIRED` |
| `POST /api/conversations` | JWT + cookie | Start or resume chat | 409 `CHAT_COMPLETED`, 404 `NOT_FOUND` |
| `POST /api/conversations/{id}/messages` | JWT + cookie | Reply | 409 `CONFLICT` if not awaiting input |
| `GET /api/conversations/{id}` | JWT + cookie | Snapshot without advancing | |
| `POST /api/chat-events` | JWT + cookie | Report `PAY_OPENED` | |

Swagger UI at `/swagger-ui.html`, health at `/actuator/health`.

**Two error shapes:** chat endpoints return `{ "error": "<CODE>", "message": "..." }`; `/api/link/*` returns the newer
`ApiResponse` wrapper with a per-field `errors` list. The web app's `ApiError` only understands the first (fine: it
never calls `/api/link`).

Other errors: `401 TOKEN_REQUIRED` / `TOKEN_EXPIRED` / `TOKEN_INVALID` mean "ask for the number again";
`400 ENCRYPTION_REQUIRED` / `ENCRYPTION_INVALID` / `ENCRYPTION_KEY_UNKNOWN` for encryption failures;
`400 VALIDATION_FAILED` for bad bodies. Resilience4j limiter `waoutreach` (default 100 req/s, no queueing) guards the
session, conversation and event controllers.

---

## 7. Security model (read before changing anything)

1. **Link gate:** a `LINK_SENT` event must exist (`chat.require-link-sent`).
2. **Browser binding:** the first browser to open a link owns it for 48h. The `chat_sid` cookie is HttpOnly and only its hash
   is stored. The session is also tied to a User-Agent/Accept-Language hash, so a cookie copied to another browser is refused.
3. **Phone verification:** retype the number; 5 failures then 15 min lock, counted per number.
4. **JWT:** HMAC-signed with `chat.jwt-secret`, 1 min sliding TTL, tied to the session hash and phone.
   `ChatTokenBindingFilter` re-checks the cookie against the token on every call and renews the token.
5. **Payload encryption (JWE)** on the endpoints listed in `chat.encryption.paths`: the request is a compact JWE
   (RSA-OAEP-256 key wrap, A256GCM) containing `{ts, nonce, body, responseKey}`. The API decrypts it, enforces clock skew
   (`max-clock-skew`, 2m) and nonce replay protection, and encrypts the response with the per-request `responseKey`
   (alg `dir`, A256GCM). Body-less GETs put the JWE in an `X-Enc` header. Content type `application/jose`, max body 64 KB.
   - The endpoint list **must match** in the web app (`NEXT_PUBLIC_ENCRYPTED_PATHS`, defaults in `lib/crypto.ts`) and the API
     (`chat.encryption.paths`). The `kid` must match `chat.encryption.key-id`.
   - Web app key: `NEXT_PUBLIC_ENCRYPTION_PUBLIC_KEY` (base64 DER SPKI, or a file path that `next.config.ts` reads).
6. Spring Security protects only the chat API matchers; everything else is `permitAll`.
7. This is a **convenience gate for a non-sensitive site**, not strong auth: with `?p=` links the number is in the URL, so
   anyone holding the link can pass verification. Token links (`?t=`) keep the number out of the URL.
8. The web app sends `Referrer-Policy: no-referrer` so the link is not leaked to third-party resources.

---

## 8. Configuration

**API** (`src/main/resources/application.yaml`, mostly env-var backed):

| Key | Default / meaning |
|---|---|
| `server.port` | 8082 |
| `app.namespace.path` | `/dp/waoutreach` |
| `chat.ui-base-url` (`CHAT_UI_BASE_URL`) | origin used when building links; the default is a throwaway tunnel URL, so set a real one |
| `chat.default-entry-code` | `AMB_SHORTFALL_Q2` |
| `chat.pending-ttl`, `chat.link-window` | 15m, 48h |
| `chat.jwt-secret`, `chat.jwt-ttl` | at least 32 chars, 1m |
| `chat.max-verify-attempts`, `chat.lock-duration` | 5, 15m |
| `chat.cookie-secure` | true (false only for plain-http local dev) |
| `chat.allow-restart`, `chat.require-link-sent` | false, true |
| `chat.encryption.*` | `enabled`, `private-key`, `key-id` (`k1`), `max-clock-skew`, `paths[]` |
| `whatsapp.*`, `flows.*`, `temporal-workflow-service.base-url`, `reminder.funds.mode` | legacy WhatsApp Flow side (section 10); several have no defaults, so the app won't start without them |
| `resilience4j.ratelimiter.instances.waoutreach.*` | rate limit |

**Web app** (`.env.local`): `NEXT_PUBLIC_API_BASE_URL` (API, default `http://localhost:8082`),
`NEXT_PUBLIC_ENCRYPTION_ENABLED`, `NEXT_PUBLIC_ENCRYPTION_KEY_ID`, `NEXT_PUBLIC_ENCRYPTION_PUBLIC_KEY`, optional
`NEXT_PUBLIC_ENCRYPTED_PATHS`. `next.config.ts`: `basePath /dp/webchat`, `assetPrefix /dev/dp/webchat`,
`output: standalone`, proxy allowlist.

**Run locally:** start Postgres and apply `db/new_schema/*`, then in the API repo `./mvnw spring-boot:run` (Java 21);
in the web repo `npm install && npm run dev` (port 3001). Generate a link with `/api/link/t`, open it at
`http://localhost:3001/dp/webchat/?t=<token>`. For local plain-http testing set `chat.cookie-secure=false`, and either
turn encryption off on **both** sides or give both the same key pair.

**Secrets:** never commit `.env.local`, RSA keys (`keys/` is git-ignored), `chat.jwt-secret`, WhatsApp tokens or DB passwords.

---

## 9. Behaviours and gotchas

- **Reminders in the web chat are simulated.** Reaching `END_FUNDS_REMINDER` only writes `reminder_id = "RMD-<token>"`
  and `reminder_date` into `flow_session.context` and sets `conclusion_code = REMINDER_SET`. Nothing is scheduled or sent.
  Likewise for executive handoff, salary conversion and callback: `applyAction` just records an id.
- **Payment completion is invisible.** `PAY_OPENED` means only that the UPI sheet opened; the UPI hand-off leaves the system.
- **Chat text is read live** from `chat_node_content`, so editing wording later changes how old journeys read. Analyse by
  `node_code` / `conclusion_code`, never by text.
- **A token is one send:** its own window, browser and chat. A customer sent a new link starts a new chat; a finished chat
  never reopens within the same link.
- `flow_session.wa_id` is `varchar(32)`; a longer `customerId` is rejected.
- `ChatPartitionMaintainer` was removed; partitions are managed by SQL only.
- Some files in the API repo (`README.md`, `SETUP_GUIDE.md`, `REMINDER_SERVICES_GUIDE.md`, `TEMPORAL_GUIDE.md`,
  `AMB_REMINDER_*`, `docs/CHAT_TABLE_FLOW.md`) pre-date the current layout and may use old DB names. The web app's README
  still calls it a "test harness". Prefer this file and the code where they disagree. `.claude/worktrees/` holds old copies; ignore them.

---

## 10. Legacy WhatsApp Flow engine (same API service)

The API service started as an engine for **WhatsApp Flows** (Meta's in-app forms) and still contains it, sharing the
`flow_node` / `flow_transition` / `flow_session` / `flow_node_history` tables with the web chat.
- Endpoints: `/webhook` (HMAC-signed Cloud API webhook), `/webhook/flow[/{flowKey}]` (Meta's RSA/AES-encrypted data
  endpoint), `/screen[/{flowKey}]` (plain-JSON twin for testing), `/trigger` (send a Flow to a number), history/graph
  endpoints, `/messages/reminder`.
- It calls an external `temporal-workflow-service` to schedule real funds reminders. **The web chat does not.**
- Flows registered: `AMB_REMINDER`, `AMB_REMINDER_RADIO`, `AMB_REMINDER_V2`. Docs: `SETUP_GUIDE.md`,
  `REMINDER_SERVICES_GUIDE.md`, `TEMPORAL_GUIDE.md`, `AMB_REMINDER_*_JOURNEY.md`.
- The web chat and this engine share the flow graph tables but are otherwise independent.

---

## 11. Useful SQL

Customer journey:
```sql
SELECT e.created_at, c.node_code, e.event_code, e.raw_input AS customer_input,
       COALESCE(m.option_label_override, t.option_label) AS chosen_option, nc.node_code AS next_node
FROM cern.chat_session_ext x
JOIN cern.chat_session_event e ON e.flow_token = x.flow_token
JOIN cern.chat_node_content c ON c.node_id = e.node_id
LEFT JOIN cern.flow_transition t ON t.from_node_id = e.node_id
     AND ((e.event_code = 'OPTION' AND t.display_order::text = trim(e.raw_input)) OR e.event_code = 'AUTO')
LEFT JOIN cern.chat_transition_meta m ON m.transition_id = t.transition_id
LEFT JOIN cern.chat_node_content nc ON nc.node_id = t.to_node_id
WHERE x.customer_id = '<10-digit phone>'
ORDER BY e.created_at, e.id;
```

Distinct customers per event type over a date range:
```sql
SELECT event_type, COUNT(DISTINCT phone_number) AS customers
FROM cern.chat_campaign_event
WHERE business_dt BETWEEN DATE '<from>' AND DATE '<to>'
GROUP BY event_type ORDER BY customers DESC;
```
`batch_id` and `link_url` are set only on `LINK_SENT` rows; to filter other events by batch, join to that row on
`link_token_hash` (token links) or `phone_number` (phone links). Untested; check against real data.

Outcome split:
```sql
SELECT conclusion_code, COUNT(*) FROM cern.chat_session_ext GROUP BY 1 ORDER BY 2 DESC;
```

---

## 12. Code map

**API repo** (`src/main/java/com/hdfc/flowengine/`)
- `chat/controller`: `ChatLinkApiController`, `ChatDeviceSessionApiController`, `ChatConversationApiController`,
  `ChatEventApiController`, `ChatFrameApiController`, exception handlers.
- `chat/service`: `ChatDeviceSessionService` (link/browser/verify), `ChatConversationService` (engine), `ChatLinkService`,
  `ChatJwtService`, `ChatCampaignEventLogger` / `Writer` / `Resolver`, `ChatTranscriptService`, `ChatGraphLookup`,
  `ChatTemplateRenderer`, `ChatTokenHash`, `ChatPhoneNumbers`, `ChatEntryResolver`.
- `chat/security`: `ChatSecurityConfig`, `ChatEncryptionFilter` / `Config`, `ChatTokenBindingFilter`, `ChatSecurityErrors`.
- `chat/entity`, `chat/repository`, `chat/model`: JPA entities, repositories, DTOs.
- `config`: `ChatProperties`, `ChatEncryptionProperties`, `FlowRegistryProperties`, ...
- Legacy Flow engine: `controller`, `service`, `crypto`, `entity`, `repository`, `security`.
- `db/new_schema/`: current SQL. `docs/`: this file and `CHAT_TABLE_FLOW.md`.

**Web repo**
- `app/page.tsx`: main chat state machine; `app/journey/page.tsx`; `app/pay/page.tsx`; `app/api/health/route.ts`.
- `lib/api.ts`: typed API client (token storage, error codes, `startChatSession`, `verifyChatPhone`, `startConversation`,
  `replyToConversation`, `logPayOpened`). `lib/crypto.ts`: JWE encrypt/decrypt and the endpoint list.
- `components/`: `MessageBubble`, `MessageList`, `OptionButtons`, `ChatInput`, `PhoneGate`, `UpiPay`, `RichText`, `JourneyStep`, ...
- `next.config.ts`: base paths, proxy allowlist, headers. `docs/API_ENDPOINTS.md`, `postman/` collection.
- Note: Next.js 16 has breaking changes versus older versions. Read `node_modules/next/dist/docs/` before writing Next code.

---

## 13. Planned: analytics dashboard (not built)

Goal: show how many customers opened the chat, reached the end, set reminders, etc.

Proposed metrics: funnel (sent, opened, verified, started, engaged, completed, outcome) with stage conversion; open rate and
time-to-open; rejections by reason; outcome split by `conclusion_code` and `entry_reason_code`; churn reasons; reminder-timing
distribution; Fund-now taps; verify success and lockouts; drop-off by node; invalid-input rate; time to complete.
Slice by `business_dt`, `batch_id`, `entry_code`, `campaign_matched`.

Known gaps:
1. "Reminder set" is only an outcome code; there is no delivery event (reminders are simulated).
2. `chat_campaign_master` is a dummy table until synced from Databricks.
3. Completion and outcome live in `chat_session_ext`, not `chat_campaign_event`. Join both, or add `CHAT_COMPLETED` / `OUTCOME` events.
4. UPI-app breakdown needs `UPI_APP_CLICKED` to be wired up first.

Suggested build: SQL views (`v_campaign_funnel`, `v_outcomes`, `v_dropoff`) as the single definition, read-only endpoints on an
internal path (never the public gateway), then either a web-app `/dashboard` page or a BI tool on a read replica.

---

## 14. Working agreements for an AI assistant
- Read the code before proposing changes. Keep the web chat (`chat/*`) and the legacy Flow engine distinct.
- Propose a diff and wait for approval before editing.
- No schema change without a SQL migration: `ddl-auto` is `validate`.
- Keep the encryption endpoint lists identical on both sides; keep `/api/link/*` off the public proxy allowlist.
- Never log or commit secrets, raw tokens, or phone numbers beyond the existing stored/hashed patterns.
