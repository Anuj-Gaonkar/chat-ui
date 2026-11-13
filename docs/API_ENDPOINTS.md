# Chat UI – Backend API Reference

Source of truth: `lib/api.ts` (client), `lib/crypto.ts` (encryption), `next.config.ts` (proxy).
Request/response shapes are taken from the client's TypeScript types; the backend is the final authority.

## Common

| Item | Value |
|---|---|
| Base URL | `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8082`). The browser calls same-origin paths; Next.js rewrites them to this URL. |
| Path prefix | `/dp/waoutreach/api` |
| Default content type | `Content-Type: application/json` |
| Session cookie | HttpOnly cookie set by `chat-session/start`; sent automatically by the browser (never set by JS). |
| JWT | Issued by `chat-session/verify` in body field `token`. Sent as `Authorization: Bearer <token>` on conversation calls. Every accepted token-protected call returns a renewed token in the `X-Chat-Token` response header. |
| Payload encryption | When `NEXT_PUBLIC_ENCRYPTION_ENABLED=true`, the endpoints marked **Encrypted** send the body as a JWE with `Content-Type: application/jose` (body-less GETs send the JWE in the `X-Enc` header). The response is also encrypted (`Content-Type: application/jose`) and is decrypted by the client. Plain JSON is used when encryption is off. |

### Error response (any non-2xx)

```json
{ "error": "NOT_FOUND | CONFLICT | VALIDATION_FAILED | <CODE>", "message": "human readable text" }
```

Token error codes (client clears its stored token and asks for the phone number again):
`TOKEN_REQUIRED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`.

### Summary

| # | Method | Path | Cookie | JWT | Encrypted |
|---|---|---|---|---|---|
| 1 | POST | `/chat-session/start` | sets | no | yes |
| 2 | POST | `/chat-session/verify` | yes | issues | yes |
| 3 | GET | `/chat-session` | yes | no | no |
| 4 | POST | `/chat-events` | – | yes | yes |
| 5 | POST | `/conversations` | – | yes | yes |
| 6 | POST | `/conversations/{sessionId}/messages` | – | yes | yes |
| 7 | GET | `/conversations/{sessionId}` | – | yes | yes |
| 8 | GET | `/customers/{customerId}/frame` | – | no | no |

"–" means the client does not rely on it; the backend may still check the cookie.
Encryption defaults come from `lib/crypto.ts` and can be overridden with `NEXT_PUBLIC_ENCRYPTED_PATHS`.

---

## 1. Start chat session

| | |
|---|---|
| **Request URL** | `{baseUrl}/dp/waoutreach/api/chat-session/start` |
| **Method** | `POST` |
| **Request params** | None (path/query) |
| **Headers** | `Content-Type: application/json` (or `application/jose` if encrypted) |
| **Response headers** | `Set-Cookie` (HttpOnly session cookie) |

**Request body** – either a token or a phone number (token wins if both are sent):

