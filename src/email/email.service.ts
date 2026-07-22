import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bull';
import { Model } from 'mongoose';
import { InboundEmailDto } from './dto/inbound-email.dto';
import { InboundEmail, InboundEmailDocument } from './schemas/inbound-email.schema';

export const EMAIL_PROCESSING_QUEUE = 'email-processing';
export const CLASSIFY_JOB = 'classify';

export interface ClassifyJobPayload {
  inboundEmailId: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectModel(InboundEmail.name) private readonly inboundEmailModel: Model<InboundEmailDocument>,
    @InjectQueue(EMAIL_PROCESSING_QUEUE) private readonly queue: Queue<ClassifyJobPayload>,
  ) {}

  /**
   * Persists the inbound webhook payload and enqueues it for classification.
   * The unique index on providerMessageId is the idempotency boundary: email
   * providers deliver at-least-once, so a redelivered webhook must be a
   * cheap no-op rather than a duplicate task.
   */
  async ingest(dto: InboundEmailDto) {
    let email: InboundEmailDocument;
    try {
      email = await this.inboundEmailModel.create({
        provider: dto.provider,
        providerMessageId: dto.messageId,
        from: dto.from,
        to: dto.to,
        subject: dto.subject ?? '',
        bodyText: dto.text ?? '',
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        this.logger.log(`Duplicate delivery for messageId=${dto.messageId}, ignoring`);
        const existing = await this.inboundEmailModel.findOne({ providerMessageId: dto.messageId });
        return { id: existing?._id.toString(), status: existing?.status, duplicate: true };
      }
      throw err;
    }

    await this.queue.add(
      CLASSIFY_JOB,
      { inboundEmailId: email._id.toString() },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    );

    return { id: email._id.toString(), status: email.status, duplicate: false };
  }
}
