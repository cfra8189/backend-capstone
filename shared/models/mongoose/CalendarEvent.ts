import mongoose, { Schema, Document } from "mongoose";

export interface ICalendarEvent extends Document {
    userId: mongoose.Types.ObjectId;
    projectId?: mongoose.Types.ObjectId;
    title: string;
    type: "session" | "habit" | "deadline" | "milestone";
    startDate: Date;
    endDate?: Date;
    status: "pending" | "completed" | "missed";
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

const calendarEventSchema = new Schema<ICalendarEvent>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
        title: { type: String, required: true },
        type: {
            type: String,
            enum: ["session", "habit", "deadline", "milestone"],
            default: "session"
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date },
        status: {
            type: String,
            enum: ["pending", "completed", "missed"],
            default: "pending"
        },
        metadata: { type: Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

// Indexes for faster querying by range
calendarEventSchema.index({ userId: 1, startDate: 1 });
calendarEventSchema.index({ userId: 1, type: 1 });

export const CalendarEvent = mongoose.model<ICalendarEvent>("CalendarEvent", calendarEventSchema);
