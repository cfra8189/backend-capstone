import mongoose, { Schema, Document } from "mongoose";

export interface IStudioArtist extends Document {
  studioId: mongoose.Types.ObjectId;
  artistId: mongoose.Types.ObjectId | null;
  status: string;
  inviteEmail: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
}

const studioArtistSchema = new Schema<IStudioArtist>({
  studioId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  artistId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, maxlength: 20, default: "pending" },
  inviteEmail: { type: String, default: null },
  acceptedAt: { type: Date, default: null },
}, { timestamps: true });

export const StudioArtist = mongoose.model<IStudioArtist>("StudioArtist", studioArtistSchema);
