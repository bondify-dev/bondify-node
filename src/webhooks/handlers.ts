// ============================================================
//  @bondify/node — Webhook Handlers
//  Express and Next.js handlers with typed events
// ============================================================

import type { Request as ExpressRequest, Response as ExpressResponse, RequestHandler } from 'express';
import type { WebhookEvent, WebhookEventConfirmed, WebhookEventCancelled } from '../types';
import { BondifyServer }   from '../BondifyServer';
import { BondifyWebhookError } from '../types';

// ─── Handler types ────────────────────────────────────────────────────────────
export interface WebhookHandlers {
  onConfirmed?: (event: WebhookEventConfirmed) => void | Promise<void>;
  onCancelled?: (event: WebhookEventCancelled) => void | Promise<void>;
  onError?:     (error: BondifyWebhookError, raw: string) => void;
}

// ─── Express webhook handler ──────────────────────────────────────────────────

/**
 * Creates an Express Route Handler for processing Bondify webhooks.
 * Automatically verifies the HMAC signature and calls the matching handler.
 *
 * IMPORTANT: use with `express.raw({ type: 'application/json' })` BEFORE this handler.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { BondifyServer } from '@bondify/node';
 * import { createWebhookHandler } from '@bondify/node/webhooks';
 *
 * const bondify = new BondifyServer({ jwtSecret: process.env.BONDIFY_WEBHOOK_SECRET! }); // whsec_… from the dashboard
 *
 * app.post(
 *   '/webhook/bondify',
 *   express.raw({ type: 'application/json' }),
 *   createWebhookHandler(bondify, {
 *     onConfirmed: async (event) => {
 *       await db.users.upsert({ telegramId: event.telegram_id });
 *     },
 *     onCancelled: (event) => {
 *       console.log('Sign-in cancelled:', event.session_token);
 *     },
 *   })
 * );
 * ```
 */
export function createWebhookHandler(
  server: BondifyServer,
  handlers: WebhookHandlers
): RequestHandler {
  return async (req: ExpressRequest, res: ExpressResponse): Promise<void> => {
    const signature = req.headers['x-bondify-signature'] as string ?? '';
    const rawBody   = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : JSON.stringify(req.body);

    let event: WebhookEvent;
    try {
      event = server.verifyWebhook(rawBody, signature);
    } catch (e) {
      const err = e as BondifyWebhookError;
      console.error(`[Bondify Webhook] Verification failed: ${err.message}`);
      handlers.onError?.(err, rawBody);
      res.status(400).json({ error: err.message });
      return;
    }

    try {
      if (event.event === 'auth.confirmed') {
        await handlers.onConfirmed?.(event);
      } else if (event.event === 'auth.cancelled') {
        await handlers.onCancelled?.(event);
      }

      res.json({ ok: true });
    } catch (e) {
      console.error(`[Bondify Webhook] Handler error:`, e);
      res.status(500).json({ error: 'Internal handler error' });
    }
  };
}

// ─── Next.js App Router webhook handler ───────────────────────────────────────

/**
 * Creates a Next.js Route Handler for processing Bondify webhooks.
 *
 * @example
 * ```ts
 * // app/api/webhooks/bondify/route.ts
 * import { BondifyServer } from '@bondify/node';
 * import { createNextWebhookHandler } from '@bondify/node/webhooks';
 *
 * const bondify = new BondifyServer({
 *   jwtSecret: process.env.BONDIFY_WEBHOOK_SECRET!, // whsec_… from the dashboard (Project → Settings)
 * });
 *
 * export const POST = createNextWebhookHandler(bondify, {
 *   onConfirmed: async (event) => {
 *     await saveUserToDatabase(event.telegram_id, event.telegram_name);
 *   },
 * });
 * ```
 */
export function createNextWebhookHandler(
  server: BondifyServer,
  handlers: WebhookHandlers
) {
  return async function POST(request: globalThis.Request): Promise<globalThis.Response> {
    const signature = request.headers.get('x-bondify-signature') ?? '';
    let rawBody: string;

    try {
      rawBody = await request.text();
    } catch {
      return globalThis.Response.json({ error: 'Failed to read request body' }, { status: 400 });
    }

    let event: WebhookEvent;
    try {
      event = server.verifyWebhook(rawBody, signature);
    } catch (e) {
      const err = e as BondifyWebhookError;
      console.error(`[Bondify Webhook] Verification failed: ${err.message}`);
      handlers.onError?.(err, rawBody);
      return globalThis.Response.json({ error: err.message }, { status: 400 });
    }

    try {
      if (event.event === 'auth.confirmed') {
        await handlers.onConfirmed?.(event);
      } else if (event.event === 'auth.cancelled') {
        await handlers.onCancelled?.(event);
      }

      return globalThis.Response.json({ ok: true });
    } catch (e) {
      console.error('[Bondify Webhook] Handler error:', e);
      return globalThis.Response.json({ error: 'Internal handler error' }, { status: 500 });
    }
  };
}