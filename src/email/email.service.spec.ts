import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bull';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { EMAIL_PROCESSING_QUEUE, EmailService } from './email.service';
import { InboundEmail } from './schemas/inbound-email.schema';

describe('EmailService', () => {
  let inboundEmailModel: any;
  let queue: { add: jest.Mock };
  let service: EmailService;

  const dto = {
    provider: 'fake-mail',
    messageId: 'msg-123',
    from: 'alice@customer.com',
    to: ['bob@acme.com'],
    subject: 'Hi',
    text: 'Can you send the invoice?',
    receivedAt: '2026-07-20T10:00:00.000Z',
  };

  beforeEach(async () => {
    inboundEmailModel = { create: jest.fn(), findOne: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: getModelToken(InboundEmail.name), useValue: inboundEmailModel },
        { provide: getQueueToken(EMAIL_PROCESSING_QUEUE), useValue: queue },
      ],
    }).compile();

    service = moduleRef.get(EmailService);
  });

  it('persists the email and enqueues a classification job', async () => {
    const id = new Types.ObjectId();
    inboundEmailModel.create.mockResolvedValue({ _id: id, status: 'received' });

    const result = await service.ingest(dto as any);

    expect(inboundEmailModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ providerMessageId: 'msg-123' }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'classify',
      { inboundEmailId: id.toString() },
      expect.objectContaining({ attempts: 3 }),
    );
    expect(result).toEqual({ id: id.toString(), status: 'received', duplicate: false });
  });

  it('treats a duplicate providerMessageId as a no-op instead of re-queueing', async () => {
    const duplicateError = Object.assign(new Error('duplicate key'), { code: 11000 });
    inboundEmailModel.create.mockRejectedValue(duplicateError);
    const existingId = new Types.ObjectId();
    inboundEmailModel.findOne.mockResolvedValue({ _id: existingId, status: 'task_created' });

    const result = await service.ingest(dto as any);

    expect(queue.add).not.toHaveBeenCalled();
    expect(result).toEqual({ id: existingId.toString(), status: 'task_created', duplicate: true });
  });
});
