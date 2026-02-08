import mongoose, { Schema, Document } from "mongoose";

export interface IProject extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  type: string;
  status: string;
  description: string | null;
  metadata: Record<string, any>;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true, maxlength: 255 },
  type: { type: String, maxlength: 50, default: "single" },
  status: { type: String, maxlength: 50, default: "concept" },
  description: { type: String, default: null },
  metadata: { type: Schema.Types.Mixed, default: {} },
  isFeatured: { type: Boolean, default: false },
}, { timestamps: true });

export const Project = mongoose.model<IProject>("Project", projectSchema);
