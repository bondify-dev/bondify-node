# Contributing to @bondify/node

Thanks for taking the time to contribute!

## Setup

```bash
git clone https://github.com/bondify-dev/bondify-node.git
cd bondify-node
npm install
```

## Development

```bash
npm run dev        # tsup --watch
npm run typecheck   # tsc --noEmit
npm run build       # production build → dist/
```

## Before opening a PR

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run build` succeeds
- [ ] No `console.log` left over from debugging
- [ ] Public API changes are reflected in `README.md`
- [ ] Breaking changes are called out in `CHANGELOG.md`

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) where
practical (`feat:`, `fix:`, `docs:`, `chore:`, …) — it makes the changelog
easier to generate and review.

## Reporting security issues

Please **do not** open a public issue for security vulnerabilities. Email
security@bondify.dev instead.

## Code style

- TypeScript, strict mode — keep it that way.
- No new runtime dependencies without discussion (this SDK aims to stay
  small: `jsonwebtoken` is the only one).
- Prefer the built-in `fetch` over adding an HTTP client dependency.
