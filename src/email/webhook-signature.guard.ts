import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

const SIGNATURE_HEADER = 'x-webhook-signature';

/**
 * Verifies the inbound-email webhook is actually from our configured email
 * provider, not an arbitrary caller forging "an email arrived" events.
 *
 * Expects header `X-Webhook-Signature: sha256=<hex hmac>` computed over the
 * raw request body with EMAIL_WEBHOOK_SECRET. Requires main.ts to enable
 * `rawBody: true` so the exact bytes (not the re-serialized JSON) are
 * available to hash — re-serializing would silently break verification for
 * any payload with non-canonical key order/whitespace.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const secret = this.config.get<string>('emailWebhookSecret');

    if (!secret) {
      this.logger.error('EMAIL_WEBHOOK_SECRET is not configured; rejecting webhook request');
      throw new UnauthorizedException('Webhook is not configured');
    }

    const header = request.headers[SIGNATURE_HEADER];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    if (!request.rawBody) {
      // Should not happen if main.ts is configured correctly; fail closed.
      this.logger.error('Raw body unavailable for signature verification');
      throw new UnauthorizedException('Unable to verify webhook signature');
    }

    const expected = crypto.createHmac('sha256', secret).update(request.rawBody).digest('hex');
    const provided = signature.replace(/^sha256=/, '');

    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');
    const isValid =
      expectedBuf.length === providedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
