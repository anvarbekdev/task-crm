export interface JwtPayload {
  sub: string; // userId
  companyId: string;
  role: string;
}

export interface AuthenticatedUser {
  userId: string;
  companyId: string;
  role: string;
}
