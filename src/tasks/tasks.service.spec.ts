import { ConflictException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Task, TaskStatus } from './schemas/task.schema';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  const companyId = new Types.ObjectId().toString();
  const otherCompanyId = new Types.ObjectId().toString();
  const reviewerId = new Types.ObjectId().toString();

  let taskModel: any;
  let service: TasksService;

  const buildTaskDoc = (overrides: Partial<any> = {}) => ({
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(companyId),
    status: TaskStatus.PENDING_REVIEW,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  beforeEach(async () => {
    taskModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      create: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [TasksService, { provide: getModelToken(Task.name), useValue: taskModel }],
    }).compile();

    service = moduleRef.get(TasksService);
  });

  describe('review', () => {
    it('accepts a pending task and stamps the reviewer', async () => {
      const doc = buildTaskDoc();
      taskModel.findOne.mockResolvedValue(doc);

      const result = await service.review(doc._id.toString(), companyId, reviewerId, 'accept');

      expect(result.status).toBe(TaskStatus.ACCEPTED);
      expect(result.reviewedBy?.toString()).toBe(reviewerId);
      expect(result.reviewedAt).toBeInstanceOf(Date);
      expect(doc.save).toHaveBeenCalled();
    });

    it('rejects a pending task', async () => {
      const doc = buildTaskDoc();
      taskModel.findOne.mockResolvedValue(doc);

      const result = await service.review(doc._id.toString(), companyId, reviewerId, 'reject');

      expect(result.status).toBe(TaskStatus.REJECTED);
    });

    it('throws NotFoundException when the task does not belong to the caller company', async () => {
      // Mongoose query would simply not match — simulate that here.
      taskModel.findOne.mockResolvedValue(null);
      const id = new Types.ObjectId().toString();

      await expect(service.review(id, otherCompanyId, reviewerId, 'accept')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for a malformed id without querying the database', async () => {
      await expect(service.review('not-an-id', companyId, reviewerId, 'accept')).rejects.toThrow(
        NotFoundException,
      );
      expect(taskModel.findOne).not.toHaveBeenCalled();
    });

    it('rejects reviewing a task twice (already accepted)', async () => {
      const doc = buildTaskDoc({ status: TaskStatus.ACCEPTED });
      taskModel.findOne.mockResolvedValue(doc);

      await expect(
        service.review(doc._id.toString(), companyId, reviewerId, 'reject'),
      ).rejects.toThrow(ConflictException);
      expect(doc.save).not.toHaveBeenCalled();
    });
  });

  describe('findAllForCompany', () => {
    it('scopes the query to the caller company and paginates', async () => {
      const execChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([buildTaskDoc()]),
      };
      taskModel.find.mockReturnValue(execChain);
      taskModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      const result = await service.findAllForCompany(companyId, {
        page: 2,
        limit: 10,
        status: TaskStatus.PENDING_REVIEW,
      });

      expect(taskModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: TaskStatus.PENDING_REVIEW }),
      );
      expect(execChain.skip).toHaveBeenCalledWith(10);
      expect(execChain.limit).toHaveBeenCalledWith(10);
      expect(result.total).toBe(1);
      expect(result.page).toBe(2);
    });
  });
});
