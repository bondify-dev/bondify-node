# Changelog

All notable changes to `@bondify/node` will be documented in this file.

## Unreleased

- **Bugfix — `verifyWebhook()` no longer risks an uncaught exception on a
  malformed `X-Bondify-Signature` header.** `Buffer.from(signature, 'hex')`
  silently drops invalid characters / odd-length input instead of throwing,
  but the subsequent `crypto.timingSafeEqual()` call throws a `RangeError`
  whenever the resulting buffer lengths differ — which a malformed header
  can trigger. The signature comparison is now wrapped in `try/catch`,
  mirroring the same pattern already used by the Bondify backend itself for
  its payment webhooks. A malformed signature now correctly throws
  `BondifyWebhookError` with code `INVALID_SIGNATURE` instead of risking an
  unhandled error.

## 2.1.0 — Node.js > 14 & Next.js 16+ support

- **Node.js support: `engines.node` set to `>=18`** (drops EOL Node 14;
  supports 16/18/20/22).
- **Express peer simplified to `>=4.0.0`** (covers Express 4 and 5; the old
  `>=4.0.0 || >=5.0.0` was redundant).
- **Bugfix — `verifyNextRequest()` now reads headers correctly in the Next.js
  App Router.** It previously used `request.headers['authorization']` (bracket
  access), which is always `undefined` on a Web API `Request` whose `headers`
  is a `Headers` object. The proof was never read from the `Authorization`
  header or the `bondify_proof` cookie. It now uses `Headers.get()` with a
  plain-object fallback, so Route Handlers work on Next.js 13–16.

### Migration

- Reinstall after upgrading Next.js: `npm i @bondify/node@^2.1.0`.
- No code changes are needed in your app. If you used `verifyNextRequest` in an
  App Router Route Handler and auth silently failed, it now works.

## 2.0.0

- Initial public release: `BondifyServer`, Express middleware, webhook
  handlers (Express + Next.js), `BondifyAdminClient`.
