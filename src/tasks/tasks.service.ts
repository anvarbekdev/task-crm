import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { Task, TaskDocument, TaskStatus } from './schemas/task.schema';

export interface CreateTaskInput {
  companyId: Types.ObjectId;
  title: string;
  description: string;
  dueDate?: Date;
  assigneeEmail?: string;
  assigneeUserId?: Types.ObjectId;
  sourceEmailId: Types.ObjectId;
  llmModel?: string;
}

@Injectable()
export class TasksService {
  constructor(@InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>) {}

  async create(input: CreateTaskInput) {
    return this.taskModel.create({ ...input, source: 'email' });
  }

  async findAllForCompany(companyId: string, query: QueryTasksDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { companyId: new Types.ObjectId(companyId) };
    if (query.status) {
      filter.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.taskModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.taskModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private async findOwnedByCompanyOrThrow(taskId: string, companyId: string) {
    if (!Types.ObjectId.isValid(taskId)) {
      throw new NotFoundException('Task not found');
    }
    const task = await this.taskModel.findOne({
      _id: taskId,
      companyId: new Types.ObjectId(companyId),
    });
    if (!task) {
      // Same response whether the id doesn't exist or belongs to another
      // tenant — never confirm cross-tenant existence.
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async review(
    taskId: string,
    companyId: string,
    reviewerUserId: string,
    decision: 'accept' | 'reject',
  ) {
    const task = await this.findOwnedByCompanyOrThrow(taskId, companyId);

    if (task.status !== TaskStatus.PENDING_REVIEW) {
      throw new ConflictException(
        `Task has already been reviewed (status: ${task.status})`,
      );
    }

    task.status = decision === 'accept' ? TaskStatus.ACCEPTED : TaskStatus.REJECTED;
    task.reviewedAt = new Date();
    task.reviewedBy = new Types.ObjectId(reviewerUserId);
    await task.save();
    return task;
  }
}
