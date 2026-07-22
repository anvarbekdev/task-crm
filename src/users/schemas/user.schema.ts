import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true, index: true })
  companyId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  loginEmail: string;

  /**
   * Every address that routes inbound mail to this user (usually includes
   * loginEmail plus aliases). Unique per-element so an address can't be
   * silently reassigned to a second user/tenant.
   */
  @Prop({ type: [String], required: true, unique: true, lowercase: true })
  emails: string[];

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;
}

export const UserSchema = SchemaFactory.createForClass(User);
