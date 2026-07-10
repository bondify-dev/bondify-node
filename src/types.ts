// ============================================================
//  @bondify/node — Types
//  Full type definitions for the Bondify Node.js SDK
// ============================================================

export interface BondifyServerConfig {
  /**
   * Project webhook secret (whsec_…) from the Bondify dashboard.
   * Used to verify the user's proof JWT.
   * Get it from: Project → Settings → Webhook Secret
   * (GET /api/v1/dev/projects/:id/webhook-secret).
   */
  jwtSecret: string;
  /**
   * Project webhook secret (whsec_…) from the Bondify dashboard.
   * Defaults to jwtSecret if omitted (it's the same secret).
   */
  webhookSecret?: string;
  /**
   * Base URL of the Bondify API (default: https://api.bondify.dev)
   */
  apiUrl?: string;
}

// ─── Verified proof JWT payload ───────────────────────────────────────────────
/**
 * The verified identity returned by `verifyProof()` / `safeVerifyProof()`.
 *
 * Field names are camelCase to match `@bondify/react`'s `BondifyUser` — the
 * same shape appears on the client (`useBondifyUser()`) and on the server
 * (`verifyProof()`), so you never have to remember which side uses which
 * casing.
 */
export interface BondifyUser {
  telegramId:       string;
  telegramName:     string;
  telegramUsername: string | null;
  /** Phone number (one-tap flow, Pro/Business plans only; otherwise null) */
  telegramPhone:    string | null;
  projectId:        string;
  sessionToken:     string;
  confirmedAt:      number;
  /** Token expiry time (Unix timestamp) */
  exp:              number;
  /** Token issued-at time (Unix timestamp) */
  iat:              number;
}

/**
 * @deprecated Renamed to `BondifyUser` in v3.0.0 for consistency with
 * `@bondify/react` (camelCase on both client and server). This alias is kept
 * so existing type-only imports keep compiling, but the object shape itself
 * changed — it is camelCase now, not snake_case. Update your code to use
 * `BondifyUser` and camelCase field access (`telegramId`, not `telegram_id`).
 */
export type BondifyProofPayload = BondifyUser;

// ─── Webhook Event ────────────────────────────────────────────────────────────
export type WebhookEventType = 'auth.confirmed' | 'auth.cancelled';

export interface WebhookEventConfirmed {
  event:              'auth.confirmed';
  session_token:      string;
  telegram_id:        string;
  telegram_name:      string;
  telegram_username:  string | null;
  /** Phone number (one-tap flow, Pro/Business plans only; otherwise null) */
  telegram_phone?:    string | null;
  confirmed_at:       number;
}

export interface WebhookEventCancelled {
  event:        'auth.cancelled';
  session_token: string;
  cancelled_at: number;
}

export type WebhookEvent = WebhookEventConfirmed | WebhookEventCancelled;

// ─── Errors ────────────────────────────────────────────────────────────────────
export class BondifyVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_SIGNATURE' | 'TOKEN_EXPIRED' | 'INVALID_TOKEN' | 'MISSING_FIELDS'
  ) {
    super(message);
    this.name = 'BondifyVerificationError';
  }
}

export class BondifyWebhookError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_SIGNATURE' | 'MISSING_SIGNATURE' | 'PARSE_ERROR'
  ) {
    super(message);
    this.name = 'BondifyWebhookError';
  }
}

// ─── Express/Next.js middleware types ────────────────────────────────────────
export interface BondifyRequest {
  /** Verified proof JWT payload */
  bondifyUser: BondifyUser;
}

export interface BondifyMiddlewareOptions {
  /** Cookie name to read the proof from (default: 'bondify_proof') */
  cookieName?:   string;
  /** HTTP header name (default: Authorization: Bearer ...) */
  headerName?:   string;
  /** Custom function to extract the token from the request */
  tokenGetter?:  (req: unknown) => string | null;
  /** Called on authorization failure (default: responds with 401) */
  onUnauthorized?: (req: unknown, res: unknown) => void;
}

// ─── API Client types ─────────────────────────────────────────────────────────
export interface DeveloperInfo {
  developer_id: string;
  email:        string;
  plan:         'hobby' | 'pro' | 'business';
  mau: {
    current: number;
    limit:   number;
    over:    number;
  };
}

export interface ProjectInfo {
  project_id:     string;
  name:           string;
  webhook_url:    string | null;
  active:         boolean;
  public_access:  boolean;
  secret_preview: string | null;
  created_at:     number;
  req_phone:      boolean;
}

export interface SessionInfo {
  session_token:      string;
  project_id:         string;
  project_name:       string;
  status:             string;
  telegram_id:        string | null;
  telegram_name:      string | null;
  telegram_username:  string | null;
  created_at:         number;
  confirmed_at:       number | null;
}
