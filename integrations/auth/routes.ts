import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./platformAuth";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (user) {
        res.json({
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          profileImageUrl: user.profileImageUrl,
          role: user.role || "artist",
          businessName: user.businessName || null,
          boxCode: user.boxCode || null,
          authType: user.passwordHash ? "email" : "oauth",
        });
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
