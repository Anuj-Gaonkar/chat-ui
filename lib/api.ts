// Typed client for the HDFC chatbot backend API.
//
// Requests go to same-origin `/api/...` paths, which next.config.ts rewrites/proxies to
// the real backend (NEXT_PUBLIC_API_BASE_URL) on the server side. This sidesteps CORS
// entirely instead of requiring a backend change. See NEXTJS_CHAT_UI_BRIEF.md.

export type SessionStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "ABANDONED"
  | "EXPIRED"
  | "ERROR";

export interface OptionResponse {
  eventCode: string;
  // Null for YES/NO transitions - only set for the generic numbered-option "OPTION" event
  // code, which is otherwise identical across every option on a QUESTION node (see
  // AMB_FULL_JOURNEY_DB_MIGRATION_PLAN.md in the backend repo for why eventCode alone is
  // no longer unique per option).
  optionIndex: number | null;
  optionLabel: string;
}

// A button under a bot message. `url` is an https URL, or "/pay" for chat-ui's own UPI payment page.
export interface ChatButton {
  label: string;
  url: string;
}

// One bubble of a conversation replayed to a customer who rejoined it. `time` is an ISO timestamp.
export interface TranscriptEntry {
  role: "bot" | "user";
  text: string;
  time: string | null;
}

export interface ConversationResponse {
  sessionId: string;
  status: SessionStatus;
  message: string;
  currentNodeId: number | null;
  options: OptionResponse[];
  // Null when the message the turn stopped on has no button.
  button: ChatButton | null;
  // Only present when the customer rejoined an unfinished conversation: every bubble so far,
  // ending with the question they still have to answer.
  transcript?: TranscriptEntry[];
}

export interface ApiErrorBody {
  error: "NOT_FOUND" | "CONFLICT" | "VALIDATION_FAILED" | string;
  message: string;
}

/** Thrown for any non-2xx response. Carries the backend's error code + message. */
export class ApiError extends Error {
  readonly code: string;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.error;
  }
}

// The chat a link opens when it doesn't name one (the `e` query parameter).
export const DEFAULT_ENTRY_CODE = "AMB_SHORTFALL_Q2";

// --- Chat token -------------------------------------------------------------------------------
// After the customer's number is verified the backend hands out a short-lived JWT. The conversation calls
// send it as "Authorization: Bearer", and every one of them answers with a renewed token in the
// X-Chat-Token header, so it only runs out after a stretch of inactivity. It lives in sessionStorage:
// it survives a reload of the tab but not closing it.
const TOKEN_KEY = "chat_token";
const TOKEN_HEADER = "X-Chat-Token";
const TOKEN_ERROR_CODES = ["TOKEN_REQUIRED", "TOKEN_EXPIRED", "TOKEN_INVALID"];

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // storage can be blocked (private mode, embedded views)
  }
}

function storeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to do: the customer is just asked for their number again next time
  }
}

/** True if this tab holds a chat token (it may still turn out to have expired). */
export function hasChatToken(): boolean {
  return readToken() !== null;
}

/** True when the link's whole window is over (403: LINK_EXPIRED): nothing can be done with it any more. */
export function isLinkExpired(err: unknown): boolean {
  return err instanceof ApiError && err.code === "LINK_EXPIRED";
}

/** True for a rejection that means "ask for the phone number again" (missing, expired or invalid token). */
export function isTokenError(err: unknown): boolean {
  return err instanceof ApiError && TOKEN_ERROR_CODES.includes(err.code);
}

