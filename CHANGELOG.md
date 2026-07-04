# Changelog

All notable changes to `@bondify/node` will be documented in this file.

## 3.0.0 — Standardized identity shape, async verification

**Breaking changes:**

- **`verifyProof()` and `safeVerifyProof()` are now `async` and return a
  `Promise`.** Verification itself is still fully local (no network call) —
  the change is purely to match the async convention used by every other
  auth SDK (Clerk, NextAuth, Passport, …), so `await bondify.verifyProof(proof)`
  now behaves the way you'd expect instead of silently working by accident.
  Update every call site to `await` it (or `.then()`).
- **The verified payload is now camelCase (`BondifyUser`) instead of
  snake_case (`BondifyProofPayload`).** `telegram_id` → `telegramId`,
  `telegram_name` → `telegramName`, `telegram_username` → `telegramUsername`,
  `project_id` → `projectId`, `session_token` → `sessionToken`,
  `confirmed_at` → `confirmedAt`. This is the same shape `@bondify/react`
  already returns on the client, so the identity object is now identical on
  both sides of your app. The old type name `BondifyProofPayload` is kept as
  a deprecated alias for `BondifyUser` so type-only imports don't break, but
  the object's fields did change — update field access to camelCase.
- **`verifyNextRequest()` is now `async`** (it calls `safeVerifyProof()`
  internally). Add `await` at call sites.

**Not changed:** `verifyWebhook()`, `WebhookEvent`, and the REST API client
types (`DeveloperInfo`, `ProjectInfo`, `SessionInfo`) are still snake_case —
they mirror the raw JSON Bondify sends over the wire (webhook payloads and
the REST API), which is a deliberate, separate convention from the SDK's own
ergonomic surface.

### Migration

```bash
npm i @bondify/node@^3.0.0
```

```diff
- const user = bondify.verifyProof(proof);
- console.log(user.telegram_id);
+ const user = await bondify.verifyProof(proof);
+ console.log(user.telegramId);
```

```diff
- const user = verifyNextRequest(bondify, request);
+ const user = await verifyNextRequest(bondify, request);
```

If you can't migrate immediately, `1.x` and `2.x` remain installable but are
no longer maintained — see the note below.

### A note on 1.x and 2.x

`@bondify/node@1.x` is deprecated and unsupported. If you're still on `1.x`,
upgrade straight to `3.x`; there is no reason to stop at `2.x` first.

---

> **The entries below (`2.x`, `1.x`) are kept as a historical record.
> All 1.x and 2.x releases are deprecated — install `@bondify/node@^3.0.0`.**

## 2.1.2 — Webhook signature hardening *(deprecated)*

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

## 2.1.1 *(deprecated)*

- Internal release. No public API changes.

## 2.1.0 — Node.js ≥ 18 & Next.js 16+ support *(deprecated)*

- **Node.js support: `engines.node` set to `>=18`** (drops EOL Node 14 and 16;
  supports 18/20/22 (LTS)).
- **Express peer simplified to `>=4.0.0`** (covers Express 4 and 5; the old
  `>=4.0.0 || >=5.0.0` was redundant).
- **Bugfix — `verifyNextRequest()` now reads headers correctly in the Next.js
  App Router.** It previously used `request.headers['authorization']` (bracket
  access), which is always `undefined` on a Web API `Request` whose `headers`
  is a `Headers` object. The proof was never read from the `Authorization`
  header or the `bondify_proof` cookie. It now uses `Headers.get()` with a
  plain-object fallback, so Route Handlers work on Next.js 13–16.

## 2.0.0 *(deprecated)*

- Initial public release: `BondifyServer`, Express middleware, webhook
  handlers (Express + Next.js), `BondifyAdminClient`.
