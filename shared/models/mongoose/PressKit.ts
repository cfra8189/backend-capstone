import mongoose, { Schema } from "mongoose";

const pressKitSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  shortBio: { type: String, default: null },
  mediumBio: { type: String, default: null },
  longBio: { type: String, default: null },
  genre: { type: String, maxlength: 100, default: null },
  location: { type: String, maxlength: 255, default: null },
  photoUrls: { type: [String], default: [] },
  videoUrls: { type: [String], default: [] },
  featuredTracks: { type: [Schema.Types.Mixed], default: [] },
  achievements: { type: [Schema.Types.Mixed], default: [] },
  pressQuotes: { type: [Schema.Types.Mixed], default: [] },
  socialLinks: { type: Schema.Types.Mixed, default: {} },
  contactEmail: { type: String, default: null },
  contactName: { type: String, default: null },
  bookingEmail: { type: String, default: null },
  technicalRider: { type: String, default: null },
  stagePlot: { type: String, default: null },
  isPublished: { type: Boolean, default: false },
}, { timestamps: true });

export const PressKit = mongoose.model("PressKit", pressKitSchema);
