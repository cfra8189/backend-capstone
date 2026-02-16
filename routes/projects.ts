
import express from "express";
import { Project } from "../shared/models/mongoose/Project";
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

router.use(isAuthenticated);

router.get("/", async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const { folderId } = req.query;

        const query: any = { userId };
        if (folderId === 'root') {
            query.folderId = null;
        } else if (folderId) {
            query.folderId = folderId;
        }

        const userProjects = await Project.find(query).sort({ createdAt: -1 });
        res.json({ projects: userProjects.map(toId) });
    } catch (error) {
        console.error("Failed to fetch projects:", error);
        res.status(500).json({ message: "Failed to fetch projects" });
    }
});

router.post("/", async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const { title, type, status, description, metadata, folderId } = req.body;

        // Generate folder structure
        const currentYear = new Date().getFullYear();
        const rootFolder = `${currentYear}`;
        const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
        const folderPath = `${rootFolder}/${sanitizedTitle}`;

        const project = await Project.create({
            userId,
            title,
            type: type || "single",
            status: status || "concept",
            description,
            metadata: metadata || {},
            folderPath,
            rootFolder,
            folderId: folderId || null,
        });
        res.json({ project: toId(project) });
    } catch (error) {
        console.error("Failed to create project:", error);
        res.status(500).json({ message: "Failed to create project" });
    }
});

router.get("/:id", async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const project = await Project.findById(req.params.id);
        if (!project || project.userId.toString() !== userId) {
            return res.status(404).json({ message: "Project not found" });
        }
        res.json({ project: toId(project) });
    } catch (error) {
        console.error("Failed to fetch project:", error);
        res.status(500).json({ message: "Failed to fetch project" });
    }
});

router.put("/:id", async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const existing = await Project.findById(req.params.id);
        if (!existing || existing.userId.toString() !== userId) {
            return res.status(404).json({ message: "Project not found" });
        }
        const { title, type, status, description, metadata } = req.body;
        const project = await Project.findByIdAndUpdate(req.params.id, {
            title: title || existing.title,
            type: type || existing.type,
            status: status || existing.status,
            description: description !== undefined ? description : existing.description,
            metadata: metadata || existing.metadata,
            updatedAt: new Date(),
        }, { new: true });
        res.json({ project: toId(project) });
    } catch (error) {
        console.error("Failed to update project:", error);
        res.status(500).json({ message: "Failed to update project" });
    }
});

router.delete("/:id", async (req: any, res) => {
    try {
        const userId = req.user.claims.sub;
        const existing = await Project.findById(req.params.id);
        if (!existing || existing.userId.toString() !== userId) {
            return res.status(404).json({ message: "Project not found" });
        }
        await Project.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error("Failed to delete project:", error);
        res.status(500).json({ message: "Failed to delete project" });
    }
});

export default router;
