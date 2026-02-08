import mongoose, { Schema, Document } from "mongoose";

export interface ICommunityComment extends Document {
  sharedContentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
}

const communityCommentSchema = new Schema<ICommunityComment>({
  sharedContentId: { type: Schema.Types.ObjectId, ref: "SharedContent", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String, required: true },
}, { timestamps: true });

export const CommunityComment = mongoose.model<ICommunityComment>("CommunityComment", communityCommentSchema);
