import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  ClassificationResult,
  EmailForClassification,
  LlmClassifier,
} from './llm-classifier.interface';

const SYSTEM_PROMPT = `You triage inbound emails for a CRM's task inbox. Given one email, decide whether it represents an actionable task for the recipient — something a person needs to *do* (a request, a commitment, a deadline) as opposed to a notification, newsletter, receipt, spam, or purely informational message.

If it is actionable, extract:
- title: a short (<=80 char) imperative summary of the task
- description: 1-3 sentences of context pulled from the email, enough for someone to act without re-reading it
- dueDate: an ISO 8601 date (YYYY-MM-DD) if the email states or clearly implies one, else null. Do not guess a date that isn't grounded in the email text.
- assigneeEmail: the email address of the person who should do the work, if the email names one, else null. Only use an address that actually appears in the email.

If it is not actionable, still return the object but set isActionable to false; title/description may be brief.

Be conservative: automated notifications, marketing, receipts, out-of-office replies, and FYI-only threads are not actionable even if they contain a date.`;

const RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    isActionable: { type: 'boolean' },
    title: { type: 'string' },
    description: { type: 'string' },
    dueDate: {
      anyOf: [{ type: 'string', description: 'ISO 8601 date, e.g. 2026-08-01' }, { type: 'null' }],
    },
    assigneeEmail: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
  },
  required: ['isActionable', 'title', 'description', 'dueDate', 'assigneeEmail'],
  additionalProperties: false,
};

const REQUEST_TIMEOUT_MS = 20_000;

@Injectable()
export class AnthropicClassifierService implements LlmClassifier {
  private readonly logger = new Logger(AnthropicClassifierService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: this.config.get<string>('llm.anthropicApiKey') });
    this.model = this.config.get<string>('llm.model') as string;
  }

  async classify(email: EmailForClassification): Promise<ClassificationResult> {
    const start = Date.now();

    const userContent = [
      `From: ${email.from}`,
      `To: ${email.to.join(', ')}`,
      `Subject: ${email.subject}`,
      '',
      email.bodyText,
    ].join('\n');

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        output_config: {
          format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
        },
        messages: [{ role: 'user', content: userContent }],
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    if (response.stop_reason === 'refusal') {
      throw new Error('Classifier refused to process this email (safety policy)');
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    if (!textBlock) {
      throw new Error(`Classifier returned no text content (stop_reason=${response.stop_reason})`);
    }

    let parsed: {
      isActionable: boolean;
      title: string;
      description: string;
      dueDate: string | null;
      assigneeEmail: string | null;
    };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch (err) {
      throw new Error(`Classifier returned invalid JSON: ${(err as Error).message}`);
    }

    const latencyMs = Date.now() - start;
    this.logger.debug(
      `classified "${email.subject}" -> actionable=${parsed.isActionable} (${latencyMs}ms, model=${this.model})`,
    );

    return { ...parsed, model: this.model, latencyMs };
  }
}
