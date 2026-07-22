import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { WebhookSignatureGuard } from './webhook-signature.guard';

describe('WebhookSignatureGuard', () => {
  const secret = 'test-secret';

  const makeContext = (rawBody: Buffer, signatureHeader?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          rawBody,
          headers: signatureHeader ? { 'x-webhook-signature': signatureHeader } : {},
        }),
      }),
    }) as unknown as ExecutionContext;

  const sign = (body: Buffer) => crypto.createHmac('sha256', secret).update(body).digest('hex');

  let guard: WebhookSignatureGuard;

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue(secret) } as unknown as ConfigService;
    guard = new WebhookSignatureGuard(config);
  });

  it('accepts a request with a valid signature', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }));
    const ctx = makeContext(body, `sha256=${sign(body)}`);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects a request with a tampered body', () => {
    const original = Buffer.from(JSON.stringify({ hello: 'world' }));
    const signature = `sha256=${sign(original)}`;
    const tampered = Buffer.from(JSON.stringify({ hello: 'world', extra: true }));
    const ctx = makeContext(tampered, signature);

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a request with no signature header', () => {
    const body = Buffer.from('{}');
    const ctx = makeContext(body, undefined);

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('fails closed when the webhook secret is not configured', () => {
    const config = { get: jest.fn().mockReturnValue('') } as unknown as ConfigService;
    const unconfiguredGuard = new WebhookSignatureGuard(config);
    const body = Buffer.from('{}');
    const ctx = makeContext(body, `sha256=${sign(body)}`);

    expect(() => unconfiguredGuard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
