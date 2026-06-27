# @bondify/node — Telegram Login SDK for Node.js & Express

[![npm version](https://img.shields.io/npm/v/@bondify/node.svg)](https://www.npmjs.com/package/@bondify/node)
[![license](https://img.shields.io/npm/l/@bondify/node.svg)](./LICENSE)

A **Telegram authentication (Telegram Login / Telegram OAuth) SDK** for
Node.js, Express, and Next.js — by [Bondify](https://bondify.dev). Verify
signed proof JWTs, validate webhook signatures, and protect your routes,
without touching crypto yourself.

- Verify the `proof` JWT issued by Bondify after a successful login
- Verify Bondify webhook signatures (HMAC SHA-256, constant-time compare)
- Drop-in Express middleware (`requireAuth`)
- Next.js App Router helpers (Route Handlers, Server Components)
- Fully typed, zero required runtime dependencies besides `jsonwebtoken`

---

## Installation

```bash
npm install @bondify/node
```

> **Before you start:** open your [Bondify dashboard](https://docs.bondify.dev),
> open your project's **Settings**, and copy the **Webhook Secret** (`whsec_…`).
> That secret is what signs the `proof` JWT and the webhook payloads — it's the
> only thing this SDK needs to verify them.

## Quick start

```ts
import { BondifyServer } from '@bondify/node';

const bondify = new BondifyServer({
  jwtSecret: process.env.BONDIFY_WEBHOOK_SECRET!, // whsec_… from the dashboard
});
```

### Verify a proof JWT

```ts
// Express
app.post('/api/auth/verify', (req, res) => {
  try {
    const user = bondify.verifyProof(req.body.proof);
    res.json({ ok: true, telegramId: user.telegram_id });
  } catch (e) {
    res.status(401).json({ error: (e as Error).message });
  }
});

// Or the non-throwing version — handy in middleware / SSR
const user = bondify.safeVerifyProof(req.body.proof);
if (!user) return res.status(401).json({ error: 'Unauthorized' });
```

### Express middleware

```ts
import { createBondifyMiddleware } from '@bondify/node/middleware';

const requireAuth = createBondifyMiddleware(bondify);

app.get('/api/profile', requireAuth, (req, res) => {
  res.json({ telegramId: req.bondifyUser!.telegram_id });
});
```

### Webhooks (Express)

```ts
import { createWebhookHandler } from '@bondify/node/webhooks';

app.post(
  '/webhook/bondify',
  express.raw({ type: 'application/json' }), // IMPORTANT: raw body, before this handler
  createWebhookHandler(bondify, {
    onConfirmed: async (event) => {
      await db.users.upsert({ telegramId: event.telegram_id, name: event.telegram_name });
    },
    onCancelled: (event) => {
      console.log('Cancelled:', event.session_token);
    },
    onError: (err) => console.error('Webhook verification failed:', err.message),
  })
);
```

### Webhooks (Next.js App Router)

```ts
// app/api/webhooks/bondify/route.ts
import { BondifyServer, createNextWebhookHandler } from '@bondify/node';

const bondify = new BondifyServer({ jwtSecret: process.env.BONDIFY_WEBHOOK_SECRET! });

export const POST = createNextWebhookHandler(bondify, {
  onConfirmed: async (event) => {
    await saveUser(event.telegram_id, event.telegram_name);
  },
});
```

### Protecting a Next.js Route Handler

```ts
// app/api/profile/route.ts
import { BondifyServer } from '@bondify/node';
import { verifyNextRequest } from '@bondify/node/middleware';

const bondify = new BondifyServer({ jwtSecret: process.env.BONDIFY_WEBHOOK_SECRET! });

export async function GET(request: Request) {
  const user = verifyNextRequest(bondify, request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ telegramId: user.telegram_id });
}
```

---

## API reference

### `new BondifyServer(config)`

| Option          | Type     | Required | Description                                                   |
| ---------------- | -------- | -------- | --------------------------------------------------------------- |
| `jwtSecret`       | `string` | yes      | Project webhook secret (`whsec_…`) — verifies the proof JWT.    |
| `webhookSecret`   | `string` | no       | Defaults to `jwtSecret` if omitted (same secret).                |
| `apiUrl`          | `string` | no       | Bondify API base URL. Defaults to `https://api.bondify.dev`.    |

### `bondify.verifyProof(proof: string)`

Verifies the JWT and returns `BondifyProofPayload`. Throws `BondifyVerificationError`
on failure (`TOKEN_EXPIRED`, `INVALID_SIGNATURE`, `INVALID_TOKEN`, `MISSING_FIELDS`).

### `bondify.safeVerifyProof(proof: string)`

Same as above, returns `null` instead of throwing.

### `bondify.verifyWebhook(payload, signature)`

Verifies an incoming webhook's HMAC SHA-256 signature and returns the parsed
`WebhookEvent`. Throws `BondifyWebhookError` on failure.

### `bondify.safeVerifyWebhook(payload, signature)`

Same as above, returns `null` instead of throwing.

### `createBondifyMiddleware(server, options?)`

Express middleware factory. Reads the proof from `Authorization: Bearer …` or
a cookie (default name: `bondify_proof`), verifies it, and attaches the
result to `req.bondifyUser`.

### `verifyNextRequest(server, request, cookieName?)`

Same idea for Next.js App Router Route Handlers, where `request.headers` is a
Web API `Headers` object rather than a plain object.

### `createWebhookHandler(server, handlers)` / `createNextWebhookHandler(server, handlers)`

Wraps signature verification + event dispatch for Express and Next.js
respectively. `handlers` accepts `onConfirmed`, `onCancelled`, `onError`.

### `BondifyAdminClient`

A typed client for the Bondify Developer API (projects, sessions, analytics).
See [`src/utils/admin-client.ts`](./src/utils/admin-client.ts) for the full
method list — most apps won't need this; it's for dashboards/tooling built on
top of Bondify itself.

---

## Error codes

| Code                 | Where                   | Meaning                                    |
| --------------------- | ------------------------ | ------------------------------------------- |
| `TOKEN_EXPIRED`        | `verifyProof`            | Proof JWT expired (5 min lifetime).          |
| `INVALID_SIGNATURE`    | `verifyProof` / webhook  | Signature doesn't match the secret.          |
| `INVALID_TOKEN`        | `verifyProof`            | Malformed or unparseable JWT.                |
| `MISSING_FIELDS`       | `verifyProof`            | JWT is valid but missing required claims.    |
| `MISSING_SIGNATURE`    | `verifyWebhook`          | `X-Bondify-Signature` header not present.    |
| `PARSE_ERROR`          | `verifyWebhook`          | Body isn't valid JSON after verification.    |

---

## Requirements

- Node.js `>=18`
- Express `>=4` (optional — only needed for the Express middleware/webhook helpers)

## Related packages

- [`@bondify/react`](https://github.com/bondify-dev/bondify-react) — React & Next.js client SDK
- [`bondify_flutter`](https://github.com/bondify-dev/bondify-flutter) — Flutter SDK

## Why Bondify?

If you're searching for *"Telegram login for Node.js"*, *"how to verify
Telegram auth on the backend"*, or *"Telegram OAuth alternative"* — this is
the server-side half of that. Bondify replaces the classic Telegram Login
Widget flow with a QR/deeplink + webhook flow, and this SDK is what verifies
it on your server (Express or Next.js), no manual HMAC code needed.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT © Bondify
