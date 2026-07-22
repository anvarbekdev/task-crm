import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * Convenience endpoint for demos/tests: creates a brand-new company plus its
 * first (admin) user in one call. Real provisioning in a production CRM
 * would be invite-only/admin-driven — see DESIGN.md for the cut corner.
 */
export class RegisterDto {
  @ApiProperty({ example: 'Acme Co' })
  @IsString()
  @MinLength(2)
  companyName: string;

  @ApiProperty({ example: 'Bob' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'bob@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
