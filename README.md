# Email-to-Task CRM feature

Turns inbound emails into reviewable Tasks in a multi-tenant CRM. NestJS + Mongoose + Bull.

See [DESIGN.md](./DESIGN.md) for what was built/cut/traded off, and [THREATS.md](./THREATS.md) for the abuse/failure analysis.

## Running it

```bash
cp .env.example .env
docker compose up -d        # mongo + redis
npm install
npm run seed                # creates a demo company + two users
npm run start:dev
```

In another terminal, log in and simulate an inbound email:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@acme-demo.com","password":"password123"}'
# -> { "accessToken": "..." }

npm run simulate:email                      # actionable example -> creates a Task
npm run simulate:email -- --kind=spam       # non-actionable example -> no Task
npm run simulate:email -- --kind=assign     # actionable, assigns to carol@acme-demo.com

curl http://localhost:3000/tasks?status=pending_review \
  -H "Authorization: Bearer <accessToken>"

curl -X POST http://localhost:3000/tasks/<id>/review \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"decision":"accept"}'
```

Interactive API docs (Swagger UI) are served at `http://localhost:3000/docs`
once the server is running — use "Authorize" with the JWT from `/auth/login`
to try the tenant-scoped endpoints from the browser.

By default `LLM_PROVIDER=mock`, so no Anthropic API key is required to run the
full pipeline — a deterministic keyword classifier stands in for the LLM call
(see [DESIGN.md](./DESIGN.md)). Set `LLM_PROVIDER=anthropic` and
`ANTHROPIC_API_KEY=...` in `.env` to use the real Claude API.

## Tests

```bash
npm test
```

## Webhook payload contract

The prompt says a fake email-provider POSTs JSON to the webhook but doesn't
define the shape, so this is the contract this implementation assumes and
that `scripts/simulate-email-provider.ts` produces:

```json
{
  "provider": "fake-mail",
  "messageId": "unique-id-from-provider",
  "from": "alice@customer.com",
  "to": ["bob@acmeco.com"],
  "subject": "Can you send the invoice by Friday?",
  "text": "Hi Bob, ...",
  "receivedAt": "2026-07-20T10:00:00.000Z"
}
```

`POST /webhooks/email` requires an `X-Webhook-Signature: sha256=<hex hmac>`
header, computed over the raw request body using `EMAIL_WEBHOOK_SECRET`
(see THREATS.md for why).

## API summary

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /auth/register` | none | creates a company + its first (admin) user; demo convenience, see DESIGN.md |
| `POST /auth/login` | none | returns a JWT |
| `POST /webhooks/email` | HMAC signature | inbound email webhook |
| `GET /tasks?status=&page=&limit=` | JWT | tenant-scoped, paginated |
| `POST /tasks/:id/review` | JWT | `{"decision":"accept"\|"reject"}` |
| `GET /docs` | none | Swagger UI (OpenAPI docs + "try it out") |
