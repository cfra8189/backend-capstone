import express from "express";
import { Collaboration, ICollaboration } from "../shared/models/mongoose";
import { isAuthenticated } from "./auth";

const router = express.Router();

// Get all collaborations for a user (both sent and received)
router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const collaborations = await Collaboration.find({
      $or: [
        { ownerId: userId },
        { collaboratorId: userId }
      ]
    })
    .populate('projectId', 'title status')
    .populate('agreementId', 'title')
    .populate('folderId', 'name path')
    .populate('ownerId', 'displayName email boxCode')
    .populate('collaboratorId', 'displayName email boxCode')
    .sort({ createdAt: -1 });
    
    res.json({ collaborations });
  } catch (error) {
    console.error("Error fetching collaborations:", error);
    res.status(500).json({ message: "Failed to fetch collaborations" });
  }
});

// Get pending collaboration requests for a user
router.get("/pending", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const collaborations = await Collaboration.find({
      collaboratorId: userId,
      status: 'pending'
    })
    .populate('projectId', 'title status')
    .populate('agreementId', 'title')
    .populate('folderId', 'name path')
    .populate('ownerId', 'displayName email boxCode')
    .sort({ createdAt: -1 });
    
    res.json({ collaborations });
  } catch (error) {
    console.error("Error fetching pending collaborations:", error);
    res.status(500).json({ message: "Failed to fetch pending collaborations" });
  }
});

// Send collaboration invitation
router.post("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const { 
      projectId, 
      agreementId, 
      folderId, 
      collaboratorBoxId, 
      role, 
      message 
    } = req.body;
    
    // Validate input
    if (!collaboratorBoxId || !role) {
      return res.status(400).json({ message: "Collaborator BOX ID and role are required" });
    }
    
    if (!projectId && !agreementId && !folderId) {
      return res.status(400).json({ message: "Must specify project, agreement, or folder" });
    }
    
    // Find collaborator by BOX ID
    const { User } = await import("../shared/models/mongoose");
    const collaborator = await User.findOne({ boxCode: collaboratorBoxId.toUpperCase() });
    
    if (!collaborator) {
      return res.status(404).json({ message: "User with this BOX ID not found" });
    }
    
    if (collaborator._id.toString() === userId) {
      return res.status(400).json({ message: "Cannot collaborate with yourself" });
    }
    
    // Check if collaboration already exists
    const existingCollaboration = await Collaboration.findOne({
      projectId: projectId || null,
      agreementId: agreementId || null,
      folderId: folderId || null,
      ownerId: userId,
      collaboratorId: collaborator._id
    });
    
    if (existingCollaboration) {
      return res.status(400).json({ message: "Collaboration already exists" });
    }
    
    // Create collaboration
    const collaboration = new Collaboration({
      projectId: projectId || null,
      agreementId: agreementId || null,
      folderId: folderId || null,
      ownerId: userId,
      collaboratorId: collaborator._id,
      collaboratorBoxId: collaboratorBoxId.toUpperCase(),
      role,
      message: message || null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
    
    await collaboration.save();
    await collaboration.populate([
      { path: 'projectId', select: 'title status' },
      { path: 'agreementId', select: 'title' },
      { path: 'folderId', select: 'name path' },
      { path: 'ownerId', select: 'displayName email boxCode' },
      { path: 'collaboratorId', select: 'displayName email boxCode' }
    ]);
    
    res.status(201).json({ collaboration });
  } catch (error) {
    console.error("Error creating collaboration:", error);
    res.status(500).json({ message: "Failed to create collaboration" });
  }
});

// Respond to collaboration request
router.put("/:id/respond", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    
    const collaboration = await Collaboration.findOne({
      _id: id,
      collaboratorId: userId,
      status: 'pending'
    });
    
    if (!collaboration) {
      return res.status(404).json({ message: "Collaboration request not found" });
    }
    
    collaboration.status = status;
    collaboration.respondedAt = new Date();
    await collaboration.save();
    
    await collaboration.populate([
      { path: 'projectId', select: 'title status' },
      { path: 'agreementId', select: 'title' },
      { path: 'folderId', select: 'name path' },
      { path: 'ownerId', select: 'displayName email boxCode' },
      { path: 'collaboratorId', select: 'displayName email boxCode' }
    ]);
    
    res.json({ collaboration });
  } catch (error) {
    console.error("Error responding to collaboration:", error);
    res.status(500).json({ message: "Failed to respond to collaboration" });
  }
});

// Update collaboration role
router.put("/:id/role", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['viewer', 'editor', 'approver'].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    
    const collaboration = await Collaboration.findOne({
      _id: id,
      ownerId: userId
    });
    
    if (!collaboration) {
      return res.status(404).json({ message: "Collaboration not found" });
    }
    
    collaboration.role = role;
    await collaboration.save();
    
    await collaboration.populate([
      { path: 'projectId', select: 'title status' },
      { path: 'agreementId', select: 'title' },
      { path: 'folderId', select: 'name path' },
      { path: 'ownerId', select: 'displayName email boxCode' },
      { path: 'collaboratorId', select: 'displayName email boxCode' }
    ]);
    
    res.json({ collaboration });
  } catch (error) {
    console.error("Error updating collaboration role:", error);
    res.status(500).json({ message: "Failed to update collaboration role" });
  }
});

// Remove collaboration
router.delete("/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const { id } = req.params;
    
    const collaboration = await Collaboration.findOne({
      _id: id,
      $or: [
        { ownerId: userId },
        { collaboratorId: userId }
      ]
    });
    
    if (!collaboration) {
      return res.status(404).json({ message: "Collaboration not found" });
    }
    
    // Only owner can remove active collaborations
    if (collaboration.ownerId.toString() !== userId && collaboration.status === 'accepted') {
      return res.status(403).json({ message: "Only owner can remove active collaborations" });
    }
    
    await Collaboration.deleteOne({ _id: id });
    
    res.json({ message: "Collaboration removed successfully" });
  } catch (error) {
    console.error("Error removing collaboration:", error);
    res.status(500).json({ message: "Failed to remove collaboration" });
  }
});

// Get user by BOX ID (for collaboration search)
router.get("/search/:boxId", isAuthenticated, async (req: any, res) => {
  try {
    const { boxId } = req.params;
    const userId = req.user.claims.sub;
    
    const { User } = await import("../shared/models/mongoose");
    const user = await User.findOne({ 
      boxCode: boxId.toUpperCase(),
      _id: { $ne: userId }
    }).select('displayName email boxCode role');
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json({ user });
  } catch (error) {
    console.error("Error searching for user:", error);
    res.status(500).json({ message: "Failed to search for user" });
  }
});

export default router;
