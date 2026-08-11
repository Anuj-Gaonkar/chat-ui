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

  return (await response.json()) as T;
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
