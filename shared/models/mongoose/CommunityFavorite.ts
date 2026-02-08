import mongoose, { Schema, Document } from "mongoose";

export interface ICommunityFavorite extends Document {
  sharedContentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const communityFavoriteSchema = new Schema<ICommunityFavorite>({
  sharedContentId: { type: Schema.Types.ObjectId, ref: "SharedContent", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

export const CommunityFavorite = mongoose.model<ICommunityFavorite>("CommunityFavorite", communityFavoriteSchema);
