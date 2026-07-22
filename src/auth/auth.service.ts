import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectModel(Company.name) private readonly companyModel: Model<CompanyDocument>,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByLoginEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    return this.signToken(user._id.toString(), user.companyId.toString(), user.role);
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByLoginEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const company = await this.companyModel.create({ name: dto.companyName });
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersService.create({
      companyId: company._id as Types.ObjectId,
      name: dto.name,
      loginEmail: dto.email,
      emails: [dto.email],
      passwordHash,
      role: 'admin',
    });
    return this.signToken(user._id.toString(), user.companyId.toString(), user.role);
  }

  private signToken(userId: string, companyId: string, role: string) {
    const accessToken = this.jwtService.sign({ sub: userId, companyId, role });
    return { accessToken };
  }
}
