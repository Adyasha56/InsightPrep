import { Document, Schema, model } from "mongoose";

export interface UserDocument extends Document {
  email: string;
  passwordHash: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Excluded by default so a stray `User.find()` never leaks hashes;
    // callers must opt in with .select("+passwordHash").
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    const { passwordHash: _passwordHash, __v: _version, ...safe } = ret;
    return safe;
  },
});

export const User = model<UserDocument>("User", userSchema);
