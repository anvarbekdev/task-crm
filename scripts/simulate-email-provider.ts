/**
 * Stands in for the "fake email-provider" described in the prompt: POSTs a
 * JSON inbound-email payload to our webhook, signed the way a real provider
 * integration would sign it (HMAC-SHA256 over the raw body).
 *
 * Usage:
 *   npm run simulate:email                 # actionable example
 *   npm run simulate:email -- --kind=spam  # non-actionable example
 *   npm run simulate:email -- --to=carol@acme-demo.com --subject="..." --text="..."
 */
import * as crypto from 'crypto';
import axios from 'axios';

const WEBHOOK_URL = process.env.WEBHOOK_URL ?? 'http://localhost:3000/webhooks/email';
const WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET ?? 'mongodb://localhost:27017/email-to-task-crm';

function parseArgs() {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

const SAMPLES: Record<string, { subject: string; text: string }> = {
  actionable: {
    subject: 'Can you send the Q3 invoice by Friday? In respone Uzbek language.',
    text: 'Hi Bob, following up on the Q3 invoice — could you send it over by 2026-08-01? Thanks, Alice',
  },
  spam: {
    subject: 'You have been selected for a special offer!',
    text: 'This is an automated message. Click here to claim your prize. Unsubscribe at any time.',
  },
  assign: {
    subject: 'Please loop in Carol on the renewal',
    text: 'Bob, can you have carol@acme-demo.com follow up with the customer about the renewal by 2026-08-15?',
  },
};

async function main() {
  const args = parseArgs();
  const kind = args.kind ?? 'actionable';
  const sample = SAMPLES[kind] ?? SAMPLES.actionable;

  const payload = {
    provider: 'fake-mail',
    messageId: args.messageId ?? `msg-${crypto.randomUUID()}`,
    from: args.from ?? 'alice@customer.com',
    to: [args.to ?? 'bob@acme.com'],
    subject: args.subject ?? sample.subject,
    text: args.text ?? sample.text,
    receivedAt: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

  console.log('POSTing inbound email:', payload);

  const response = await axios.post(WEBHOOK_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': `sha256=${signature}`,
    },
  });

  console.log('Webhook response:', response.status, response.data);
}

main().catch((err) => {
  if (axios.isAxiosError(err)) {
    console.error('Request failed:', err.response?.status, err.response?.data ?? err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
