import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { LLM_CLASSIFIER, LlmClassifier } from './llm/llm-classifier.interface';
import { InboundEmail, InboundEmailDocument, InboundEmailStatus } from './schemas/inbound-email.schema';

@Injectable()
export class EmailProcessingService {
  private readonly logger = new Logger(EmailProcessingService.name);

  constructor(
    @InjectModel(InboundEmail.name) private readonly inboundEmailModel: Model<InboundEmailDocument>,
    private readonly usersService: UsersService,
    private readonly tasksService: TasksService,
    @Inject(LLM_CLASSIFIER) private readonly classifier: LlmClassifier,
  ) {}

  /**
   * Runs the full pipeline for one inbound email: resolve tenant, classify,
   * and (if actionable) create a Task. Idempotent per document — safe to
   * re-run on Bull retry, since it only reads/writes by _id and re-derives
   * everything from the stored payload.
   */
  async process(inboundEmailId: string): Promise<void> {
    const email = await this.inboundEmailModel.findById(inboundEmailId);
    if (!email) {
      this.logger.warn(`InboundEmail ${inboundEmailId} not found, skipping`);
      return;
    }

    // Already finished (e.g. a stale retry after success) — don't reprocess.
    if (
      [
        InboundEmailStatus.TASK_CREATED,
        InboundEmailStatus.IGNORED_NOT_ACTIONABLE,
        InboundEmailStatus.IGNORED_NO_TENANT_MATCH,
      ].includes(email.status)
    ) {
      return;
    }

    email.status = InboundEmailStatus.PROCESSING;
    await email.save();

    const matchedUser = await this.resolveTenant(email.to);
    if (!matchedUser) {
      email.status = InboundEmailStatus.IGNORED_NO_TENANT_MATCH;
      await email.save();
      this.logger.warn(
        `No user/company matched recipients [${email.to.join(', ')}] for messageId=${email.providerMessageId}`,
      );
      return;
    }

    email.companyId = matchedUser.companyId;
    email.matchedUserId = matchedUser._id as Types.ObjectId;

    try {
      const classification = await this.classifier.classify({
        from: email.from,
        to: email.to,
        subject: email.subject,
        bodyText: email.bodyText,
      });

      email.classification = {
        isActionable: classification.isActionable,
        title: classification.title,
        description: classification.description,
        dueDate: classification.dueDate ? new Date(classification.dueDate) : undefined,
        assigneeEmail: classification.assigneeEmail ?? undefined,
        model: classification.model,
        latencyMs: classification.latencyMs,
      } as any;

      if (!classification.isActionable) {
        email.status = InboundEmailStatus.IGNORED_NOT_ACTIONABLE;
        await email.save();
        return;
      }

      const assigneeUser = classification.assigneeEmail
        ? await this.usersService.findByEmailAddress(classification.assigneeEmail)
        : null;
      // Only trust the assignee if they're in the SAME company as the
      // matched recipient — never let LLM-extracted text assign a task
      // across tenants.
      const assigneeUserId =
        assigneeUser && assigneeUser.companyId.equals(matchedUser.companyId)
          ? (assigneeUser._id as Types.ObjectId)
          : undefined;

      const task = await this.tasksService.create({
        companyId: matchedUser.companyId,
        title: classification.title || email.subject || '(no subject)',
        description: classification.description || email.bodyText,
        dueDate: classification.dueDate ? new Date(classification.dueDate) : undefined,
        assigneeEmail: classification.assigneeEmail ?? undefined,
        assigneeUserId,
        sourceEmailId: email._id as Types.ObjectId,
        llmModel: classification.model,
      });

      email.status = InboundEmailStatus.TASK_CREATED;
      email.taskId = task._id as Types.ObjectId;
      await email.save();
    } catch (err) {
      email.status = InboundEmailStatus.ERROR;
      email.errorMessage = (err as Error).message?.slice(0, 2000);
      await email.save();
      // Rethrow so Bull applies its configured retry/backoff; final
      // exhaustion leaves the job in the failed set and the email in ERROR
      // for manual reprocessing/inspection.
      throw err;
    }
  }

  /**
   * An email can be addressed to multiple recipients; resolve the first
   * `to` address that matches a known user. Ambiguous cross-company
   * addressing (e.g. cc'ing users at two different companies) resolves to
   * whichever user is found first — acceptable for this feature's scope,
   * see DESIGN.md.
   */
  private async resolveTenant(recipients: string[]) {
    for (const address of recipients) {
      const user = await this.usersService.findByEmailAddress(address);
      if (user) {
        return user;
      }
    }
    return null;
  }
}