// `auth` marks the conversation calls, which need the chat token; everything else is sent without it.
async function request<T>(path: string, init?: RequestInit, auth = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = auth ? readToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch {
    throw new ApiError({
      error: "NETWORK_ERROR",
      message: "Couldn't reach the server. Check your connection and try again.",
    });
  }

  // Every accepted conversation call hands back a renewed token; keep the newest one.
  const renewed = response.headers.get(TOKEN_HEADER);
  if (renewed) storeToken(renewed);

  if (!response.ok) {
    let body: ApiErrorBody;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = {
        error: "UNKNOWN",
        message: `Request failed with status ${response.status}.`,
      };
    }
    // A token the backend turned down is of no further use.
    if (TOKEN_ERROR_CODES.includes(body.error)) storeToken(null);
    throw new ApiError(body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface ChatSession {
  // True once the customer has typed the link's phone number back.
  verified: boolean;
  // The verified phone number (digits only, last 10), used as the customerId. Absent while the
  // session is still pending - the backend never reveals the number before it is confirmed.
  customerId?: string;
  // The chat this link is for (a chat_entry_point code); not sensitive, so it is known while pending.
  entryCode?: string;
  // Only set by start: the customer already finished this chat, so no number needs to be asked for.
  completed?: boolean;
  // Only set by verify: the chat token for the conversation calls. Kept by this module, not the pages.
  token?: string | null;
}

// What the CTA link carried: `?t=<token>` (an opaque token; the number and the chat come from it) or
// `?p=<number>` with an optional `&e=<chat>`.
export interface ChatLink {
  token?: string;
  phoneNumber?: string;
  entryCode?: string;
}

/** POST /api/chat-session/start — turns the CTA link into a pending session; the backend sets an
 * HttpOnly cookie (invisible to JS). Calling it again from the same browser resumes the session. A
 * token wins over a phone number if both are given. Rejects with an ApiError (403: INVALID_LINK) for an
 * unusable number or token or an unknown chat, (403: LINK_ALREADY_OPENED) when another browser opened
 * the link first and still holds it, and (403: LINK_EXPIRED) once its time window is over. */
export function startChatSession(link: ChatLink): Promise<ChatSession> {
  return request<ChatSession>("/api/chat-session/start", {
    method: "POST",
    body: JSON.stringify(link),
  });
}

/** POST /api/chat-session/verify — the customer types the number back. Resolves with the verified
 * session; rejects with an ApiError (403: PHONE_MISMATCH / TOO_MANY_ATTEMPTS / SESSION_EXPIRED). */
export async function verifyChatPhone(phoneNumber: string): Promise<ChatSession> {
  const session = await request<ChatSession>("/api/chat-session/verify", {
    method: "POST",
    body: JSON.stringify({ phoneNumber }),
  });
  storeToken(session.token ?? null);
  return session;
}

/** GET /api/chat-session — where this browser's session cookie stands. Rejects with an ApiError
 * (403: SESSION_REQUIRED / SESSION_EXPIRED) if the browser has no live session. */
export function getChatSession(): Promise<ChatSession> {
  return request<ChatSession>("/api/chat-session", { method: "GET" });
}

/** POST /api/chat-events — tells the backend the customer pressed the Fund now button, which opens the
 * UPI pay sheet. Fire-and-forget: it never throws and never delays the tap, and a failure (an expired
 * token, no connection) just means that one event is not recorded. */
export function logPayOpened(): void {
  request<void>(
    "/api/chat-events",
    { method: "POST", body: JSON.stringify({ type: "PAY_OPENED" }), keepalive: true },
    true
  ).catch(() => {});
}

/** POST /api/conversations — open the conversation for the chat the link was sent for. A customer who
 * left it unfinished gets it back with its `transcript`; one who finished it is rejected with an
 * ApiError (409: CHAT_COMPLETED). `restart` asks for a fresh one and only works on a backend that
 * allows it (local testing). */
export function startConversation(
  customerId: string,
  entryCode: string = DEFAULT_ENTRY_CODE,
  restart = false
): Promise<ConversationResponse> {
  return request<ConversationResponse>(
    "/api/conversations",
    {
      method: "POST",
      body: JSON.stringify({
        entryCode,
        customerId,
        context: {},
        restart,
      }),
    },
    true
  );
}

/** POST /api/conversations/{sessionId}/messages — reply to the current question. */
export function replyToConversation(
  sessionId: string,
  rawInput: string
): Promise<ConversationResponse> {
  return request<ConversationResponse>(
    `/api/conversations/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ rawInput }),
    },
    true
  );
}

/** GET /api/conversations/{sessionId} — point-in-time snapshot, no reply sent. */
export function getConversationStatus(sessionId: string): Promise<ConversationResponse> {
  return request<ConversationResponse>(
    `/api/conversations/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
    true
  );
}

// --- Session frame (whole-journey reconstruction) ---
//
// Read-only, separate from the live conversation loop above. Reconstructed on the backend
// from the session's event log against the graph's *current* node/transition text - not a
// byte-exact historical replay (see SessionFrameService on the backend for why).

export type NodeType = "START" | "MESSAGE" | "QUESTION" | "INPUT" | "ACTION" | "END";

export type EventCode =
  | "AUTO"
  | "OPTION"
  | "YES"
  | "NO"
  | "SUCCESS"
  | "FAILURE"
  | "TIMEOUT"
  | "INVALID_INPUT";

export interface FrameOption {
  optionIndex: number | null;
  optionLabel: string;
  chosen: boolean;
}

export interface FrameStep {
  sequenceNo: number;
  timestamp: string;
  nodeCode: string;
  nodeType: NodeType;
  title: string;
  // Null for START/ACTION nodes - never customer-facing (see WorkflowEngine's ACTION handling).
  message: string | null;
  // Only non-empty for a QUESTION node's reply step - what was on screen when they answered.
  optionsShown: FrameOption[];
  // What the customer actually typed/tapped for this step, if anything.
  rawInput: string | null;
  eventCode: EventCode;
  // False only for an INVALID_INPUT attempt - kept in the frame even though a live chat
  // transcript wouldn't show it.
  matched: boolean;
}

export interface SessionFrame {
  sessionId: string;
  customerId: string;
  workflowVersionId: number;
  status: SessionStatus;
  startedAt: string;
  lastInteractionAt: string;
  endedAt: string | null;
  context: Record<string, unknown>;
  steps: FrameStep[];
  // The full breadcrumb of chosen options, e.g. "I no longer actively use this account >
  // Service concern > Request a callback" - empty string if nothing was chosen yet.
  pathSummary: string;
  // Business outcome, frozen the instant the session reached its END node - null while ACTIVE
  // (or for a session that never finished; see the backend's session_outcome view for those).
  conclusionCode: string | null;
  // Which top-level menu option the customer picked, frozen alongside conclusionCode - null
  // until the session completes. Distinguishes paths that converge on the same conclusionCode
  // (e.g. "funds shortly" vs. "cash flow constraints -> remind me later" both end in
  // REMINDER_SET) - pathSummary above is the finer-grained version of the same idea.
  entryReasonCode: string | null;
}

/** GET /api/customers/{customerId}/frame — reconstructs a customer's most recent session,
 * end to end. `customerId` is whatever value was used to start the conversation (a phone
 * number, for this demo). */
export function getCustomerFrame(customerId: string): Promise<SessionFrame> {
  return request<SessionFrame>(
    `/api/customers/${encodeURIComponent(customerId)}/frame`,
    { method: "GET" }
  );
}
