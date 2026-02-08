import mongoose, { Schema, Document } from "mongoose";

export interface IBlogPost extends Document {
  sharedContentId: mongoose.Types.ObjectId | null;
  title: string;
  content: string;
  authorId: mongoose.Types.ObjectId;
  isPublished: boolean;
  createdAt: Date;
  publishedAt: Date | null;
}

const blogPostSchema = new Schema<IBlogPost>({
  sharedContentId: { type: Schema.Types.ObjectId, ref: "SharedContent", default: null },
  title: { type: String, required: true, maxlength: 255 },
  content: { type: String, required: true },
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  isPublished: { type: Boolean, default: false },
  publishedAt: { type: Date, default: null },
}, { timestamps: true });

export const BlogPost = mongoose.model<IBlogPost>("BlogPost", blogPostSchema);
