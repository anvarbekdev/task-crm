export interface AppConfig {
  port: number;
  mongoUri: string;
  redis: { host: string; port: number };
  jwt: { secret: string; expiresIn: string };
  emailWebhookSecret: string;
  llm: {
    provider: 'anthropic' | 'mock';
    anthropicApiKey?: string;
    model: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/email-to-task-crm',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  emailWebhookSecret: process.env.EMAIL_WEBHOOK_SECRET ?? '',
  llm: {
    provider: (process.env.LLM_PROVIDER as 'anthropic' | 'mock') ?? 'mock',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
  },
});
