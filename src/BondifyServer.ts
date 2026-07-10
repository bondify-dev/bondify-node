// ============================================================
//  @bondify/node — BondifyServer
//  Main class for verifying proof JWTs and webhook signatures
// ============================================================

import * as crypto from 'crypto';
// NOTE: default import, not `import * as jwt`. `jsonwebtoken` is CJS-only,
// and its module.exports is a plain object whose values are all `require()`
// calls (`{ verify: require('./verify'), sign: require('./sign'), ... }`).
// Under Node's native ESM loader, named-export synthesis for CJS modules
// relies on static source analysis (cjs-module-lexer) — and that analysis
// does not reliably detect keys whose values come from require() calls; in
// practice only the first such key gets exposed as a named export. A
// namespace import (`import * as jwt`) depends on that synthesis and can
// silently end up with `jwt.verify === undefined` — not a Windows-only
// issue, this reproduces under any native (non-bundled) ESM consumer. The
// default export, in contrast, is always the complete, real
// `module.exports` object, so `jwt.verify`/`jwt.TokenExpiredError`/etc. are
// guaranteed to be there when accessed through it.
import jwt from 'jsonwebtoken';

import type {
  BondifyServerConfig,
  BondifyUser,
  WebhookEvent,
} from './types';
import {
  BondifyVerificationError,
  BondifyWebhookError,
} from './types';

export class BondifyServer {
  private readonly jwtSecret:     string;
  private readonly webhookSecret: string;
  private readonly apiUrl:        string;

