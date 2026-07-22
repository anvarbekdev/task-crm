import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TaskDocument = HydratedDocument<Task>;

export enum TaskStatus {
  PENDING_REVIEW = 'pending_review',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class Task {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ lowercase: true, trim: true })
  assigneeEmail?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assigneeUserId?: Types.ObjectId;

  @Prop({ type: String, enum: TaskStatus, default: TaskStatus.PENDING_REVIEW, index: true })
  status: TaskStatus;

  @Prop({ default: 'email' })
  source: string;

  @Prop({ type: Types.ObjectId, ref: 'InboundEmail', required: true })
  sourceEmailId: Types.ObjectId;

  @Prop()
  llmModel?: string;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

// Primary access pattern: list a tenant's tasks filtered by status, newest first.
TaskSchema.index({ companyId: 1, status: 1, createdAt: -1 });
