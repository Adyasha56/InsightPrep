import bcrypt from "bcryptjs";

// bcryptjs is pure JS (no native build step), which keeps setup portable
// across the evaluator's clean-clone environment.
const SALT_ROUNDS = 12;

export function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export function comparePassword(plainTextPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
