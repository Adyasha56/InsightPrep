import { User, UserDocument } from "../models/user.model";
import { hashPassword, comparePassword } from "../utils/password";
import { signAuthToken } from "../utils/jwt";
import { AppError } from "../utils/AppError";
import { ErrorCode } from "../types/error-code.types";
import { PublicUser } from "../types/user.types";
import { RegisterInput, LoginInput } from "../validators/auth.validator";

interface AuthResult {
  user: PublicUser;
  token: string;
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const existingUser = await User.findOne({ email: input.email });
  if (existingUser) {
    throw new AppError(ErrorCode.EMAIL_IN_USE, "An account with this email already exists.", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const user = await User.create({ email: input.email, passwordHash, name: input.name });

  return { user: toPublicUser(user), token: signAuthToken(user._id.toString()) };
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select("+passwordHash");

  // Same message for "no such user" and "wrong password" so the endpoint
  // cannot be used to enumerate registered email addresses.
  if (!user || !(await comparePassword(input.password, user.passwordHash))) {
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, "Invalid email or password.", 401);
  }

  return { user: toPublicUser(user), token: signAuthToken(user._id.toString()) };
}

export async function getUserById(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user) {
    throw AppError.notFound("User not found.");
  }
  return toPublicUser(user);
}

function toPublicUser(user: UserDocument): PublicUser {
  return { id: user._id.toString(), email: user.email, name: user.name };
}
