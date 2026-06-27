// ============================================================
//  @bondify/node — Express Middleware
//  requireBondifyAuth — protects Express/Fastify routes
// ============================================================

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { BondifyProofPayload, BondifyMiddlewareOptions } from '../types';
import { BondifyServer } from '../BondifyServer';
import { BondifyVerificationError } from '../types';

// Extend the Express Request type
declare global {
  namespace Express {
    interface Request {
      bondifyUser?: BondifyProofPayload;
    }
  }
}

// ─── Middleware factory ───────────────────────────────────────────────────────

/**
 * Creates an Express middleware that protects routes.
 * Verifies the proof JWT from the Authorization header or a cookie.
 *
 * @example
 * ```ts
 * import { createBondifyMiddleware } from '@bondify/node/middleware';
 *
 * const bondify = new BondifyServer({ jwtSecret: process.env.BONDIFY_WEBHOOK_SECRET! }); // whsec_… from the dashboard
 * const requireAuth = createBondifyMiddleware(bondify);
 *
 * // Protected route
 * app.get('/api/profile', requireAuth, (req, res) => {
 *   res.json({ telegramId: req.bondifyUser!.telegram_id });
 * });
 * ```
 */
export function createBondifyMiddleware(
  server: BondifyServer,
  options: BondifyMiddlewareOptions = {}
): RequestHandler {
  const {
    cookieName    = 'bondify_proof',
    headerName    = 'authorization',
    tokenGetter,
    onUnauthorized,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    let token: string | null = null;

    // 1. Custom getter
    if (tokenGetter) {
      token = tokenGetter(req);
    }

    // 2. Authorization: Bearer <token>
    if (!token) {
      const authHeader = req.headers[headerName] as string | undefined;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    // 3. Cookie
    if (!token && req.cookies?.[cookieName]) {
      token = req.cookies[cookieName] as string;
    }

    if (!token) {
      if (onUnauthorized) {
        onUnauthorized(req, res);
        return;
      }
      res.status(401).json({
        error: 'Unauthorized',
        code:  'MISSING_TOKEN',
        message: 'Bondify authentication is required',
      });
      return;
    }

    try {
      req.bondifyUser = server.verifyProof(token);
      next();
    } catch (e) {
      const isExpired = e instanceof BondifyVerificationError && e.code === 'TOKEN_EXPIRED';

      if (onUnauthorized) {
        onUnauthorized(req, res);
        return;
      }

      res.status(401).json({
        error:   isExpired ? 'Token Expired'   : 'Unauthorized',
        code:    isExpired ? 'TOKEN_EXPIRED'   : 'INVALID_TOKEN',
        message: isExpired
          ? 'Proof JWT has expired. Please sign in again.'
          : 'Invalid or malformed auth token.',
      });
    }
  };
}

// ─── Next.js Route Handler helper ────────────────────────────────────────────

/**
 * Verifies the proof from a Next.js Request.
 * Used in App Router Route Handlers.
 *
 * @example
 * ```ts
 * // app/api/profile/route.ts
 * import { verifyNextRequest } from '@bondify/node/middleware';
 *
 * const bondify = new BondifyServer({ jwtSecret: process.env.BONDIFY_WEBHOOK_SECRET! }); // whsec_… from the dashboard
 *
 * export async function GET(request: Request) {
 *   const user = verifyNextRequest(bondify, request);
 *   if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
 *   return Response.json({ telegramId: user.telegram_id });
 * }
 * ```
 */
export function verifyNextRequest(
  server: BondifyServer,
  request: Request,
  cookieName = 'bondify_proof'
): BondifyProofPayload | null {
  // Next.js (App Router) passes a Web API Request, whose headers are a
  // Headers object: values can ONLY be read via .get(), not by index.
  // This used to read request.headers['authorization'], which on a real
  // Web Request always evaluates to undefined — so the proof was never
  // read from the header/cookie (Next 13–16). Both runtimes are now
  // supported: Web Headers (.get) and Node/Express IncomingHttpHeaders
  // (index access). Cast through unknown because statically
  // request.headers is typed as IncomingHttpHeaders and doesn't directly
  // narrow to Web Headers.
  const rawHeaders = request.headers as unknown as {
    get?: (name: string) => string | null;
  } & Record<string, string | string[] | undefined>;
  const getHeader = (name: string): string | undefined => {
    if (typeof rawHeaders.get === 'function') return rawHeaders.get(name) ?? undefined;
    const v = rawHeaders[name];
    return Array.isArray(v) ? v[0] : v;
  };

  // Authorization header
  const authHeader = getHeader('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return server.safeVerifyProof(token);
  }

  // Cookie via the Web API
  const cookieHeader = getHeader('cookie');
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const token   = cookies[cookieName];
    if (token) return server.safeVerifyProof(token);
  }

  return null;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map(c => c.trim().split('='))
      .filter(parts => parts.length === 2)
      .map(([k, v]) => [decodeURIComponent(k.trim()), decodeURIComponent(v.trim())])
  );
}
