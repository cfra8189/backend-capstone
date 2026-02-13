import express from "express";
import { isAuthenticated } from "./auth";
import { Project } from "../shared/models/mongoose";

const router = express.Router();

// Move project to folder
router.put("/:id/move", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub || req.user?.id;
    const { id } = req.params;
    const { folderId } = req.body;

    if (!folderId) {
      return res.status(400).json({ message: "Folder ID is required" });
    }

    // Verify project ownership
    const project = await Project.findOne({ _id: id, userId });
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Update project's folder
    project.folderId = folderId;
    await project.save();

    res.json({ message: "Project moved successfully", project });
  } catch (error) {
    console.error("Error moving project:", error);
    res.status(500).json({ message: "Failed to move project" });
  }
});

export default router;
