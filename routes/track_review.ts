import express from "express";
import { v4 as uuidv4 } from "uuid";
import { Folder } from "../shared/models/mongoose";
import { Project } from "../shared/models/mongoose";
import { TrackReview } from "../shared/models/mongoose/TrackReview";
import isAuthenticated from "./auth";

const router = express.Router();

// Get list of folders for a project (Already using MongoDB)
router.get("/api/folders", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user?.claims?.sub || req.user?.id;
        console.log("[Track Review] Loading folders for user:", userId);

        // Get all folders from MongoDB, sorted by path
        const foldersList = await Folder.find({ userId }).sort({ path: 1 }).lean();

        const folders = foldersList.map((folder: any) => ({
            id: folder._id.toString(),
            name: folder.name,
            path: folder.path
        }));

        console.log(`[Track Review] Found ${folders.length} folders`);
        res.json({ folders });
    } catch (error) {
        console.error("[Track Review] Error loading folders:", error);
        res.status(500).json({ error: "Failed to load folders" });
    }
});

// Load a track review by ID
router.get("/api/track-review/:reviewId", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user?.claims?.sub || req.user?.id;
        const { reviewId } = req.params;

        // Try to find by MongoDB _id
        let review = null;
        try {
            review = await TrackReview.findOne({ _id: reviewId, userId });
        } catch (e) {
            // If ID is not a valid ObjectId, it might be a legacy file-based ID
            // We'll skip this catch block to handle it below if we were supporting legacy migration on read
            // But for now, user asked to switch to MERN, so we look in DB.
        }

        if (review) {
            res.json(review);
        } else {
            res.status(404).json({ error: "Review not found" });
        }
    } catch (error) {
        console.error("Error loading review:", error);
        res.status(500).json({ error: "Failed to load review" });
    }
});

// Save a track review
router.post("/api/track-review", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user?.claims?.sub || req.user?.id;
        const reviewData = req.body;
        const { folderId, trackName, key, bpm, audioUrl, lyrics, structureMarkers, comments } = reviewData;

        let reviewId = reviewData.reviewId; // This might be an ObjectId string if editing

        if (!folderId) {
            return res.status(400).json({ error: "Folder ID is required" });
        }

        let trackReview;

        if (reviewId) {
            // Try to update existing review
            trackReview = await TrackReview.findOne({ _id: reviewId, userId });
        }

        if (trackReview) {
            // Update existing
            trackReview.trackName = trackName;
            trackReview.key = key;
            trackReview.bpm = bpm;
            trackReview.audioUrl = audioUrl;
            trackReview.lyrics = lyrics;
            trackReview.structureMarkers = structureMarkers;
            trackReview.comments = comments;
            trackReview.folderId = folderId;
            await trackReview.save();
        } else {
            // Create new
            trackReview = new TrackReview({
                userId,
                trackName: trackName || "Untitled Review",
                key,
                bpm,
                audioUrl,
                lyrics,
                structureMarkers,
                comments,
                folderId
            });
            await trackReview.save();
            reviewId = trackReview._id.toString();
        }

        // Sync with Project System
        try {
            // Check if project already exists for this review
            // We search by metadata.reviewId which stores the MongoDB _id of the review
            let project = await Project.findOne({
                userId,
                "metadata.reviewId": reviewId
            });

            const folder = await Folder.findById(folderId);

            if (project) {
                // Update existing project
                project.title = trackName || "Untitled Review";
                project.folderId = folderId;
                project.folderPath = folder?.path || "Unknown";
                project.updatedAt = new Date();
                await project.save();
            } else {
                // Create new project
                project = new Project({
                    userId,
                    title: trackName || "Untitled Review",
                    type: "track_review",
                    status: "planning", // Default status for reviews
                    folderId,
                    folderPath: folder?.path || "Unknown",
                    rootFolder: folder?.path?.split('/')[0] || "Unknown",
                    metadata: {
                        reviewId: reviewId, // Link to TrackReview document
                        type: 'track_review_db'
                    }
                });
                await project.save();
            }
            console.log("[Track Review] Synced project:", project._id);
        } catch (dbError) {
            console.error("[Track Review] Failed to sync project to DB:", dbError);
        }

        res.json({ success: true, reviewId, trackReview });
    } catch (error) {
        console.error("Error saving review:", error);
        res.status(500).json({ error: "Failed to save review" });
    }
});

// Export a track review as text
router.get("/api/track-review/:reviewId/export", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user?.claims?.sub || req.user?.id;
        const { reviewId } = req.params;

        const reviewData = await TrackReview.findOne({ _id: reviewId, userId });

        if (!reviewData) {
            return res.status(404).json({ error: "Review not found" });
        }

        // Format as text
        const formatTime = (seconds: number): string => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
        };

        let exportText = `TRACK REVIEW: ${reviewData.trackName}\n`;
        exportText += `${"=".repeat(50)}\n\n`;

        if (reviewData.key) {
            exportText += `Key: ${reviewData.key}\n`;
        }
        if (reviewData.bpm) {
            exportText += `BPM: ${reviewData.bpm}\n`;
        }
        if (reviewData.audioUrl) {
            exportText += `Audio URL: ${reviewData.audioUrl}\n`;
        }
        exportText += `\n`;

        // Structure markers with section lyrics
        if (reviewData.structureMarkers && reviewData.structureMarkers.length > 0) {
            exportText += `SONG STRUCTURE & LYRICS:\n`;
            exportText += `${"-".repeat(50)}\n`;
            reviewData.structureMarkers
                .sort((a: any, b: any) => a.timestamp - b.timestamp)
                .forEach((marker: any) => {
                    exportText += `\n[${formatTime(marker.timestamp)}] ${marker.label.toUpperCase()}\n`;
                    if (marker.lyrics && marker.lyrics.trim()) {
                        exportText += `${marker.lyrics}\n`;
                    } else {
                        exportText += `(No lyrics written for this section)\n`;
                    }
                });
            exportText += `\n`;
        }

        // Legacy lyrics field (for backward compatibility)
        if (reviewData.lyrics && reviewData.lyrics.trim()) {
            exportText += `ADDITIONAL LYRICS:\n`;
            exportText += `${"-".repeat(50)}\n`;
            exportText += `${reviewData.lyrics}\n\n`;
        }

        // Comments
        if (reviewData.comments && reviewData.comments.length > 0) {
            exportText += `NOTES:\n`;
            exportText += `${"-".repeat(50)}\n`;
            reviewData.comments
                .sort((a: any, b: any) => a.timestamp - b.timestamp)
                .forEach((comment: any) => {
                    exportText += `[${formatTime(comment.timestamp)}] ${comment.text}\n`;
                });
            exportText += `\n`;
        }

        exportText += `\nLast Modified: ${new Date((reviewData as any).updatedAt).toLocaleString()}\n`;

        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Content-Disposition", `attachment; filename="${reviewData.trackName || "track-review"}.txt"`);
        res.send(exportText);
    } catch (error) {
        console.error("Error exporting review:", error);
        res.status(500).json({ error: "Failed to export review" });
    }
});

export default router;
