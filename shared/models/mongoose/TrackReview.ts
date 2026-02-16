import mongoose, { Schema, Document } from "mongoose";

export interface IStructureMarker {
    timestamp: number;
    label: string;
    lyrics: string;
}

export interface IComment {
    id: string;
    timestamp: number;
    text: string;
    createdAt: Date;
}

export interface ITrackReview extends Document {
    userId: mongoose.Types.ObjectId;
    trackName: string;
    key: string;
    bpm: string | number;
    audioUrl: string;
    lyrics: string;
    structureMarkers: IStructureMarker[];
    comments: IComment[];
    folderId: mongoose.Types.ObjectId;
}

const structureMarkerSchema = new Schema({
    timestamp: { type: Number, required: true },
    label: { type: String, required: true },
    lyrics: { type: String, default: "" }
});

const commentSchema = new Schema({
    id: { type: String, required: true },
    timestamp: { type: Number, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const trackReviewSchema = new Schema<ITrackReview>({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    trackName: { type: String, required: true },
    key: { type: String, default: "" },
    bpm: { type: Schema.Types.Mixed, default: "" },
    audioUrl: { type: String, default: "" },
    lyrics: { type: String, default: "" }, // Legacy field
    structureMarkers: [structureMarkerSchema],
    comments: [commentSchema],
    folderId: { type: Schema.Types.ObjectId, ref: "Folder", required: true },
}, { timestamps: true });

export const TrackReview = mongoose.model<ITrackReview>("TrackReview", trackReviewSchema);
