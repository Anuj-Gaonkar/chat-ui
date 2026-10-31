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

export interface ConversationResponse {
  sessionId: string;
  status: SessionStatus;
  message: string;
  currentNodeId: number | null;
  options: OptionResponse[];
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

// The single seeded flow this test harness drives. Not user-editable input.
export const ENTRY_CODE = "AMB_SHORTFALL_Q2";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError({
      error: "NETWORK_ERROR",
      message: "Couldn't reach the server. Check your connection and try again.",
    });
  }

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
    throw new ApiError(body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface ChatSession {
  // The phone number the link was sent to (digits only, last 10). Used as the customerId.
  customerId: string;
}

/** POST /api/chat-tokens/claim — the first browser to present a link token claims it and gets an
 * HttpOnly session cookie (set by the backend, invisible to JS). Presenting it again from the same
 * browser resumes. Rejects with an ApiError (403: INVALID_TOKEN / TOKEN_EXPIRED /
 * TOKEN_ALREADY_USED) otherwise - e.g. a forwarded link opened on another device. */
export function claimAccessToken(token: string): Promise<ChatSession> {
  return request<ChatSession>("/api/chat-tokens/claim", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** GET /api/chat-session — who this browser's session cookie belongs to. Rejects with an ApiError
 * (403: SESSION_REQUIRED / SESSION_EXPIRED) if the browser has no valid session. */
export function getChatSession(): Promise<ChatSession> {
  return request<ChatSession>("/api/chat-session", { method: "GET" });
}

/** POST /api/conversations — start a new conversation. */
export function startConversation(customerId: string): Promise<ConversationResponse> {
  return request<ConversationResponse>("/api/conversations", {
    method: "POST",
    body: JSON.stringify({
      entryCode: ENTRY_CODE,
      customerId,
      context: {},
    }),
  });
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
    }
  );
}

/** GET /api/conversations/{sessionId} — point-in-time snapshot, no reply sent. */
export function getConversationStatus(sessionId: string): Promise<ConversationResponse> {
  return request<ConversationResponse>(
    `/api/conversations/${encodeURIComponent(sessionId)}`,
    { method: "GET" }
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
