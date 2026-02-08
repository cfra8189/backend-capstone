import mongoose, { Schema, Document } from "mongoose";

export interface ICreativeNote extends Document {
  userId: mongoose.Types.ObjectId;
  category: string;
  title: string | null;
  content: string;
  mediaUrls: string[];
  tags: string[];
  isPinned: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const creativeNoteSchema = new Schema<ICreativeNote>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  category: { type: String, maxlength: 50, default: "ideas" },
  title: { type: String, maxlength: 255, default: null },
  content: { type: String, required: true },
  mediaUrls: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  isPinned: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

export const CreativeNote = mongoose.model<ICreativeNote>("CreativeNote", creativeNoteSchema);
