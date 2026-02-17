import express from "express";
import { TrackedTrack } from "../shared/models/mongoose/TrackedTrack";
import { PulseHistory } from "../shared/models/mongoose/PulseHistory";
import { isAuthenticated } from "../integrations/auth";

const router = express.Router();

function toId(doc: any) {
    if (!doc) return doc;
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    if (obj._id) {
        obj.id = obj._id.toString();
    }
    return obj;
}

// ---------- Helpers ----------

function extractYouTubeId(url: string): string | null {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

async function fetchYouTubeStats(videoId: string): Promise<{ plays: number; likes: number; comments: number; publishedAt?: Date } | null> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        console.error("YOUTUBE_API_KEY not set in environment");
        return null;
    }

    try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoId}&key=${apiKey}`;
        const response = await fetch(apiUrl);
        const data = await response.json() as any;

        if (!data.items || data.items.length === 0) {
            console.error("YouTube video not found:", videoId);
            return null;
        }

        const stats = data.items[0].statistics;
        const snippet = data.items[0].snippet;
        return {
            plays: parseInt(stats.viewCount) || 0,
            likes: parseInt(stats.likeCount) || 0,
            comments: parseInt(stats.commentCount) || 0,
            publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : undefined,
        };
    } catch (error) {
        console.error("YouTube API Error:", error);
        return null;
    }
}

function calculateStatus(growth: number): string {
    if (growth > 25) return "🔥 Hot";
    if (growth >= 5) return "📈 Growing";
    if (growth >= -5) return "📊 Steady";
    return "📉 Declining";
}

function calculatePromoRecommendation(growth: number, totalPlays: number, status: string): string {
    if (status === "🔥 Hot" && totalPlays > 1000) {
        return "✅ PROMOTE NOW - Strong momentum + good traction";
    } else if (status === "📈 Growing" && totalPlays > 500) {
        return "⚡ CONSIDER - Growing steadily, watch for 1-2 more weeks";
    } else if (status === "📊 Steady" && totalPlays > 2000) {
        return "🎯 BOOST NEEDED - Stable but could use a push";
    } else if (status === "📉 Declining") {
        return "❌ HOLD OFF - Wait for organic recovery";
    } else if (totalPlays < 500) {
        return "⏳ TOO EARLY - Need more data (< 500 views)";
    }
    return "📊 MONITOR - Keep watching trends";
}

// ---------- Routes ----------

// GET /api/pulse/tracks — List all tracked tracks
router.get("/api/pulse/tracks", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const tracks = await TrackedTrack.find({ userId }).sort({ dateAdded: -1 });
        res.json({ tracks: tracks.map(toId) });
    } catch (error) {
        console.error("Failed to fetch tracked tracks:", error);
        res.status(500).json({ message: "Failed to fetch tracks" });
    }
});

// POST /api/pulse/tracks — Add a new tracked track
router.post("/api/pulse/tracks", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const { trackName, youtubeUrl } = req.body;

        if (!trackName || !youtubeUrl) {
            return res.status(400).json({ message: "Track name and YouTube URL are required" });
        }

        const videoId = extractYouTubeId(youtubeUrl);
        if (!videoId) {
            return res.status(400).json({ message: "Invalid YouTube URL. Please use a full youtube.com/watch?v= or youtu.be/ link." });
        }

        // Check for duplicate
        const existing = await TrackedTrack.findOne({ userId, videoId });
        if (existing) {
            return res.status(409).json({ message: "This video is already being tracked" });
        }

        // Fetch initial stats
        const stats = await fetchYouTubeStats(videoId);

        const track = await TrackedTrack.create({
            userId,
            trackName,
            youtubeUrl,
            videoId,
            currentPlays: stats?.plays || 0,
            currentLikes: stats?.likes || 0,
            currentComments: stats?.comments || 0,
            growth7d: 0,
            publishedAt: stats?.publishedAt,
            status: stats ? "📊 Steady" : "⏳ Collecting Data",
            promoRecommendation: "⏳ TOO EARLY - Need more data",
            dateAdded: new Date(),
            lastUpdated: new Date(),
        });

        // Log initial history snapshot
        if (stats) {
            await PulseHistory.create({
                userId,
                trackId: track._id,
                trackName,
                plays: stats.plays,
                likes: stats.likes,
                comments: stats.comments,
                timestamp: new Date(),
            });
        }

        res.json({ track: toId(track) });
    } catch (error) {
        console.error("Failed to add tracked track:", error);
        res.status(500).json({ message: "Failed to add track" });
    }
});

// DELETE /api/pulse/tracks/:id — Remove a tracked track
router.delete("/api/pulse/tracks/:id", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const track = await TrackedTrack.findById(req.params.id);

        if (!track || track.userId !== userId) {
            return res.status(404).json({ message: "Track not found" });
        }

        // Delete history too
        await PulseHistory.deleteMany({ trackId: track._id });
        await TrackedTrack.findByIdAndDelete(req.params.id);

        res.json({ success: true });
    } catch (error) {
        console.error("Failed to delete tracked track:", error);
        res.status(500).json({ message: "Failed to delete track" });
    }
});

// POST /api/pulse/refresh — Refresh stats for all tracks
router.post("/api/pulse/refresh", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const tracks = await TrackedTrack.find({ userId });

        const results = [];

        for (const track of tracks) {
            const stats = await fetchYouTubeStats(track.videoId);

            if (stats) {
                // Calculate 7-day growth
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const oldSnapshot = await PulseHistory.findOne({
                    trackId: track._id,
                    timestamp: { $lte: sevenDaysAgo },
                }).sort({ timestamp: -1 });

                let growth = 0;
                if (oldSnapshot && oldSnapshot.plays > 0) {
                    growth = ((stats.plays - oldSnapshot.plays) / oldSnapshot.plays) * 100;
                }

                const status = calculateStatus(growth);
                const recommendation = calculatePromoRecommendation(growth, stats.plays, status);

                await TrackedTrack.findByIdAndUpdate(track._id, {
                    currentPlays: stats.plays,
                    currentLikes: stats.likes,
                    currentComments: stats.comments,
                    growth7d: Math.round(growth * 10) / 10,
                    publishedAt: stats.publishedAt,
                    status,
                    promoRecommendation: recommendation,
                    lastUpdated: new Date(),
                });

                // Log history snapshot
                await PulseHistory.create({
                    userId,
                    trackId: track._id,
                    trackName: track.trackName,
                    plays: stats.plays,
                    likes: stats.likes,
                    comments: stats.comments,
                    timestamp: new Date(),
                });

                results.push({ trackName: track.trackName, success: true, stats });
            } else {
                results.push({ trackName: track.trackName, success: false, error: "Failed to fetch stats" });
            }
        }

        // Return updated tracks
        const updatedTracks = await TrackedTrack.find({ userId }).sort({ dateAdded: -1 });
        res.json({ tracks: updatedTracks.map(toId), results });
    } catch (error) {
        console.error("Failed to refresh pulse:", error);
        res.status(500).json({ message: "Failed to refresh" });
    }
});

// GET /api/pulse/history — Get all history for charting
router.get("/api/pulse/history", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const history = await PulseHistory.find({ userId }).sort({ timestamp: 1 });
        res.json({ history: history.map(toId) });
    } catch (error) {
        console.error("Failed to fetch pulse history:", error);
        res.status(500).json({ message: "Failed to fetch history" });
    }
});

// GET /api/pulse/history/:trackId — Get history for a specific track
router.get("/api/pulse/history/:trackId", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const history = await PulseHistory.find({
            userId,
            trackId: req.params.trackId,
        }).sort({ timestamp: 1 });
        res.json({ history: history.map(toId) });
    } catch (error) {
        console.error("Failed to fetch track history:", error);
        res.status(500).json({ message: "Failed to fetch history" });
    }
});

export default router;
