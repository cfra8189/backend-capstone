import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { isAuthenticated } from "./auth";
import { User } from "../shared/models/mongoose";

const router = express.Router();

// Configure multer for profile image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `profile-${req.user.claims.sub}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Upload profile image
router.post("/upload", isAuthenticated, upload.single('profileImage'), async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Update user's profile image URL
    const profileImageUrl = `/uploads/profiles/${req.file.filename}`;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        profileImageUrl,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Delete old profile image if it exists
    if (user.profileImageUrl && user.profileImageUrl !== profileImageUrl) {
      const oldImagePath = path.join(process.cwd(), user.profileImageUrl);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    res.json({
      message: "Profile image uploaded successfully",
      profileImageUrl
    });
  } catch (error) {
    console.error("Error uploading profile image:", error);
    res.status(500).json({ message: "Failed to upload profile image" });
  }
});

// Get profile image
router.get("/image", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      profileImageUrl: user.profileImageUrl
    });
  } catch (error) {
    console.error("Error fetching profile image:", error);
    res.status(500).json({ message: "Failed to fetch profile image" });
  }
});

// Delete profile image
router.delete("/image", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Delete profile image file if it exists
    if (user.profileImageUrl) {
      const imagePath = path.join(process.cwd(), user.profileImageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Update user record
    await User.findByIdAndUpdate(
      userId,
      { 
        profileImageUrl: null,
        updatedAt: new Date()
      }
    );

    res.json({ message: "Profile image deleted successfully" });
  } catch (error) {
    console.error("Error deleting profile image:", error);
    res.status(500).json({ message: "Failed to delete profile image" });
  }
});

export default router;
