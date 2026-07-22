import { Injectable, Logger } from '@nestjs/common';
import {
  ClassificationResult,
  EmailForClassification,
  LlmClassifier,
} from './llm-classifier.interface';

const ACTION_KEYWORDS = [
  'please',
  'can you',
  'could you',
  'need',
  'asap',
  'deadline',
  'due',
  'action required',
  'follow up',
  'follow-up',
  'todo',
  'to-do',
  'reminder',
  'by friday',
  'by monday',
  'urgent',
  'invoice',
  'schedule',
];

const NON_ACTIONABLE_KEYWORDS = [
  'unsubscribe',
  'no-reply',
  'noreply',
  'newsletter',
  'this is an automated message',
  'out of office',
];

const DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2})\b/;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Deterministic, keyword-based stand-in for the real LLM classifier. Used
 * when LLM_PROVIDER=mock (default) so the feature runs end-to-end without an
 * ANTHROPIC_API_KEY, and in unit tests where a live model call would be
 * slow/non-deterministic/costly. See DESIGN.md for the tradeoff.
 */
@Injectable()
export class MockClassifierService implements LlmClassifier {
  private readonly logger = new Logger(MockClassifierService.name);

  async classify(email: EmailForClassification): Promise<ClassificationResult> {
    const start = Date.now();
    const haystack = `${email.subject}\n${email.bodyText}`.toLowerCase();

    const hasActionSignal = ACTION_KEYWORDS.some((kw) => haystack.includes(kw));
    const hasNonActionSignal = NON_ACTIONABLE_KEYWORDS.some((kw) => haystack.includes(kw));
    const isActionable = hasActionSignal && !hasNonActionSignal;

    const dateMatch = haystack.match(DATE_PATTERN);
    const assigneeMatch = email.bodyText.match(EMAIL_PATTERN);

    this.logger.debug(`mock-classified "${email.subject}" -> actionable=${isActionable}`);

    return {
      isActionable,
      title: (email.subject || email.bodyText.slice(0, 80)).trim(),
      description: email.bodyText.trim(),
      dueDate: dateMatch ? dateMatch[1] : null,
      assigneeEmail: assigneeMatch ? assigneeMatch[0].toLowerCase() : null,
      model: 'mock-keyword-classifier',
      latencyMs: Date.now() - start,
    };
  }
}
