# DESIGN.md

## What I built

A webhook (`POST /webhooks/email`) ingests inbound-email JSON from the (fake)
provider, persists it as an `InboundEmail` audit record keyed by the
provider's `messageId` (unique index → redelivery is a no-op, not a
duplicate), and enqueues a Bull job. A worker resolves the tenant by matching
each recipient address against `User.emails` (multikey-unique across the
whole system, so an address maps to exactly one company), calls an LLM
classifier, and — if the email is actionable — creates a `Task` scoped to
that company with `status: pending_review`. Non-actionable emails and emails
with no tenant match are recorded (with the reason) but produce no task.

`GET /tasks?status=&page=&limit=` and `POST /tasks/:id/review` are JWT-authed
and scoped to `req.user.companyId` — a task from another company 404s rather
than 403s, so the endpoint doesn't confirm cross-tenant existence. Review is
one-shot: accepting/rejecting an already-reviewed task 409s.

The webhook returns 202 immediately after a synchronous DB write; classification
runs asynchronously via Bull (Redis-backed), so a slow or rate-limited LLM
call never blocks the provider's delivery and gets 3 retries with exponential
backoff before landing in Bull's failed set for manual triage. This is the
one place I used Bull — it directly buys resilience against the failure mode
I was most worried about (LLM latency/rate limits under load).

The LLM call goes through an `LlmClassifier` interface with two
implementations selected by `LLM_PROVIDER`: `anthropic` (real Claude API call
using structured outputs — `output_config.format: json_schema` — so the
response is guaranteed valid JSON, no prompt-and-pray parsing) and `mock` (a
deterministic keyword classifier). Default is `mock` so the whole pipeline
runs and is testable without an API key or network access; the interface
means swapping providers is a one-line config change, not a rewrite.

Auth is JWT (`passport-jwt`), `POST /auth/register` creates a company + its
first user in one call for demo convenience, `POST /auth/login` returns a
token.

## What I cut

- **User provisioning.** A real CRM wouldn't let anyone self-register a new
  company; users would be invited by an admin. I kept `/auth/register` as a
  single combined endpoint purely so the feature is runnable end-to-end
  without a second provisioning system to build. Flagged clearly as a demo
  shortcut, not a design recommendation.
- **Task lifecycle beyond review.** No "done/in-progress/reassign" states —
  only the three the prompt asked for (`pending_review`/`accepted`/`rejected`).
  A real CRM would want a fuller lifecycle; out of scope here.
- **Multi-recipient ambiguity.** If an email's `to` list matches users at two
  different companies, I resolve to whichever address matches first and
  ignore the rest, rather than fanning out one task per matched tenant. Rare
  in practice (companies don't usually share a mailbox), and fanning out
  correctly needs product input on what "the same email is actionable for
  two companies" should even mean.
- **Company/user admin API.** No CRUD for companies or users beyond what
  register/seed need — assumed out of scope for this feature.
- **Real email-provider integration / DKIM-SPF-style provenance.** Since no
  real provider is specified, I invented a JSON contract and secured the
  webhook with a shared-secret HMAC rather than provider-specific signature
  verification (documented in THREATS.md).
- **Rate limiting / global throttling** on the HTTP layer — noted as a gap in
  THREATS.md rather than implemented, given the time budget.

## Tradeoffs

- **Bull over a naive synchronous call.** Slightly more moving parts (Redis,
  a queue, a processor) for meaningfully better resilience under LLM
  failure — worth it given "decide whether actionable" is squarely the kind
  of call that times out or rate-limits under load.
- **Structured outputs over tool-use/regex-parsing.** `output_config.format`
  guarantees schema-valid JSON from Claude, which removes an entire class of
  "LLM almost returned JSON" bugs at zero extra latency versus a plain text
  completion.
- **`claude-opus-4-8` as the default classifier model.** It's the right
  default for correctness during review, but this is a high-volume,
  low-complexity classification task — in a real deployment I'd benchmark
  `claude-haiku-4-5` on a labeled sample of real inbound emails and very
  likely switch, since misclassification cost here (a wrong `pending_review`
  task, reversible with one click) is low relative to per-email LLM cost at
  volume. `ANTHROPIC_MODEL` is already a config knob for this.
- **Task/InboundEmail as separate collections** rather than one document.
  Slightly more joins (`sourceEmailId` reference), but keeps the audit trail
  (raw email, classification, error) intact even if a Task is later edited or
  deleted, and keeps `GET /tasks` queries lean.
- **assigneeEmail is a free-text field, not a resolved foreign key**, unless
  the extracted address matches an existing user *in the same company* (see
  THREATS.md for why the same-company check matters). A CRM would likely want
  to require a resolved assignee before a task is actionable; I left it
  optional per the prompt's spec.

## What I'd do with another week

- **Real provider verification** instead of a shared-secret HMAC — most real
  email-webhook providers (Postmark, SendGrid inbound parse, etc.) ship their
  own signed-webhook scheme; I'd integrate that instead of inventing one.
- **Assignee resolution UI/flow** — right now `assigneeEmail` on a Task is
  informational; I'd add a proper `assigneeUserId` resolution step surfaced
  in the review UI, with a way to manually correct a bad LLM extraction
  before accepting.
- **Bull dashboard / admin endpoint** to inspect the dead-letter queue and
  `InboundEmail` docs stuck in `error`, so a human can requeue a failed
  classification without shell access to Mongo/Redis.
- **Per-company rate limiting and idempotent webhook retries at the HTTP
  layer** (a `429`/backoff contract with the provider), plus structured
  request logging correlated by `providerMessageId` for on-call debugging.
- **Evaluation harness** for the classifier — a small labeled set of
  real-shaped emails (actionable/not, with/without due dates and assignees)
  run against both the mock and Anthropic classifiers on every CI run, so a
  prompt or model change can't silently regress precision/recall.
- **Cost controls** — per-company or global daily token/dollar budget on the
  classifier queue, since an email flood (or an abusive sender) currently has
  no ceiling other than Bull's concurrency.
