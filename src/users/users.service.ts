import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  findByLoginEmail(loginEmail: string) {
    return this.userModel.findOne({ loginEmail: loginEmail.toLowerCase() }).exec();
  }

  findById(id: string | Types.ObjectId) {
    return this.userModel.findById(id).exec();
  }

  create(data: {
    companyId: Types.ObjectId;
    name: string;
    loginEmail: string;
    emails: string[];
    passwordHash: string;
    role?: string;
  }) {
    return this.userModel.create({
      ...data,
      loginEmail: data.loginEmail.toLowerCase(),
      emails: data.emails.map((e) => e.toLowerCase()),
    });
  }

  /**
   * Resolves an inbound recipient address to the user/company that owns it.
   * Used by the email webhook to determine which tenant an email belongs to.
   */
  findByEmailAddress(address: string) {
    return this.userModel.findOne({ emails: address.toLowerCase() }).exec();
  }
}
