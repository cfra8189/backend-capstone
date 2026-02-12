import mongoose, { Schema, Document } from "mongoose";

export interface IStoredDocument extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  templateId: string;
  html: string;
  metadata: any;
  collaborators: any[];
  createdAt: Date;
}

const documentSchema = new Schema<IStoredDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    templateId: { type: String, default: null },
    html: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    collaborators: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

export const StoredDocument = mongoose.model<IStoredDocument>("StoredDocument", documentSchema);
