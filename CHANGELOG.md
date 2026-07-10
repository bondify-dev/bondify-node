# Changelog

All notable changes to `@bondify/node` will be documented in this file.

## 3.0.2 — Critical: `verifyProof()` could throw `jwt.verify is not a function` under native ESM

**This is a more severe, non-Windows-specific bug found while re-verifying the 3.0.1 fix — upgrade is strongly recommended for all platforms.**

**Fixed:**

- **`verifyProof()` could fail entirely with `TypeError: jwt.verify is not a
  function`** when `@bondify/node`'s ESM build (`dist/index.js`) is loaded by
  Node's native ESM resolver — i.e. any consumer that isn't bundling this
  package through a bundler (webpack/esbuild/Turbopack), such as a plain
  Node.js server with `"type": "module"` or a `.mjs` entry point. This is
  **not limited to Windows** and does not depend on any error path — it
  broke the success path too, unconditionally, wherever it occurred.

  Root cause: `jsonwebtoken` is CJS-only, and its `module.exports` is an
  object literal whose values are all `require()` calls (`{ verify:
  require('./verify'), sign: require('./sign'), ... }`). Node's native ESM
  loader synthesizes named exports for CJS modules via static source
  analysis (`cjs-module-lexer`), and that analysis does not reliably detect
  object keys whose values are `require()` calls — in practice, only the
  first such key was exposed as a named export, and `jsonwebtoken`'s
  `verify`, `sign`, `TokenExpiredError`, etc. were all invisible to a
  `import * as jwt from 'jsonwebtoken'` namespace import. This is a general
  limitation, verified independently of the specific `jsonwebtoken` version.

  Fixed by switching to `import jwt from 'jsonwebtoken'` (a default import).
  Node's ESM loader always provides the complete, real `module.exports`
  object as the default export, regardless of the lexer's ability to detect
  individual named exports — so `jwt.verify`, `jwt.TokenExpiredError`, etc.
  are now guaranteed to be present.

- Verified with an actual end-to-end run of both the ESM (`dist/index.js`)
  and CJS (`dist/index.cjs`) builds — valid proof, expired proof, and
  invalid-signature proof all now resolve identically on both.

- **`createBondifyMiddleware()` could never correctly report an expired
  token as `TOKEN_EXPIRED`** — it always fell back to the generic
  `INVALID_TOKEN` response instead. This package's CJS build bundles each
  entry point (`dist/index.cjs`, `dist/middleware/express.cjs`) as a fully
  self-contained file; tsup does not share a common chunk between separate
  CJS outputs the way it does for ESM. As a result, `dist/index.cjs` and
  `dist/middleware/express.cjs` each ended up with their **own separate
  copy** of the `BondifyVerificationError` class, so the middleware's
  `e instanceof BondifyVerificationError` check always evaluated to
  `false` when this package is required via CJS (the common case for
  Express apps) — independent of platform, and present since the
  middleware was introduced. Fixed by checking `e.code === 'TOKEN_EXPIRED'`
  directly instead of `instanceof`. Verified end-to-end against a real
  Express-style request/response cycle with both valid and expired tokens.
  (This did not affect `bondify.verifyProof()` used directly, or the ESM
  build, which does correctly share one `BondifyVerificationError` class
  across entry points via a common chunk — only `createBondifyMiddleware()`
  consumed via `require()`.)

**Added:**

- **`BondifyUser` (returned by `verifyProof()`/`safeVerifyProof()`) now
  includes `telegramPhone: string | null`**, mirroring the field already
  present in webhook payloads (`WebhookEventConfirmed.telegram_phone`) and
  in `@bondify/react`'s client-side `BondifyUser`. Previously this field
  didn't exist on the server-verified user at all, so
  `@bondify/react/server`'s `getServerUser()` always hardcoded it to
  `null` even when a phone number was available (Pro/Business one-tap
  flow) — client and server `BondifyUser` shapes are now consistent.
  Requires `@bondify/react@^3.0.2` to pick this up in `getServerUser()`.

No action needed to upgrade: `npm i @bondify/node@^3.0.1`. If you were
working around this (e.g. by calling `jsonwebtoken` directly instead of
`verifyProof()`), you can now remove that workaround.

## 3.0.1 — Windows fix for `verifyProof()`

**Fixed:**

- **`verifyProof()` could throw `Right-hand side of 'instanceof' is not an
  object` on Windows.** The error-classification logic used
  `e instanceof jwt.TokenExpiredError` / `jwt.JsonWebTokenError` against a
  namespace import (`import * as jwt from 'jsonwebtoken'`) of a CJS-only
  package. Depending on how Node's ESM/CJS interop resolved the module graph,
  the error thrown by `jwt.verify()` and the class referenced through the
  namespace import could end up as two different module instances, making
  `instanceof` unreliable — this reproduced consistently on Windows and not
  on Linux/macOS. Replaced the check with `error.name === 'TokenExpiredError'`
  / `'JsonWebTokenError'`, which does not depend on module identity and is
  correct on every platform. This affects `verifyProof()` directly, and
  everything built on top of it: `createBondifyMiddleware`,
  `verifyNextRequest`, and `@bondify/react/server`'s `requireAuth`.
- **Inconsistent import path in the `createWebhookHandler` /
  `createNextWebhookHandler` JSDoc examples.** The in-code examples imported
  both functions from the package root (`@bondify/node`) instead of the
  `@bondify/node/webhooks` subpath where they actually live. Both paths work
  (everything is re-exported from the root too), but the examples now
  consistently use the subpath to match the rest of the docs and avoid
  confusion about which import style is canonical.

No breaking changes. No API surface changes — this is a bugfix-only release.

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
