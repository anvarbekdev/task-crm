import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { CLASSIFY_JOB, ClassifyJobPayload, EMAIL_PROCESSING_QUEUE } from './email.service';
import { EmailProcessingService } from './email-processing.service';

@Processor(EMAIL_PROCESSING_QUEUE)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly processingService: EmailProcessingService) {}

  @Process(CLASSIFY_JOB)
  async handleClassify(job: Job<ClassifyJobPayload>) {
    await this.processingService.process(job.data.inboundEmailId);
  }
}
