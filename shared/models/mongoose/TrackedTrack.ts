import mongoose, { Schema, Document } from "mongoose";

export interface ITrackedTrack extends Document {
    userId: string;
    trackName: string;
    youtubeUrl: string;
    videoId: string;
    currentPlays: number;
    currentLikes: number;
    currentComments: number;
    growth7d: number;
    publishedAt?: Date;
    status: string;
    promoRecommendation: string;
    dateAdded: Date;
    lastUpdated: Date;
}

const TrackedTrackSchema = new Schema<ITrackedTrack>({
    userId: { type: String, required: true, index: true },
    trackName: { type: String, required: true },
    youtubeUrl: { type: String, required: true },
    videoId: { type: String, required: true },
    currentPlays: { type: Number, default: 0 },
    currentLikes: { type: Number, default: 0 },
    currentComments: { type: Number, default: 0 },
    growth7d: { type: Number, default: 0 },
    publishedAt: { type: Date },
    status: { type: String, default: "⏳ Collecting Data" },
    promoRecommendation: { type: String, default: "⏳ TOO EARLY - Need more data" },
    dateAdded: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now },
});

export const TrackedTrack = mongoose.model<ITrackedTrack>("TrackedTrack", TrackedTrackSchema);
