import express from "express";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Get list of folders for a project
router.get("/api/folders", async (req, res) => {
    try {
        const projectsDir = path.join(process.cwd(), "projects");

        // For now, return all top-level folders
        // In a real implementation, this would filter by user/project
        const folders: any[] = [];

        try {
            const entries = await fs.readdir(projectsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    folders.push({
                        id: entry.name,
                        name: entry.name,
                        path: path.join(projectsDir, entry.name)
                    });
                }
            }
        } catch (error) {
            // Projects directory doesn't exist yet
            console.log("Projects directory not found, returning empty folders list");
        }

        res.json({ folders });
    } catch (error) {
        console.error("Error loading folders:", error);
        res.status(500).json({ error: "Failed to load folders" });
    }
});

// Load a track review by ID
router.get("/api/track-review/:reviewId", async (req, res) => {
    try {
        const { reviewId } = req.params;
        const projectsDir = path.join(process.cwd(), "projects");

        // Search for the review file in all folders
        let reviewData = null;
        let foundPath = "";

        const searchInDir = async (dir: string): Promise<boolean> => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);

                    if (entry.isDirectory()) {
                        if (await searchInDir(fullPath)) {
                            return true;
                        }
                    } else if (entry.name === `${reviewId}.json`) {
                        const content = await fs.readFile(fullPath, "utf-8");
                        reviewData = JSON.parse(content);
                        foundPath = fullPath;
                        return true;
                    }
                }
            } catch (error) {
                // Ignore errors for inaccessible directories
            }
            return false;
        };

        await searchInDir(projectsDir);

        if (reviewData) {
            res.json(reviewData);
        } else {
            res.status(404).json({ error: "Review not found" });
        }
    } catch (error) {
        console.error("Error loading review:", error);
        res.status(500).json({ error: "Failed to load review" });
    }
});

// Save a track review
router.post("/api/track-review", async (req, res) => {
    try {
        const reviewData = req.body;
        const { folderId } = reviewData;

        if (!folderId) {
            return res.status(400).json({ error: "Folder ID is required" });
        }

        const projectsDir = path.join(process.cwd(), "projects");
        const folderPath = path.join(projectsDir, folderId);

        // Ensure folder exists
        await fs.mkdir(folderPath, { recursive: true });

        // Generate review ID if not provided
        const reviewId = reviewData.reviewId || uuidv4();
        const fileName = `${reviewId}.json`;
        const filePath = path.join(folderPath, fileName);

        // Add reviewId to data
        const dataToSave = {
            ...reviewData,
            reviewId,
            lastModified: new Date().toISOString()
        };

        await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2), "utf-8");

        res.json({ success: true, reviewId, filePath });
    } catch (error) {
        console.error("Error saving review:", error);
        res.status(500).json({ error: "Failed to save review" });
    }
});

// Export a track review as text
router.get("/api/track-review/:reviewId/export", async (req, res) => {
    try {
        const { reviewId } = req.params;
        const projectsDir = path.join(process.cwd(), "projects");

        // Search for the review file
        let reviewData: any = null;

        const searchInDir = async (dir: string): Promise<boolean> => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);

                    if (entry.isDirectory()) {
                        if (await searchInDir(fullPath)) {
                            return true;
                        }
                    } else if (entry.name === `${reviewId}.json`) {
                        const content = await fs.readFile(fullPath, "utf-8");
                        reviewData = JSON.parse(content);
                        return true;
                    }
                }
            } catch (error) {
                // Ignore errors
            }
            return false;
        };

        await searchInDir(projectsDir);

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

        // Structure markers
        if (reviewData.structureMarkers && reviewData.structureMarkers.length > 0) {
            exportText += `SONG STRUCTURE:\n`;
            exportText += `${"-".repeat(50)}\n`;
            reviewData.structureMarkers
                .sort((a: any, b: any) => a.timestamp - b.timestamp)
                .forEach((marker: any) => {
                    exportText += `${formatTime(marker.timestamp)} - ${marker.label}\n`;
                });
            exportText += `\n`;
        }

        // Lyrics
        if (reviewData.lyrics) {
            exportText += `LYRICS:\n`;
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

        exportText += `\nLast Modified: ${new Date(reviewData.lastModified).toLocaleString()}\n`;

        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Content-Disposition", `attachment; filename="${reviewData.trackName || "track-review"}.txt"`);
        res.send(exportText);
    } catch (error) {
        console.error("Error exporting review:", error);
        res.status(500).json({ error: "Failed to export review" });
    }
});

export default router;
