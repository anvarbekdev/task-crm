import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InboundEmailDto } from './dto/inbound-email.dto';
import { EmailService } from './email.service';
import { WebhookSignatureGuard } from './webhook-signature.guard';

@ApiTags('webhooks')
@Controller('webhooks/email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Receives inbound-email events from the (fake) email provider. Public
   * endpoint by necessity — authenticated instead via HMAC signature
   * (WebhookSignatureGuard), not a user session. See THREATS.md.
   */
  @ApiOperation({
    summary: 'Inbound-email webhook (called by the email provider, not a browser client)',
    description:
      'Requires a valid HMAC signature; see the X-Webhook-Signature header and THREATS.md. ' +
      'Redelivering the same messageId is a no-op (idempotent).',
  })
  @ApiHeader({
    name: 'X-Webhook-Signature',
    description: 'sha256=<hex hmac of the raw request body, keyed with EMAIL_WEBHOOK_SECRET>',
  })
  @UseGuards(WebhookSignatureGuard)
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async handleWebhook(@Body() dto: InboundEmailDto) {
    return this.emailService.ingest(dto);
  }
}
