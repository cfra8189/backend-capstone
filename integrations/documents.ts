import express from "express";
import { StoredDocument } from "../shared/models/mongoose/Document";
import { isAuthenticated } from "./auth";

const router = express.Router();

// GET /api/documents - List user's documents
router.get("/", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const documents = await StoredDocument.find({ userId }).sort({ createdAt: -1 });
        res.json({ documents });
    } catch (error) {
        console.error("Failed to fetch documents:", error);
        res.status(500).json({ message: "Failed to fetch documents" });
    }
});

// POST /api/documents - Save a new document
router.post("/", isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const { title, templateId, html, metadata, collaborators } = req.body;

        if (!title || !html) {
            return res.status(400).json({ message: "Title and content are required" });
        }

        const document = await StoredDocument.create({
            userId,
            title,
            templateId,
            html,
            metadata: metadata || {},
            collaborators: collaborators || [],
        });

        res.json({ document });
    } catch (error) {
        console.error("Failed to save document:", error);
        res.status(500).json({ message: "Failed to save document" });
    }
});

export default router;
