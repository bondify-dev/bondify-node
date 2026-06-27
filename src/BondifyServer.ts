// ============================================================
//  @bondify/node — BondifyServer
//  Main class for verifying proof JWTs and webhook signatures
// ============================================================

import * as crypto from 'crypto';
import * as jwt    from 'jsonwebtoken';

import type {
  BondifyServerConfig,
  BondifyProofPayload,
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
   * @param proof — the JWT string from BondifyUser.proof
   * @returns BondifyProofPayload — the verified payload
   *
   * @example
   * ```ts
   * const bondify = new BondifyServer({ jwtSecret: process.env.BONDIFY_WEBHOOK_SECRET! }); // whsec_… from the dashboard
   *
   * app.post('/api/auth', (req, res) => {
   *   try {
   *     const user = bondify.verifyProof(req.body.proof);
   *     res.json({ telegramId: user.telegram_id });
   *   } catch (e) {
   *     res.status(401).json({ error: e.message });
   *   }
   * });
   * ```
   */
  verifyProof(proof: string): BondifyProofPayload {
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
      if (e instanceof jwt.TokenExpiredError) {
        throw new BondifyVerificationError(
          'Proof JWT has expired. The user must sign in again.',
          'TOKEN_EXPIRED'
        );
      }
      if (e instanceof jwt.JsonWebTokenError) {
        throw new BondifyVerificationError(
          `Invalid proof JWT signature: ${e.message}`,
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

    return {
      telegram_id:       String(payload.telegram_id),
      telegram_name:     String(payload.telegram_name),
      telegram_username: payload.telegram_username ?? null,
      project_id:        String(payload.project_id),
      session_token:     String(payload.session_token),
      confirmed_at:      Number(payload.confirmed_at ?? 0),
      exp:               Number(payload.exp),
      iat:               Number(payload.iat),
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
   * Non-throwing version of verifyProof — returns null on failure.
   * Handy for middleware and SSR.
   */
  safeVerifyProof(proof: string): BondifyProofPayload | null {
    try {
      return this.verifyProof(proof);
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
