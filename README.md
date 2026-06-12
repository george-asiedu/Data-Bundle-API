# Infinity Data Mall — API

The backend for **Infinity Data Mall**, a platform where agents resell mobile
data bundles to customers. It handles authentication, agent onboarding,
wallets and payments (via Paystack), subscriptions, media uploads and audit
logging.

Built with [NestJS](https://nestjs.com/), PostgreSQL (TypeORM) and TypeScript.

## Features

- **Authentication & sessions** — email/password registration with email
  verification, email-OTP MFA, backup-code login, and Google OAuth. Sessions
  use short-lived access tokens (Bearer) plus rotating refresh tokens stored as
  httpOnly cookies, with refresh-token reuse detection.
- **Agents & roles** — `AGENT`, `SUB_AGENT`, `CUSTOMER` and `SUPER_ADMIN`
  roles, with sub-agent payment splitting routed to a parent agent.
- **Payments (Paystack)** — registration-fee and top-up flows, transaction
  verification, webhooks, wallet balances, bank/MoMo resolution, and agent
  settlement subaccounts.
- **Subscriptions** — plan activation and lifecycle (trial, active, past-due,
  expired, canceled).
- **Uploads** — profile/business media stored on AWS S3 with CloudFront
  delivery and Lambda-based cache invalidation.
- **Audit logging** — records sensitive actions with a configurable retention
  window.
- **Email** — transactional email through SendGrid.

## Tech stack

| Concern       | Choice                                 |
| ------------- | -------------------------------------- |
| Framework     | NestJS 11                              |
| Database      | PostgreSQL via TypeORM                 |
| Auth          | JWT (encrypted), Passport Google OAuth |
| Payments      | Paystack                               |
| Storage / CDN | AWS S3, CloudFront, Lambda             |
| Email         | SendGrid                               |
| API docs      | Swagger (`/api-docs`)                  |

## Getting started

### Prerequisites

- Node.js 20+
- A PostgreSQL database
- Paystack, SendGrid, Google OAuth and AWS credentials

### Setup

```bash
npm install
cp .env.example .env   # then fill in the values below
npm run start:dev
```

The API is served under the `/api` prefix (e.g. `http://localhost:5050/api`)
and interactive docs are available at `/api-docs`.

### Environment variables

| Variable | Description |
| --- | --- |
| `NODE_ENV` | `development`, `staging` or `production` |
| `PORT` | Port to listen on (defaults to `5050`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing secret |
| `BUFFER_KEY` | Hex key used to encrypt tokens at rest/in transit |
| `FRONTEND_LOCAL_URL` / `FRONTEND_SERVER_URL` | SPA origins for redirects/links |
| `LOCAL_SERVER_URL` / `LIVE_SERVER_URL` | API base URLs (Swagger servers) |
| `PAYSTACK_SECRET_KEY` | Paystack secret key |
| `PAYSTACK_BASE_URL` | Paystack API base (defaults to `https://paystack.co`) |
| `PAYSTACK_TIMEOUT_MS` | Paystack request timeout in ms (defaults to `15000`) |
| `PLATFORM_DEFAULT_VENDOR_API_KEY` | Default upstream vendor API key |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `GOOGLE_CALLBACK_LOCAL_URL` / `GOOGLE_CALLBACK_SERVER_URL` | OAuth callback URLs |
| `OAUTH_SUCCESS_REDIRECT` / `OAUTH_FAILURE_REDIRECT` | SPA routes after OAuth |
| `SENDGRID_API_KEY` / `SENDER_EMAIL` / `SENDGRID_NAME` | SendGrid email config |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `AWS_S3_BUCKET` / `AWS_S3_ENDPOINT` | S3 storage |
| `AWS_CLOUDFRONT_URL` / `AWS_CLOUDFRONT_DISTRIBUTION_ID` / `AWS_INVALIDATION_LAMBDA_NAME` | CDN delivery & invalidation |
| `RETENTION_DAYS` | Audit-log retention window |

## Scripts

```bash
npm run start:dev     # watch mode
npm run start:prod    # run the compiled build (dist/main)
npm run build         # compile
npm run lint          # eslint --fix
npm run format        # prettier
npm run test          # unit tests
npm run test:e2e      # e2e tests
```

## Authentication flow

1. **Register** → verify email → pay the registration fee (Paystack) → account
   becomes `ACTIVE`.
2. **Login** → email-OTP MFA → on success the client receives an access token
   in the body and a refresh token as an httpOnly cookie.
3. **Google OAuth** → the callback redirects to the SPA with a single-use
   `code`; the SPA exchanges it at `POST /auth/oauth/exchange` for tokens
   (keeping tokens out of the URL).
4. **Refresh** → `GET /auth/refresh-token` reads the cookie, rotates the refresh
   token and returns a new access token. Replaying a revoked token revokes the
   whole token family.
5. **Logout** → `POST /auth/logout` revokes the session and clears the cookie.

## Database migrations

In development and staging the schema is auto-synced (`synchronize: true`), so
you normally don't touch migrations there. **Production runs with
`synchronize: false`**, so every production schema change goes through a
reviewed migration.

Migrations are driven by a standalone DataSource at
`src/lib/database/data-source.ts` and live in `src/lib/database/migrations/`.
The `DATABASE_URL` env var selects the target database.

```bash
# create an empty migration to fill in by hand
npm run migration:create src/lib/database/migrations/<Name>

# generate a migration by diffing entities against the connected DB
npm run migration:generate src/lib/database/migrations/<Name>

npm run migration:show     # list applied vs pending
npm run migration:run      # apply pending migrations
npm run migration:revert   # roll back the latest migration
```

### Applying a migration to production

Render does not install devDependencies (`ts-node`), so run migrations from your
machine with `DATABASE_URL` pointed at the production database:

```bash
DATABASE_URL="<prod-postgres-url>" npm run migration:run
```

Only run migrations against the production DB (the one with
`synchronize: false`). Running them against a dev/staging DB whose tables were
already created by sync will fail with "table already exists". The first run
also creates the `migrations` bookkeeping table automatically.

## License

UNLICENSED — private project.