import express from "express";
import { Folder, IFolder } from "../shared/models";
import { isAuthenticated } from "./auth";

const router = express.Router();

// Get all folders for a user
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const folders = await Folder.find({ userId })
      .populate('parentId', 'name path')
      .sort({ path: 1 });
    
    res.json({ folders });
  } catch (error) {
    console.error("Error fetching folders:", error);
    res.status(500).json({ message: "Failed to fetch folders" });
  }
});

// Get folder tree structure
router.get("/tree", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const folders = await Folder.find({ userId })
      .populate('parentId', 'name path')
      .sort({ path: 1 });
    
    // Build tree structure
    const folderMap = new Map();
    const rootFolders = [];
    
    folders.forEach(folder => {
      folderMap.set(folder._id.toString(), { ...folder.toObject(), children: [] });
    });
    
    folders.forEach(folder => {
      const folderData = folderMap.get(folder._id.toString());
      if (folder.parentId) {
        const parent = folderMap.get(folder.parentId.toString());
        if (parent) {
          parent.children.push(folderData);
        }
      } else {
        rootFolders.push(folderData);
      }
    });
    
    res.json({ folders: rootFolders });
  } catch (error) {
    console.error("Error fetching folder tree:", error);
    res.status(500).json({ message: "Failed to fetch folder tree" });
  }
});

// Create a new folder
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name, parentId, type, year } = req.body;
    
    // Validate input
    if (!name || !type) {
      return res.status(400).json({ message: "Name and type are required" });
    }
    
    if (type === 'year' && !year) {
      return res.status(400).json({ message: "Year is required for year folders" });
    }
    
    // Check if folder already exists at this path
    let path = name;
    if (parentId) {
      const parentFolder = await Folder.findById(parentId);
      if (!parentFolder) {
        return res.status(404).json({ message: "Parent folder not found" });
      }
      path = `${parentFolder.path}/${name}`;
    }
    
    const existingFolder = await Folder.findOne({ userId, path });
    if (existingFolder) {
      return res.status(400).json({ message: "Folder already exists at this path" });
    }
    
    // Create folder
    const folder = new Folder({
      name,
      path,
      parentId: parentId || null,
      userId,
      type,
      year: type === 'year' ? year : undefined
    });
    
    await folder.save();
    await folder.populate('parentId', 'name path');
    
    res.status(201).json({ folder });
  } catch (error) {
    console.error("Error creating folder:", error);
    res.status(500).json({ message: "Failed to create folder" });
  }
});

// Auto-create year folder if it doesn't exist
router.post("/ensure-year", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const currentYear = new Date().getFullYear();
    
    // Check if year folder already exists
    let yearFolder = await Folder.findOne({ 
      userId, 
      type: 'year', 
      year: currentYear 
    });
    
    if (!yearFolder) {
      // Create root folder if it doesn't exist
      let rootFolder = await Folder.findOne({ 
        userId, 
        type: 'root', 
        parentId: null 
      });
      
      if (!rootFolder) {
        rootFolder = new Folder({
          name: 'Root',
          path: 'Root',
          parentId: null,
          userId,
          type: 'root'
        });
        await rootFolder.save();
      }
      
      // Create year folder
      yearFolder = new Folder({
        name: currentYear.toString(),
        path: `Root/${currentYear}`,
        parentId: rootFolder._id,
        userId,
        type: 'year',
        year: currentYear
      });
      
      await yearFolder.save();
      await yearFolder.populate('parentId', 'name path');
    }
    
    res.json({ folder: yearFolder });
  } catch (error) {
    console.error("Error ensuring year folder:", error);
    res.status(500).json({ message: "Failed to ensure year folder" });
  }
});

// Update folder
router.put("/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }
    
    const folder = await Folder.findOne({ _id: id, userId });
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }
    
    // Don't allow renaming root or year folders
    if (folder.type === 'root' || folder.type === 'year') {
      return res.status(400).json({ message: "Cannot rename system folders" });
    }
    
    // Update path for folder and children
    const oldPath = folder.path;
    const newPath = folder.parentId 
      ? `${folder.parentId.path}/${name}` 
      : name;
    
    folder.name = name;
    folder.path = newPath;
    await folder.save();
    
    // Update paths of all child folders
    await Folder.updateMany(
      { userId, path: { $regex: `^${oldPath}/` } },
      { $set: { path: { $regex: new RegExp(`^${oldPath}/`), $replace: `${newPath}/` } } }
    );
    
    await folder.populate('parentId', 'name path');
    res.json({ folder });
  } catch (error) {
    console.error("Error updating folder:", error);
    res.status(500).json({ message: "Failed to update folder" });
  }
});

// Delete folder
router.delete("/:id", isAuthenticated, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    
    const folder = await Folder.findOne({ _id: id, userId });
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }
    
    // Don't allow deleting root or year folders
    if (folder.type === 'root' || folder.type === 'year') {
      return res.status(400).json({ message: "Cannot delete system folders" });
    }
    
    // Check if folder has projects
    const { Project } = await import("../shared/models");
    const projectsInFolder = await Project.countDocuments({ 
      userId, 
      folderId: id 
    });
    
    if (projectsInFolder > 0) {
      return res.status(400).json({ 
        message: "Cannot delete folder with projects. Move projects first." 
      });
    }
    
    // Delete folder
    await Folder.deleteOne({ _id: id });
    
    res.json({ message: "Folder deleted successfully" });
  } catch (error) {
    console.error("Error deleting folder:", error);
    res.status(500).json({ message: "Failed to delete folder" });
  }
});

export default router;
