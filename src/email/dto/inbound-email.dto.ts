import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Contract assumed for the fake email-provider webhook. Not given by the
 * prompt, so invented and documented here (and in README.md) since nothing
 * else defines it.
 */
export class InboundEmailDto {
  @ApiProperty({ example: 'fake-mail' })
  @IsString()
  provider: string;

  @ApiProperty({ example: 'msg-abc123', description: "Provider's own message id; used for idempotency" })
  @IsString()
  messageId: string;

  @ApiProperty({ example: 'alice@customer.com' })
  @IsEmail()
  from: string;

  @ApiProperty({ example: ['bob@acmeco.com'], type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  to: string[];

  @ApiPropertyOptional({ example: 'Can you send the invoice by Friday?' })
  @IsOptional()
  @IsString()
  @MaxLength(998) // RFC 2822 line-length limit for header fields
  subject?: string;

  @ApiPropertyOptional({ example: 'Hi Bob, could you send the Q3 invoice by 2026-08-01?' })
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  text?: string;

  @ApiPropertyOptional({ example: '2026-07-20T10:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  @Type(() => String)
  receivedAt?: string;
}
