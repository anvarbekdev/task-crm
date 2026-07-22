export interface EmailForClassification {
  from: string;
  to: string[];
  subject: string;
  bodyText: string;
}

export interface ClassificationResult {
  isActionable: boolean;
  title: string;
  description: string;
  /** ISO 8601 date string, or null if the email doesn't mention one. */
  dueDate: string | null;
  /** Email address of the person the task should be assigned to, if named. */
  assigneeEmail: string | null;
  model: string;
  latencyMs: number;
}

export const LLM_CLASSIFIER = 'LLM_CLASSIFIER';

export interface LlmClassifier {
  classify(email: EmailForClassification): Promise<ClassificationResult>;
}