```json
{ "token": "<opaque link token>" }
```
```json
{ "phoneNumber": "9999999999", "entryCode": "AMB_SHORTFALL_Q2" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | one of | From the `?t=` link. |
| `phoneNumber` | string | one of | From the `?p=` link. |
| `entryCode` | string | no | From the `&e=` link; client default `AMB_SHORTFALL_Q2`. |

**Response 200**

```json
{ "verified": false, "entryCode": "AMB_SHORTFALL_Q2", "completed": false }
```

| Field | Type | Notes |
|---|---|---|
| `verified` | boolean | `false` while pending. |
| `entryCode` | string | The chat this link is for. |
| `completed` | boolean | `true` if the customer already finished this chat (no number needs to be asked). |
| `customerId` | string | Absent while pending. |

**Errors (403)**: `INVALID_LINK`, `LINK_ALREADY_OPENED`, `LINK_EXPIRED`.

---

## 2. Verify phone number

| | |
|---|---|
| **Request URL** | `{baseUrl}/dp/waoutreach/api/chat-session/verify` |
| **Method** | `POST` |
| **Request params** | None |
| **Headers** | `Content-Type: application/json` (or `application/jose`); session cookie (automatic) |

**Request body**

```json
{ "phoneNumber": "9999999999" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `phoneNumber` | string | yes | The number typed back by the customer. |

**Response 200**

```json
{ "verified": true, "customerId": "9999999999", "entryCode": "AMB_SHORTFALL_Q2", "token": "<JWT>" }
```

| Field | Type | Notes |
|---|---|---|
| `verified` | boolean | |
| `customerId` | string | Digits only, last 10; used as `customerId` afterwards. |
| `entryCode` | string | |
| `token` | string \| null | **JWT** for the conversation calls. |

**Errors (403)**: `PHONE_MISMATCH`, `TOO_MANY_ATTEMPTS`, `SESSION_EXPIRED`.

---

## 3. Get chat session

| | |
|---|---|
| **Request URL** | `{baseUrl}/dp/waoutreach/api/chat-session` |
| **Method** | `GET` |
| **Request params** | None |
| **Headers** | Session cookie (automatic). No body, not encrypted by default. |
| **Request body** | None |

**Response 200** – same shape as the `start` response (`verified`, `customerId?`, `entryCode?`, `completed?`).

**Errors (403)**: `SESSION_REQUIRED`, `SESSION_EXPIRED`.

---

## 4. Log chat event

| | |
|---|---|
| **Request URL** | `{baseUrl}/dp/waoutreach/api/chat-events` |
| **Method** | `POST` |
| **Request params** | None |
| **Headers** | `Content-Type: application/json` (or `application/jose`); `Authorization: Bearer <JWT>` |

**Request body**

```json
{ "type": "PAY_OPENED" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | `PAY_OPENED` is the value this client sends (Fund now pressed / pay sheet opened). The code also reports UPI app taps ("Report the pay sheet opening and UPI app taps" in git history); those event types are not visible in `lib/api.ts`, so check the backend for the full list. |

**Response**: the client ignores the body (fire-and-forget; failures are swallowed). Renewed JWT in `X-Chat-Token`.

---

## 5. Start conversation

| | |
|---|---|
| **Request URL** | `{baseUrl}/dp/waoutreach/api/conversations` |
| **Method** | `POST` |
| **Request params** | None |
| **Headers** | `Content-Type: application/json` (or `application/jose`); `Authorization: Bearer <JWT>` |

**Request body**

```json
{ "entryCode": "AMB_SHORTFALL_Q2", "customerId": "9999999999", "context": {}, "restart": false }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `entryCode` | string | yes | Chat to open; default `AMB_SHORTFALL_Q2`. |
| `customerId` | string | yes | From `verify`. |
| `context` | object | no | Sent as `{}`. |
| `restart` | boolean | no | Fresh conversation; only honoured on a backend that allows it (local testing). |

**Response 200 – `ConversationResponse`**

```json
{
  "sessionId": "…",
  "status": "ACTIVE",
  "message": "bot text",
  "currentNodeId": 12,
  "options": [{ "eventCode": "OPTION", "optionIndex": 1, "optionLabel": "…" }],
  "button": { "label": "Fund now", "url": "/pay" },
  "transcript": [{ "role": "bot", "text": "…", "time": "2026-01-01T10:00:00Z" }]
}
```

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | Use in endpoints 6 and 7. |
| `status` | `ACTIVE` \| `COMPLETED` \| `ABANDONED` \| `EXPIRED` \| `ERROR` | |
| `message` | string | Bot message. |
| `currentNodeId` | number \| null | |
| `options[]` | array | `eventCode`, `optionIndex` (null for YES/NO), `optionLabel`. |
| `button` | object \| null | `label`, `url` (https URL or `/pay`). |
| `transcript[]` | array, optional | Only when rejoining an unfinished chat: `role` (`bot`/`user`), `text`, `time` (ISO, nullable). |

**Errors**: `409 CHAT_COMPLETED` (customer already finished); token errors (see Common).

---

## 6. Reply to conversation

| | |
|---|---|
| **Request URL** | `{baseUrl}/dp/waoutreach/api/conversations/{sessionId}/messages` |
| **Method** | `POST` |
| **Path params** | `sessionId` – from endpoint 5 (URL-encoded) |
| **Headers** | `Content-Type: application/json` (or `application/jose`); `Authorization: Bearer <JWT>` |

**Request body**

```json
{ "rawInput": "yes" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `rawInput` | string | yes | What the customer typed or tapped. |

**Response 200** – `ConversationResponse` (see endpoint 5; `transcript` is normally absent).

---

## 7. Get conversation status

| | |
|---|---|
| **Request URL** | `{baseUrl}/dp/waoutreach/api/conversations/{sessionId}` |
| **Method** | `GET` |
| **Path params** | `sessionId` |
| **Headers** | `Authorization: Bearer <JWT>`; `X-Enc: <JWE>` when encryption is on (GET has no body) |
| **Request body** | None |

**Response 200** – `ConversationResponse` (point-in-time snapshot, no reply sent).

---

## 8. Get customer session frame

| | |
|---|---|
| **Request URL** | `{baseUrl}/dp/waoutreach/api/customers/{customerId}/frame` |
| **Method** | `GET` |
| **Path params** | `customerId` – the value used to start the conversation (phone number in this demo; URL-encoded) |
| **Headers** | None required by the client (no JWT, not encrypted by default) |
| **Request body** | None |

**Response 200 – `SessionFrame`** (most recent session, reconstructed from the event log)

```json
{
  "sessionId": "…", "customerId": "9999999999", "workflowVersionId": 1,
  "status": "COMPLETED",
  "startedAt": "…", "lastInteractionAt": "…", "endedAt": "…",
  "context": {},
  "steps": [{
    "sequenceNo": 1, "timestamp": "…", "nodeCode": "…", "nodeType": "QUESTION",
    "title": "…", "message": "…",
    "optionsShown": [{ "optionIndex": 1, "optionLabel": "…", "chosen": true }],
    "rawInput": "1", "eventCode": "OPTION", "matched": true
  }],
  "pathSummary": "Option A > Option B",
  "conclusionCode": "REMINDER_SET",
  "entryReasonCode": "…"
}
```

| Field | Type | Notes |
|---|---|---|
| `status` | `ACTIVE` \| `COMPLETED` \| `ABANDONED` \| `EXPIRED` \| `ERROR` | |
| `endedAt` | string \| null | |
| `context` | object | |
| `steps[].nodeType` | `START` \| `MESSAGE` \| `QUESTION` \| `INPUT` \| `ACTION` \| `END` | |
| `steps[].message` | string \| null | Null for START/ACTION nodes. |
| `steps[].optionsShown` | array | Only non-empty on a QUESTION node's reply step. |
| `steps[].rawInput` | string \| null | What the customer typed/tapped. |
| `steps[].eventCode` | `AUTO` \| `OPTION` \| `YES` \| `NO` \| `SUCCESS` \| `FAILURE` \| `TIMEOUT` \| `INVALID_INPUT` | |
| `steps[].matched` | boolean | `false` only for an `INVALID_INPUT` attempt. |
| `pathSummary` | string | Breadcrumb of chosen options; empty if none. |
| `conclusionCode` | string \| null | Null while ACTIVE. |
| `entryReasonCode` | string \| null | Null until the session completes. |
