import mongoose, { Schema, Document } from "mongoose";

export interface ISharedContent extends Document {
  noteId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: string;
  adminNotes: string | null;
  blogPostId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  approvedAt: Date | null;
}

const sharedContentSchema = new Schema<ISharedContent>({
  noteId: { type: Schema.Types.ObjectId, ref: "CreativeNote", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, maxlength: 20, default: "pending" },
  adminNotes: { type: String, default: null },
  blogPostId: { type: Schema.Types.ObjectId, ref: "BlogPost", default: null },
  approvedAt: { type: Date, default: null },
}, { timestamps: true });

export const SharedContent = mongoose.model<ISharedContent>("SharedContent", sharedContentSchema);
