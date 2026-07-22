/**
 * Seeds a demo company with two users so the feature can be exercised
 * end-to-end without going through POST /auth/register by hand.
 *
 * Usage: npm run seed
 */
import * as bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { CompanySchema } from '../src/companies/schemas/company.schema';
import { UserSchema } from '../src/users/schemas/user.schema';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/email-to-task-crm';

async function main() {
  await mongoose.connect(MONGODB_URI);

  const CompanyModel = mongoose.model('Company', CompanySchema);
  const UserModel = mongoose.model('User', UserSchema);

  await CompanyModel.deleteMany({ name: 'Acme Co (demo)' });
  await UserModel.deleteMany({ loginEmail: { $in: ['bob@acme-demo.com', 'carol@acme-demo.com'] } });

  const company = await CompanyModel.create({ name: 'Acme Co (demo)' });

  const passwordHash = await bcrypt.hash('password123', 10);

  const bob = await UserModel.create({
    companyId: company._id,
    name: 'Bob (admin)',
    loginEmail: 'bob@acme-demo.com',
    emails: ['bob@acme-demo.com', 'support@acme-demo.com'],
    passwordHash,
    role: 'admin',
  });

  const carol = await UserModel.create({
    companyId: company._id,
    name: 'Carol',
    loginEmail: 'carol@acme-demo.com',
    emails: ['carol@acme-demo.com'],
    passwordHash,
    role: 'member',
  });

  console.log('Seeded demo data:');
  console.log(`  Company: ${company.name} (${company._id.toString()})`);
  console.log(`  User: ${bob.loginEmail} / password123 (routes: ${bob.emails.join(', ')})`);
  console.log(`  User: ${carol.loginEmail} / password123 (routes: ${carol.emails.join(', ')})`);
  console.log('');
  console.log('Log in with:');
  console.log(
    `  curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d "{\\"email\\":\\"bob@acme-demo.com\\",\\"password\\":\\"password123\\"}"`,
  );
  console.log('');
  console.log('Then simulate an inbound email addressed to one of the routes above with:');
  console.log('  npm run simulate:email');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