  constructor(config: BondifyServerConfig) {
    if (!config.jwtSecret) {
      throw new Error(
        '[Bondify] jwtSecret is required. Provide your project webhook secret (whsec_…) from the Bondify dashboard: Project → Settings → Webhook Secret.'
      );
    }
    this.jwtSecret     = config.jwtSecret;
    this.webhookSecret = config.webhookSecret ?? config.jwtSecret;
    this.apiUrl        = (config.apiUrl ?? 'https://api.bondify.dev').replace(/\/$/, '');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PROOF VERIFICATION — verifying the user's proof JWT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Verifies the proof JWT issued by Bondify after a successful sign-in.
   * Throws BondifyVerificationError if the token is invalid or expired.
   *
   * **Always async — always `await` it.** Verification itself is local (no
   * network call), but the method returns a `Promise` for consistency with
   * every other auth SDK (Clerk, NextAuth, Passport, etc.), so `await` and
   * `.then()` both work as expected.
   *
   * **Proof lifetime: 5 minutes.** The JWT's `exp` claim is set 5 minutes
   * after issuance. Verify it promptly after receiving it — a proof that
   * arrives late (slow network, user idles on a confirmation screen, etc.)
   * will throw with code `TOKEN_EXPIRED`. Always handle that case explicitly
   * and prompt the user to sign in again; don't treat it the same as an
   * invalid signature.
   *
   * @param proof — the JWT string from BondifyUser.proof
   * @returns Promise<BondifyUser> — the verified identity (camelCase fields)
   *
   * @example
   * ```ts
   * const bondify = new BondifyServer({ jwtSecret: process.env.BONDIFY_WEBHOOK_SECRET! }); // whsec_… from the dashboard
   *
   * app.post('/api/auth', async (req, res) => {
   *   try {
   *     const user = await bondify.verifyProof(req.body.proof);
   *     res.json({ telegramId: user.telegramId });
   *   } catch (e) {
   *     if (e instanceof BondifyVerificationError && e.code === 'TOKEN_EXPIRED') {
   *       return res.status(401).json({ error: 'Proof expired, please sign in again' });
   *     }
   *     res.status(401).json({ error: e.message });
   *   }
   * });
   * ```
   */
  async verifyProof(proof: string): Promise<BondifyUser> {
    if (!proof || typeof proof !== 'string') {
      throw new BondifyVerificationError(
        'proof is required and must be a string',
        'INVALID_TOKEN'
      );
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(proof, this.jwtSecret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;
    } catch (e) {
      // NOTE: we deliberately check `e.name` here instead of
      // `e instanceof jwt.TokenExpiredError` / `jwt.JsonWebTokenError`.
      //
      // `jsonwebtoken` is a CJS-only package. Under `import * as jwt from
      // 'jsonwebtoken'`, Node's ESM/CJS interop can — depending on platform
      // and how the loader resolves the module graph — end up with the
      // error thrown by `jwt.verify()` and the class referenced via the
      // namespace import belonging to two different module instances. When
      // that happens `instanceof` silently returns `false`, or the
      // right-hand side is `undefined` and the check throws
      // `Right-hand side of 'instanceof' is not an object`. This was
      // observed to fail reliably on Windows while working fine on
      // Linux/macOS. Checking `.name` (set by jsonwebtoken's own error
      // classes) sidesteps module-identity entirely and works regardless of
      // interop behavior, Node version, or platform.
      const name = (e as Error)?.name;

      if (name === 'TokenExpiredError') {
        throw new BondifyVerificationError(
          'Proof JWT has expired (proofs are valid for 5 minutes). The user must sign in again.',
          'TOKEN_EXPIRED'
        );
      }
      if (name === 'JsonWebTokenError') {
        throw new BondifyVerificationError(
          `Invalid proof JWT signature: ${(e as Error).message}`,
          'INVALID_SIGNATURE'
        );
      }
      throw new BondifyVerificationError(
        `JWT verification error: ${(e as Error).message}`,
        'INVALID_TOKEN'
      );
    }

    // Check required fields
    const required = ['telegram_id', 'telegram_name', 'project_id', 'session_token'];
    for (const field of required) {
      if (!payload[field]) {
        throw new BondifyVerificationError(
          `Proof JWT is missing a required field: ${field}`,
          'MISSING_FIELDS'
        );
      }
    }

    // NOTE: telegram_phone is only present in the JWT for the Pro/Business
    // one-tap phone flow, mirroring the `telegram_phone` field already sent
    // in the webhook payload (WebhookEventConfirmed) for the same
    // confirmed-auth event. If a given proof's JWT doesn't carry this claim,
    // this correctly falls back to null — same as before this field existed.
    return {
      telegramId:       String(payload.telegram_id),
      telegramName:     String(payload.telegram_name),
      telegramUsername: payload.telegram_username ?? null,
      telegramPhone:    payload.telegram_phone ?? null,
      projectId:        String(payload.project_id),
      sessionToken:     String(payload.session_token),
      confirmedAt:      Number(payload.confirmed_at ?? 0),
      exp:              Number(payload.exp),
      iat:              Number(payload.iat),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  WEBHOOK VALIDATION — verifying the HMAC SHA256 signature
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Verifies an incoming Bondify webhook.
   * Checks the HMAC SHA256 signature in the X-Bondify-Signature header.
   *
   * @param payload     — the raw request body (Buffer or string)
   * @param signature   — the value of the X-Bondify-Signature header
   * @returns WebhookEvent — the parsed and verified event
   *
   * @example
   * ```ts
   * app.post('/webhook/bondify',
   *   express.raw({ type: 'application/json' }),
   *   (req, res) => {
   *     const event = bondify.verifyWebhook(
   *       req.body,
   *       req.headers['x-bondify-signature'] as string
   *     );
   *
   *     if (event.event === 'auth.confirmed') {
   *       console.log('New user:', event.telegram_id);
   *     }
   *     res.json({ ok: true });
   *   }
   * );
   * ```
   */
  verifyWebhook(payload: Buffer | string, signature: string): WebhookEvent {
    if (!signature) {
      throw new BondifyWebhookError(
        'X-Bondify-Signature header is missing',
        'MISSING_SIGNATURE'
      );
    }

    const rawBody = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;

    // Compute the expected signature
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Constant-time comparison (timing-attack protection).
    // Wrapped in try/catch the same way the Bondify backend itself does it
    // (see its payment webhook handlers): Buffer.from(str, 'hex') doesn't
    // validate its input, and timingSafeEqual throws a RangeError whenever
    // the resulting buffer lengths differ. Without try/catch this would
    // surface as an unhandled throw / 500 error instead of a clean
    // BondifyWebhookError.
    let signatureValid = false;
    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      signatureValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      throw new BondifyWebhookError(
        'Invalid webhook signature. Check your webhookSecret.',
        'INVALID_SIGNATURE'
      );
    }

    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BondifyWebhookError(
        'Webhook body is not valid JSON',
        'PARSE_ERROR'
      );
    }

    return event as WebhookEvent;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SAFE VERIFY — never throws
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Non-throwing version of verifyProof — resolves to `null` instead of
   * throwing (invalid signature, malformed token, or an expired proof —
   * lifetime is 5 minutes — are all folded into `null`). Handy for
   * middleware and SSR where you just need a yes/no.
   *
   * Also async — `await` it, same as `verifyProof()`.
   */
  async safeVerifyProof(proof: string): Promise<BondifyUser | null> {
    try {
      return await this.verifyProof(proof);
    } catch {
      return null;
    }
  }

  /**
   * Non-throwing version of verifyWebhook — returns null on failure.
   */
  safeVerifyWebhook(
    payload: Buffer | string,
    signature: string
  ): WebhookEvent | null {
    try {
      return this.verifyWebhook(payload, signature);
    } catch {
      return null;
    }
  }
}
