import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InboundEmailDocument = HydratedDocument<InboundEmail>;

export enum InboundEmailStatus {
  RECEIVED = 'received',
  PROCESSING = 'processing',
  TASK_CREATED = 'task_created',
  IGNORED_NOT_ACTIONABLE = 'ignored_not_actionable',
  IGNORED_NO_TENANT_MATCH = 'ignored_no_tenant_match',
  ERROR = 'error',
}

@Schema({ _id: false })
export class EmailClassification {
  @Prop({ required: true })
  isActionable: boolean;

  @Prop()
  title?: string;

  @Prop()
  description?: string;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ lowercase: true, trim: true })
  assigneeEmail?: string;

  @Prop()
  model?: string;

  @Prop()
  latencyMs?: number;
}

const EmailClassificationSchema = SchemaFactory.createForClass(EmailClassification);

@Schema({ timestamps: true })
export class InboundEmail {
  @Prop({ required: true })
  provider: string;

  /**
   * The provider's own message id. Unique so a redelivered webhook (at-least
   * -once delivery is standard for email providers) is a no-op, not a
   * duplicate task.
   */
  @Prop({ required: true, unique: true, index: true })
  providerMessageId: string;

  @Prop({ type: Types.ObjectId, ref: 'Company', index: true })
  companyId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  matchedUserId?: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  from: string;

  @Prop({ type: [String], required: true })
  to: string[];

  @Prop({ default: '' })
  subject: string;

  @Prop({ default: '' })
  bodyText: string;

  @Prop({ type: Date, required: true })
  receivedAt: Date;

  @Prop({ type: String, enum: InboundEmailStatus, default: InboundEmailStatus.RECEIVED })
  status: InboundEmailStatus;

  @Prop()
  errorMessage?: string;

  @Prop({ type: Types.ObjectId, ref: 'Task' })
  taskId?: Types.ObjectId;

  @Prop({ type: EmailClassificationSchema })
  classification?: EmailClassification;
}

export const InboundEmailSchema = SchemaFactory.createForClass(InboundEmail);
