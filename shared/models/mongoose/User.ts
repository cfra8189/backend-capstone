import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string | null;
  passwordHash: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  businessName: string | null;
  businessBio: string | null;
  boxCode: string | null;
  emailVerified: boolean;
  verificationToken: string | null;
  verificationTokenExpires: Date | null;
  githubId: string | null;
  googleId: string | null;
  refreshTokenHash: string | null;
  authType?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  email: { type: String, unique: true, sparse: true, default: null },
  passwordHash: { type: String, default: null },
  displayName: { type: String, default: null },
  firstName: { type: String, default: null },
  lastName: { type: String, default: null },
  profileImageUrl: { type: String, default: null },
  role: { type: String, maxlength: 20, default: "artist" },
  businessName: { type: String, default: null },
  businessBio: { type: String, default: null },
  boxCode: { type: String, maxlength: 12, unique: true, sparse: true, default: null },
  emailVerified: { type: Boolean, default: false },
  verificationToken: { type: String, default: null },
  verificationTokenExpires: { type: Date, default: null },
  githubId: { type: String, default: null },
  googleId: { type: String, default: null },
  refreshTokenHash: { type: String, default: null },
}, { timestamps: true });

export const User = mongoose.model<IUser>("User", userSchema);
