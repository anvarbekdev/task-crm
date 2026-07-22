import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { EmailProcessingService } from './email-processing.service';
import { LLM_CLASSIFIER } from './llm/llm-classifier.interface';
import { InboundEmail, InboundEmailStatus } from './schemas/inbound-email.schema';

describe('EmailProcessingService', () => {
  let inboundEmailModel: any;
  let usersService: jest.Mocked<Pick<UsersService, 'findByEmailAddress'>>;
  let tasksService: jest.Mocked<Pick<TasksService, 'create'>>;
  let classifier: { classify: jest.Mock };
  let service: EmailProcessingService;

  const companyId = new Types.ObjectId();
  const otherCompanyId = new Types.ObjectId();
  const recipientUserId = new Types.ObjectId();

  const buildEmailDoc = (overrides: Partial<any> = {}): any => ({
    _id: new Types.ObjectId(),
    providerMessageId: 'msg-1',
    from: 'alice@customer.com',
    to: ['bob@acme.com'],
    subject: 'Please send the invoice',
    bodyText: 'Can you send the Q3 invoice by 2026-08-01?',
    status: InboundEmailStatus.RECEIVED,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  beforeEach(async () => {
    inboundEmailModel = { findById: jest.fn() };
    usersService = { findByEmailAddress: jest.fn() };
    tasksService = { create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) };
    classifier = { classify: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailProcessingService,
        { provide: getModelToken(InboundEmail.name), useValue: inboundEmailModel },
        { provide: UsersService, useValue: usersService },
        { provide: TasksService, useValue: tasksService },
        { provide: LLM_CLASSIFIER, useValue: classifier },
      ],
    }).compile();

    service = moduleRef.get(EmailProcessingService);
  });

  it('marks the email IGNORED_NO_TENANT_MATCH when no recipient matches a known user', async () => {
    const email = buildEmailDoc();
    inboundEmailModel.findById.mockResolvedValue(email);
    usersService.findByEmailAddress.mockResolvedValue(null);

    await service.process(email._id.toString());

    expect(email.status).toBe(InboundEmailStatus.IGNORED_NO_TENANT_MATCH);
    expect(classifier.classify).not.toHaveBeenCalled();
    expect(tasksService.create).not.toHaveBeenCalled();
  });

  it('creates a task when the classifier says the email is actionable', async () => {
    const email = buildEmailDoc();
    inboundEmailModel.findById.mockResolvedValue(email);
    usersService.findByEmailAddress.mockResolvedValue({
      _id: recipientUserId,
      companyId,
    } as any);
    classifier.classify.mockResolvedValue({
      isActionable: true,
      title: 'Send Q3 invoice',
      description: 'Alice asked for the Q3 invoice.',
      dueDate: '2026-08-01',
      assigneeEmail: null,
      model: 'mock',
      latencyMs: 5,
    });

    await service.process(email._id.toString());

    expect(tasksService.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId, title: 'Send Q3 invoice' }),
    );
    expect(email.status).toBe(InboundEmailStatus.TASK_CREATED);
    expect(email.taskId).toBeDefined();
  });

  it('does not create a task when the classifier says the email is not actionable', async () => {
    const email = buildEmailDoc();
    inboundEmailModel.findById.mockResolvedValue(email);
    usersService.findByEmailAddress.mockResolvedValue({ _id: recipientUserId, companyId } as any);
    classifier.classify.mockResolvedValue({
      isActionable: false,
      title: 'Newsletter',
      description: 'Marketing email',
      dueDate: null,
      assigneeEmail: null,
      model: 'mock',
      latencyMs: 5,
    });

    await service.process(email._id.toString());

    expect(tasksService.create).not.toHaveBeenCalled();
    expect(email.status).toBe(InboundEmailStatus.IGNORED_NOT_ACTIONABLE);
  });

  it('ignores an LLM-suggested assignee who belongs to a different company', async () => {
    const email = buildEmailDoc();
    inboundEmailModel.findById.mockResolvedValue(email);
    usersService.findByEmailAddress.mockImplementation(async (address: string) => {
      if (address === 'bob@acme.com') return { _id: recipientUserId, companyId } as any;
      if (address === 'someone@othercompany.com') {
        return { _id: new Types.ObjectId(), companyId: otherCompanyId } as any;
      }
      return null;
    });
    classifier.classify.mockResolvedValue({
      isActionable: true,
      title: 'Do the thing',
      description: 'desc',
      dueDate: null,
      assigneeEmail: 'someone@othercompany.com',
      model: 'mock',
      latencyMs: 5,
    });

    await service.process(email._id.toString());

    expect(tasksService.create).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeUserId: undefined }),
    );
  });

  it('marks the email ERROR and rethrows when the classifier fails', async () => {
    const email = buildEmailDoc();
    inboundEmailModel.findById.mockResolvedValue(email);
    usersService.findByEmailAddress.mockResolvedValue({ _id: recipientUserId, companyId } as any);
    classifier.classify.mockRejectedValue(new Error('LLM timed out'));

    await expect(service.process(email._id.toString())).rejects.toThrow('LLM timed out');

    expect(email.status).toBe(InboundEmailStatus.ERROR);
    expect(email.errorMessage).toContain('LLM timed out');
  });

  it('skips reprocessing an email that already reached a terminal status', async () => {
    const email = buildEmailDoc({ status: InboundEmailStatus.TASK_CREATED });
    inboundEmailModel.findById.mockResolvedValue(email);

    await service.process(email._id.toString());

    expect(usersService.findByEmailAddress).not.toHaveBeenCalled();
    expect(classifier.classify).not.toHaveBeenCalled();
  });
});
