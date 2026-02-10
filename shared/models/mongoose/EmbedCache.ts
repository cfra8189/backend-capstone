import mongoose, { Schema, Document } from "mongoose";

export interface IEmbedCache extends Document {
  url: string;
  data: any;
  provider: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const embedCacheSchema = new Schema<IEmbedCache>({
  url: { type: String, required: true, unique: true, index: true },
  data: { type: Schema.Types.Mixed, required: true },
  provider: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index
}, { timestamps: true });

export const EmbedCache = mongoose.model<IEmbedCache>("EmbedCache", embedCacheSchema);
