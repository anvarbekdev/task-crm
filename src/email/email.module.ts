import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { EmailController } from './email.controller';
import { EmailProcessingService } from './email-processing.service';
import { EmailProcessor } from './email.processor';
import { EmailService, EMAIL_PROCESSING_QUEUE } from './email.service';
import { AnthropicClassifierService } from './llm/anthropic-classifier.service';
import { LLM_CLASSIFIER } from './llm/llm-classifier.interface';
import { MockClassifierService } from './llm/mock-classifier.service';
import { InboundEmail, InboundEmailSchema } from './schemas/inbound-email.schema';
import { WebhookSignatureGuard } from './webhook-signature.guard';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: InboundEmail.name, schema: InboundEmailSchema }]),
    BullModule.registerQueueAsync({
      name: EMAIL_PROCESSING_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    UsersModule,
    TasksModule,
  ],
  controllers: [EmailController],
  providers: [
    EmailService,
    EmailProcessingService,
    EmailProcessor,
    WebhookSignatureGuard,
    {
      provide: LLM_CLASSIFIER,
      inject: [ConfigService, AnthropicClassifierService, MockClassifierService],
      useFactory: (
        config: ConfigService,
        anthropic: AnthropicClassifierService,
        mock: MockClassifierService,
      ) => (config.get<string>('llm.provider') === 'anthropic' ? anthropic : mock),
    },
    AnthropicClassifierService,
    MockClassifierService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
