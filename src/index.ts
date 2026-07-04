// ============================================================
//  @bondify/node — Public API
//  Single export point for the Node.js SDK
// ============================================================

// Main class
export { BondifyServer } from './BondifyServer';

// Middleware
export { createBondifyMiddleware, verifyNextRequest } from './middleware/express';

// Webhook handlers
export {
  createWebhookHandler,
  createNextWebhookHandler,
} from './webhooks/handlers';
export type { WebhookHandlers } from './webhooks/handlers';

// Admin client
export { BondifyAdminClient }  from './utils/admin-client';
export type { AdminClientConfig } from './utils/admin-client';

// Types
export type {
  BondifyServerConfig,
  BondifyUser,
  /** @deprecated Use `BondifyUser` instead. */
  BondifyProofPayload,
  WebhookEvent,
  WebhookEventConfirmed,
  WebhookEventCancelled,
  WebhookEventType,
  BondifyMiddlewareOptions,
  DeveloperInfo,
  ProjectInfo,
  SessionInfo,
} from './types';

// Errors
export { BondifyVerificationError, BondifyWebhookError } from './types';
