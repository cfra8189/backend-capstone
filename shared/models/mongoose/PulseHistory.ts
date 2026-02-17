import mongoose, { Schema, Document } from "mongoose";

export interface IPulseHistory extends Document {
    userId: string;
    trackId: mongoose.Types.ObjectId;
    trackName: string;
    plays: number;
    likes: number;
    comments: number;
    timestamp: Date;
}

const PulseHistorySchema = new Schema<IPulseHistory>({
    userId: { type: String, required: true, index: true },
    trackId: { type: Schema.Types.ObjectId, ref: "TrackedTrack", required: true, index: true },
    trackName: { type: String, required: true },
    plays: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now, index: true },
});

// Compound index for efficient history queries
PulseHistorySchema.index({ userId: 1, trackId: 1, timestamp: -1 });

export const PulseHistory = mongoose.model<IPulseHistory>("PulseHistory", PulseHistorySchema);
