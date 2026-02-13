import "dotenv/config";
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import http from "http";
import { fileURLToPath } from "url";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", (reason && (reason as any).message) || String(reason));
});

process.on("uncaughtException", (error: any) => {
  console.error("Uncaught Exception:", error?.message || String(error));
});
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./integrations/auth";
import { registerObjectStorageRoutes } from "./integrations/object_storage";
import registerFolderRoutes from "./integrations/folders";
import registerCollaborationRoutes from "./integrations/collaborations";
import registerProfileRoutes from "./integrations/profile";
import passport from "passport";
import session from "express-session";
import cookieParser from "cookie-parser";
import { connectMongoDB } from "./mongodb";
import { setupGoogleAuth } from "./auth/google";
import { User } from "./shared/models/mongoose/User";
import { Project } from "./shared/models/mongoose/Project";
import { CreativeNote } from "./shared/models/mongoose/CreativeNote";
import { SharedContent } from "./shared/models/mongoose/SharedContent";
import { CommunityFavorite } from "./shared/models/mongoose/CommunityFavorite";
import { CommunityComment } from "./shared/models/mongoose/CommunityComment";
import { BlogPost } from "./shared/models/mongoose/BlogPost";
import { StudioArtist } from "./shared/models/mongoose/StudioArtist";
import { PressKit } from "./shared/models/mongoose/PressKit";
import { EmbedCache } from "./shared/models/mongoose/EmbedCache";
import { sendVerificationEmail } from "./lib/email";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
let mongoConnected = false;
let googleConfigured = false;
let passportEnabled = false;

// For local development (when PLATFORM_ID / ISSUER_URL are not set)
// provide a lightweight session and passport initialization so
// OAuth flows like Google OAuth still work.
if (!process.env.PLATFORM_ID && !process.env.ISSUER_URL) {
  app.use(session({
    secret: process.env.SESSION_SECRET || "dev-box-session",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));
  app.use(cookieParser());
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure Passport serialization for sessions
  passport.serializeUser((user: any, done) => {
    done(null, user._id || user);
  });

  passport.deserializeUser(async (id: any, done) => {
    try {
      // Handle both string IDs and session objects
      const userId = typeof id === 'string' ? id : id?.claims?.sub;
      if (!userId) {
        return done(new Error('Invalid user ID'), null);
      }
      const user = await User.findById(userId);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
  // Normalize req.user so routes can use req.user.claims.sub (Mongoose doc has _id, not claims)
  app.use((req: any, _res, next) => {
    if (req.user && req.user._id && !req.user.claims) {
      req.user.claims = { sub: req.user._id.toString() };
    }
    next();
  });
  passportEnabled = true;
}

function toId(doc: any) {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  if (obj._id) {
    obj.id = obj._id.toString();
  }
  return obj;
}

function renderVerificationPage(success: boolean, message: string): string {
  const color = success ? "#c3f53c" : "#ef4444";
  const icon = success ? "✓" : "✗";
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification - The Box</title>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        * { font-family: 'JetBrains Mono', monospace; }
        body { background: #0a0a0a; color: #fff; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { text-align: center; max-width: 400px; padding: 40px; }
        .icon { width: 80px; height: 80px; border-radius: 50%; background: ${color}; color: #000; font-size: 40px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        h1 { color: ${color}; margin-bottom: 10px; }
        p { color: #999; margin-bottom: 30px; }
        a { display: inline-block; background: ${color}; color: #000; font-weight: bold; padding: 15px 40px; text-decoration: none; border-radius: 8px; }
        a:hover { opacity: 0.9; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">${icon}</div>
        <h1>${success ? "Success!" : "Error"}</h1>
        <p>${message}</p>
        <a href="/">Go to The Box</a>
      </div>
    </body>
    </html>
  `;
}

async function main() {
  await connectMongoDB();
  mongoConnected = true;

  app.get("/api/debug/info", (req, res) => {
    res.json({
      hostname: req.hostname,
      host: req.headers.host,
      xForwardedHost: req.headers["x-forwarded-host"],
      xForwardedProto: req.headers["x-forwarded-proto"],
      protocol: req.protocol,
      originalUrl: req.originalUrl,
      nodeEnv: process.env.NODE_ENV,
      hasReplId: !!process.env.REPL_ID,
      hasSessionSecret: !!process.env.SESSION_SECRET,
      hasMongoUri: !!process.env.MONGODB_URI,
    });
  });

  // Simple proxy for oEmbed endpoints to avoid CORS issues from the browser.
  // Clients should call `/api/oembed?url=${encodeURIComponent(oembedUrl)}`
  app.get("/api/oembed", async (req: any, res) => {
    try {
      const target = req.query?.url;
      if (!target) return res.status(400).json({ message: "Missing url parameter" });
      const originalUrl = String(target);

      // 1. Check Cache
      const cached = await EmbedCache.findOne({ url: originalUrl });
      if (cached && cached.expiresAt > new Date()) {
        res.setHeader("Content-Type", "application/json");
        return res.json(cached.data);
      }

      // 2. Fetch Fresh Data
      let responseData: any = null;
      let provider = "unknown";

      const initialResp = await fetch(originalUrl, { headers: { "User-Agent": "TheBox/1.0" }, redirect: "follow" });
      const finalUrl = initialResp.url || originalUrl;
      const initialContentType = initialResp.headers.get("content-type") || "";

      if (/\b(pin\.it|pinterest)\b/i.test(finalUrl)) {
        provider = "pinterest";
        try {
          const pinterestOembed = `https://widgets.pinterest.com/oembed.json/?url=${encodeURIComponent(finalUrl)}`;
          const oeResp = await fetch(pinterestOembed, { headers: { "User-Agent": "TheBox/1.0" } });
          const oeContentType = oeResp.headers.get("content-type") || "";
          if (oeResp.ok && oeContentType.includes("application/json")) {
            responseData = await oeResp.json();
          }
        } catch (e) { /* ignore */ }

        if (!responseData) {
          const html = await initialResp.text();
          // Extract from JSON-LD or meta tags (existing logic)
          const ldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
          let match;
          while ((match = ldRegex.exec(html)) !== null) {
            try {
              const parsed = JSON.parse(match[1]);
              const maybeImage = (function findImage(obj: any): string | null {
                if (!obj || typeof obj !== 'object') return null;
                if (typeof obj.image === 'string') return obj.image;
                if (obj.images_orig && typeof obj.images_orig.url === 'string') return obj.images_orig.url;
                if (obj.imageLargeUrl && typeof obj.imageLargeUrl === 'string') return obj.imageLargeUrl;
                for (const k of Object.keys(obj)) {
                  try {
                    const found = findImage(obj[k]);
                    if (found) return found;
                  } catch (e) { /* ignore */ }
                }
                return null;
              })(parsed);
              if (maybeImage) {
                responseData = { thumbnail_url: maybeImage, source: "json-ld" };
                break;
              }
            } catch (e) { /* ignore */ }
          }

          if (!responseData) {
            const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i);
            if (m && m[1]) {
              responseData = { thumbnail_url: m[1], source: "og" };
            }
          }
        }
      } else {
        // Default behavior for other providers
        if (initialContentType.includes("application/json")) {
          responseData = await initialResp.json();
          provider = responseData.provider_name || "json";
        } else {
          const text = await initialResp.text();
          responseData = { html: text, contentType: initialContentType };
        }
      }

      if (!responseData) {
        return res.status(404).json({ message: "Failed to resolve embed data" });
      }

      // 3. Save to Cache (expire in 7 days)
      try {
        await EmbedCache.findOneAndUpdate(
          { url: originalUrl },
          {
            data: responseData,
            provider,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          },
          { upsert: true }
        );
      } catch (e) {
        console.error("Cache save error:", e);
      }

      res.setHeader("Content-Type", "application/json");
      return res.json(responseData);
    } catch (err) {
      console.error("oEmbed proxy error:", err);
      res.status(500).json({ message: "Failed to proxy oEmbed" });
    }
  });

  // Only set up platform-specific integrations (OIDC, object storage)
  // when the environment provides PLATFORM_ID or ISSUER_URL. This allows
  // running the server locally without Replit/platform services configured.
  if (process.env.PLATFORM_ID || process.env.ISSUER_URL) {
    await setupAuth(app);
    registerAuthRoutes(app);
    registerObjectStorageRoutes(app);
    app.use("/api/folders", registerFolderRoutes);
    app.use("/api/collaborations", registerCollaborationRoutes);
    app.use("/api/profile", registerProfileRoutes);
  } else {
    // Platform integrations disabled in local dev — no startup note added
  }

  // Configure Google OAuth if credentials are present (works in dev with local session above)
  try {
    // setupGoogleAuth will return early if GOOGLE_CLIENT_ID/SECRET are not set
    const { setupGoogleAuth } = await import("./auth/google");
    // We'll set up Google OAuth after we know the actual port
    googleConfigured = true; // Mark as configured, will be set up after server starts
  } catch (err) {
    console.error("Failed to configure Google OAuth:", err);
  }

  app.post("/api/auth/change-password", isAuthenticated, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.claims.sub;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.passwordHash) {
        return res.status(400).json({ message: "Account uses OAuth login - password cannot be changed" });
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await User.findByIdAndUpdate(userId, { passwordHash: newPasswordHash });

      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.post("/api/auth/update-profile", isAuthenticated, async (req: any, res) => {
    try {
      const { displayName } = req.body;
      const userId = req.user.claims.sub;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      await User.findByIdAndUpdate(userId, {
        displayName: displayName || null,
        firstName: displayName || null,
        updatedAt: new Date()
      });

      res.json({ success: true, message: "Profile updated successfully" });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  async function generateUniqueBoxCode(): Promise<string> {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let attempts = 0;
    while (attempts < 10) {
      let code = "BOX-";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await User.findOne({ boxCode: code });
      if (!existing) {
        return code;
      }
      attempts++;
    }
    return "BOX-" + crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
  }

  app.post("/api/auth/register", async (req: any, res) => {
    try {
      const { email, password, displayName, firstName, lastName, role, businessName, studioCode } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (!displayName) {
        return res.status(400).json({ message: "Name is required" });
      }

      if (role === "studio" && !businessName) {
        return res.status(400).json({ message: "Business name is required for studios" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      let studioToJoin: any = null;
      if (studioCode && role === "artist") {
        const studio = await User.findOne({ boxCode: studioCode.toUpperCase() });
        if (!studio || studio.role !== "studio") {
          return res.status(400).json({ message: "Invalid studio code" });
        }
        studioToJoin = studio;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const verificationToken = crypto.randomBytes(32).toString("hex");
      const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const boxCode = await generateUniqueBoxCode();

      const user = await User.create({
        email,
        passwordHash,
        displayName,
        firstName: firstName || null,
        lastName: lastName || null,
        role: role || "artist",
        businessName: role === "studio" ? businessName : null,
        boxCode,
        emailVerified: false,
        verificationToken,
        verificationTokenExpires,
      });

      if (studioToJoin && user) {
        await StudioArtist.create({
          studioId: studioToJoin._id,
          artistId: user._id,
          inviteEmail: email,
          status: "accepted",
          acceptedAt: new Date(),
        });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      await sendVerificationEmail(email, verificationToken, baseUrl);

      res.json({
        success: true,
        needsVerification: true,
        message: studioToJoin
          ? `Account created and joined ${studioToJoin.businessName || studioToJoin.displayName}'s network. Please check your email to verify.`
          : "Please check your email to verify your account"
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.get("/api/auth/verify", async (req: any, res) => {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(400).send(renderVerificationPage(false, "Invalid verification link"));
      }

      const user = await User.findOne({ verificationToken: token as string });

      if (!user) {
        return res.status(400).send(renderVerificationPage(false, "Invalid or expired verification link"));
      }

      if (user.verificationTokenExpires && new Date() > user.verificationTokenExpires) {
        return res.status(400).send(renderVerificationPage(false, "Verification link has expired"));
      }

      await User.findByIdAndUpdate(user._id, {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpires: null,
      });

      res.send(renderVerificationPage(true, "Your email has been verified!"));
    } catch (error) {
      console.error("Verification error:", error?.message || String(error));
      res.status(500).send(renderVerificationPage(false, "Verification failed"));
    }
  });

  app.post("/api/auth/resend-verification", async (req: any, res) => {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.json({ success: true });
      }

      if (user.emailVerified === true) {
        return res.json({ success: true, message: "Email already verified" });
      }

      const verificationToken = crypto.randomBytes(32).toString("hex");
      const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await User.findByIdAndUpdate(user._id, { verificationToken, verificationTokenExpires });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      await sendVerificationEmail(email, verificationToken, baseUrl);

      res.json({ success: true, message: "Verification email sent" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to resend verification email" });
    }
  });

  // Development helper: auto-verify a user's email (only enabled in non-production local dev)
  if (process.env.NODE_ENV !== 'production' && !process.env.PLATFORM_ID) {
    app.post('/api/auth/dev/verify', async (req: any, res) => {
      try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'email is required' });
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'user not found' });
        user.emailVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpires = null;
        await user.save();
        return res.json({ success: true, message: 'User verified (dev)' });
      } catch (err) {
        console.error('Dev verify error:', err);
        res.status(500).json({ message: 'failed' });
      }
    });
  }

  app.post("/api/auth/login", async (req: any, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await User.findOne({ email });
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (user.emailVerified !== true) {
        return res.status(403).json({
          message: "Please verify your email before logging in",
          needsVerification: true,
          email: user.email
        });
      }

      const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
      req.session.passport = {
        user: {
          claims: { sub: user._id.toString() },
          expires_at: expiresAt,
        }
      };
      // Issue minimal JWT refresh token and set cookie
      try {
        const { signRefreshToken } = await import("./lib/jwt");
        const bcrypt = (await import("bcryptjs")).default;
        const tid = (await import("crypto")).randomBytes(16).toString("hex");
        const refreshToken = signRefreshToken(user._id.toString(), tid);
        const hash = await bcrypt.hash(refreshToken, 10);
        user.refreshTokenHash = hash;
        await user.save();
        res.cookie("refresh_token", refreshToken, { httpOnly: true, secure: false, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
      } catch (err) {
        console.error("Failed to create refresh token:", err);
      }

      console.log("Login successful for:", email, "session set");
      res.json({ success: true, user: { id: user._id.toString(), email: user.email, firstName: user.firstName, lastName: user.lastName } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Minimal JWT refresh endpoint
  app.post("/api/auth/refresh", async (req: any, res) => {
    try {
      const token = req.cookies?.refresh_token;
      if (!token) return res.status(401).json({ message: "No refresh token" });
      const { verifyRefreshToken, signAccessToken, signRefreshToken } = await import("./lib/jwt");
      const bcrypt = (await import("bcryptjs")).default;
      let payload;
      try { payload = verifyRefreshToken(token); } catch (e) { return res.status(401).json({ message: "Invalid refresh token" }); }
      const user = await User.findById(payload.sub);
      if (!user || !user.refreshTokenHash) return res.status(401).json({ message: "Invalid refresh token" });
      const match = await bcrypt.compare(token, user.refreshTokenHash);
      if (!match) return res.status(401).json({ message: "Refresh token mismatch" });

      // rotate refresh token
      const tid = (await import("crypto")).randomBytes(16).toString("hex");
      const newRefresh = signRefreshToken(user._id.toString(), tid);
      const newHash = await bcrypt.hash(newRefresh, 10);
      user.refreshTokenHash = newHash;
      await user.save();
      res.cookie("refresh_token", newRefresh, { httpOnly: true, secure: false, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });

      const access = signAccessToken(user._id.toString());
      res.json({ accessToken: access });
    } catch (err) {
      console.error("Refresh error:", err);
      res.status(500).json({ message: "Failed to refresh token" });
    }
  });

  app.post("/api/auth/logout", async (req: any, res) => {
    try {
      const token = req.cookies?.refresh_token;
      if (token) {
        try {
          const payload = (await import("./lib/jwt")).verifyRefreshToken(token);
          const user = await User.findById(payload.sub);
          if (user) {
            user.refreshTokenHash = null;
            await user.save();
          }
        } catch (e) { /* ignore */ }
      }
      res.clearCookie("refresh_token");
      if (req.session) req.session.destroy(() => { });
      res.json({ success: true });
    } catch (err) {
      console.error("Logout error:", err);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Browser GET fallback for `/api/logout` (some frontend anchors use GET)
  app.get("/api/logout", async (req: any, res) => {
    try {
      const token = req.cookies?.refresh_token;
      if (token) {
        try {
          const payload = (await import("./lib/jwt")).verifyRefreshToken(token);
          const user = await User.findById(payload.sub);
          if (user) {
            user.refreshTokenHash = null;
            await user.save();
          }
        } catch (e) { /* ignore */ }
      }
      res.clearCookie("refresh_token");
      if (req.session) req.session.destroy(() => { });
      return res.redirect('/');
    } catch (err) {
      console.error("Logout GET error:", err);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  app.get("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userProjects = await Project.find({ userId }).sort({ createdAt: -1 });
      res.json({ projects: userProjects.map(toId) });
    } catch (error) {
      console.error("Failed to fetch projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { title, type, status, description, metadata } = req.body;
      
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
      });
      res.json({ project: toId(project) });
    } catch (error) {
      console.error("Failed to create project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req: any, res) => {
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

  app.put("/api/projects/:id", isAuthenticated, async (req: any, res) => {
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

  app.delete("/api/projects/:id", isAuthenticated, async (req: any, res) => {
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

  app.get("/api/creative/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const notes = await CreativeNote.find({ userId }).sort({ sortOrder: 1, createdAt: 1 });
      res.json({
        notes: notes.map(n => {
          const obj = toId(n);
          return {
            ...obj,
            is_pinned: !!n.isPinned,
            tags: n.tags || [],
            sort_order: n.sortOrder ?? 0,
            media_url: Array.isArray(n.mediaUrls) && n.mediaUrls.length > 0 ? n.mediaUrls[0] : null
          };
        })
      });
    } catch (error) {
      console.error("Failed to fetch notes:", error);
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  app.post("/api/creative/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { category, content, media_url, tags } = req.body;

      const maxNote = await CreativeNote.findOne({ userId }).sort({ sortOrder: -1 });
      const nextSortOrder = (maxNote?.sortOrder ?? -1) + 1;

      const note = await CreativeNote.create({
        userId,
        category: category || "ideas",
        content,
        mediaUrls: media_url ? [media_url] : [],
        tags: tags || [],
        sortOrder: nextSortOrder,
      });
      const obj = toId(note);
      res.json({ note: { ...obj, is_pinned: false, tags: note.tags || [], media_url: media_url || null, sort_order: note.sortOrder } });
    } catch (error) {
      console.error("Failed to create note:", error);
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  app.put("/api/creative/notes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const existing = await CreativeNote.findById(req.params.id);
      if (!existing || existing.userId.toString() !== userId) {
        return res.status(404).json({ message: "Note not found" });
      }
      const { category, content, media_url, tags } = req.body;
      const existingUrls = Array.isArray(existing.mediaUrls) ? existing.mediaUrls : [];
      const note = await CreativeNote.findByIdAndUpdate(req.params.id, {
        category: category || existing.category,
        content: content || existing.content,
        mediaUrls: media_url !== undefined ? (media_url ? [media_url] : []) : existingUrls,
        tags: tags || existing.tags,
        updatedAt: new Date(),
      }, { new: true });
      const obj = toId(note);
      const returnUrl = Array.isArray(note!.mediaUrls) && note!.mediaUrls.length > 0 ? note!.mediaUrls[0] : null;
      res.json({ note: { ...obj, is_pinned: !!note!.isPinned, tags: note!.tags || [], media_url: returnUrl } });
    } catch (error) {
      console.error("Failed to update note:", error);
      res.status(500).json({ message: "Failed to update note" });
    }
  });

  app.delete("/api/creative/notes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const existing = await CreativeNote.findById(req.params.id);
      if (!existing || existing.userId.toString() !== userId) {
        return res.status(404).json({ message: "Note not found" });
      }
      await CreativeNote.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete note:", error);
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  app.post("/api/creative/notes/:id/pin", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const existing = await CreativeNote.findById(req.params.id);
      if (!existing || existing.userId.toString() !== userId) {
        return res.status(404).json({ message: "Note not found" });
      }
      const note = await CreativeNote.findByIdAndUpdate(req.params.id, {
        isPinned: !existing.isPinned
      }, { new: true });
      const obj = toId(note);
      res.json({ note: { ...obj, is_pinned: !!note!.isPinned } });
    } catch (error) {
      console.error("Failed to toggle pin:", error);
      res.status(500).json({ message: "Failed to toggle pin" });
    }
  });

  app.post("/api/creative/notes/reorder", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { noteIds } = req.body;

      if (!Array.isArray(noteIds)) {
        return res.status(400).json({ message: "noteIds must be an array" });
      }

      const userNotes = await CreativeNote.find({ userId }, '_id');
      const userNoteIds = new Set(userNotes.map(n => n._id.toString()));

      for (const id of noteIds) {
        if (!userNoteIds.has(id.toString())) {
          return res.status(403).json({ message: "Unauthorized: Note does not belong to user" });
        }
      }

      const updates = noteIds.map((id: string, index: number) =>
        CreativeNote.updateOne({ _id: id, userId }, { sortOrder: index })
      );
      await Promise.all(updates);

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to reorder notes:", error);
      res.status(500).json({ message: "Failed to reorder notes" });
    }
  });

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  function isAdmin(req: any, res: any, next: any) {
    if (req.session?.isAdmin) {
      next();
    } else {
      res.status(401).json({ message: "Admin access required" });
    }
  }

  app.get("/api/admin/check", (req: any, res) => {
    if (req.session?.isAdmin) {
      res.json({ isAdmin: true });
    } else {
      res.status(401).json({ isAdmin: false });
    }
  });

  app.post("/api/admin/login", (req: any, res) => {
    const { password } = req.body;
    if (!ADMIN_PASSWORD) {
      return res.status(500).json({ message: "Admin password not configured" });
    }
    if (password === ADMIN_PASSWORD) {
      req.session.isAdmin = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ message: "Invalid password" });
    }
  });

  app.post("/api/admin/logout", (req: any, res) => {
    req.session.isAdmin = false;
    res.json({ success: true });
  });

  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const allUsers = await User.find().sort({ createdAt: -1 });
      res.json(allUsers.map(toId));
    } catch (error) {
      console.error("Failed to fetch users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/projects", isAdmin, async (req, res) => {
    try {
      const allProjects = await Project.find().sort({ createdAt: -1 });
      res.json(allProjects.map(toId));
    } catch (error) {
      console.error("Failed to fetch projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/admin/stats", isAdmin, async (req, res) => {
    try {
      const totalUsers = await User.countDocuments();
      const allProjects = await Project.find();

      const projectsByStatus: Record<string, number> = {};
      allProjects.forEach(p => {
        projectsByStatus[p.status] = (projectsByStatus[p.status] || 0) + 1;
      });

      res.json({
        totalUsers,
        totalProjects: allProjects.length,
        projectsByStatus,
      });
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.post("/api/community/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { noteId } = req.body;

      const note = await CreativeNote.findById(noteId);
      if (!note || note.userId.toString() !== userId) {
        return res.status(404).json({ message: "Note not found" });
      }

      const existing = await SharedContent.findOne({ noteId });
      if (existing) {
        return res.status(400).json({ message: "Note already submitted for sharing", status: existing.status });
      }

      const submission = await SharedContent.create({
        noteId,
        userId,
        status: "pending",
      });

      res.json({ submission: toId(submission) });
    } catch (error) {
      console.error("Failed to submit for sharing:", error);
      res.status(500).json({ message: "Failed to submit for sharing" });
    }
  });

  app.get("/api/community/my-submissions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const submissions = await SharedContent.find({ userId });
      res.json({ submissions: submissions.map(toId) });
    } catch (error) {
      console.error("Failed to fetch submissions:", error);
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  app.get("/api/admin/submissions", isAdmin, async (req, res) => {
    try {
      const submissions = await SharedContent.find().sort({ createdAt: -1 }).populate('noteId');
      const result = submissions.map(sub => {
        const subObj = toId(sub);
        const note = sub.noteId as any;
        return {
          id: subObj.id,
          noteId: note?._id?.toString() || subObj.noteId,
          userId: subObj.userId,
          status: subObj.status,
          adminNotes: subObj.adminNotes,
          createdAt: subObj.createdAt,
          approvedAt: subObj.approvedAt,
          noteContent: note?.content || null,
          noteCategory: note?.category || null,
          noteMediaUrls: note?.mediaUrls || null,
          noteTags: note?.tags || null,
        };
      });
      res.json({ submissions: result });
    } catch (error) {
      console.error("Failed to fetch submissions:", error);
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  app.post("/api/admin/submissions/:id/review", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Status must be 'approved' or 'rejected'" });
      }

      const updated = await SharedContent.findByIdAndUpdate(id, {
        status,
        adminNotes,
        approvedAt: status === "approved" ? new Date() : null,
      }, { new: true });

      res.json({ submission: toId(updated) });
    } catch (error) {
      console.error("Failed to review submission:", error);
      res.status(500).json({ message: "Failed to review submission" });
    }
  });

  app.get("/api/community", async (req, res) => {
    try {
      const approved = await SharedContent.find({ status: "approved" }).sort({ approvedAt: -1 }).populate('noteId');

      const result = await Promise.all(approved.map(async (item) => {
        const note = item.noteId as any;
        const itemObj = toId(item);
        const favoritesCount = await CommunityFavorite.countDocuments({ sharedContentId: item._id });
        const commentsCount = await CommunityComment.countDocuments({ sharedContentId: item._id });
        return {
          id: itemObj.id,
          noteId: note?._id?.toString() || itemObj.noteId,
          userId: itemObj.userId,
          approvedAt: itemObj.approvedAt,
          noteContent: note?.content || null,
          noteCategory: note?.category || null,
          noteMediaUrls: note?.mediaUrls || null,
          noteTags: note?.tags || null,
          favoritesCount,
          commentsCount,
        };
      }));

      res.json({ content: result });
    } catch (error) {
      console.error("Failed to fetch community content:", error);
      res.status(500).json({ message: "Failed to fetch community content" });
    }
  });

  app.post("/api/community/:id/favorite", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sharedContentId = req.params.id;

      const existing = await CommunityFavorite.findOne({ sharedContentId, userId });

      if (existing) {
        await CommunityFavorite.findByIdAndDelete(existing._id);
        res.json({ favorited: false });
      } else {
        await CommunityFavorite.create({
          sharedContentId,
          userId,
        });
        res.json({ favorited: true });
      }
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
      res.status(500).json({ message: "Failed to toggle favorite" });
    }
  });

  app.post("/api/community/:id/comment", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sharedContentId = req.params.id;
      const { content } = req.body;

      if (!content?.trim()) {
        return res.status(400).json({ message: "Comment content is required" });
      }

      const comment = await CommunityComment.create({
        sharedContentId,
        userId,
        content: content.trim(),
      });

      res.json({ comment: toId(comment) });
    } catch (error) {
      console.error("Failed to add comment:", error);
      res.status(500).json({ message: "Failed to add comment" });
    }
  });

  app.get("/api/community/:id/comments", async (req, res) => {
    try {
      const sharedContentId = req.params.id;
      const comments = await CommunityComment.find({ sharedContentId }).sort({ createdAt: -1 });
      res.json({ comments: comments.map(toId) });
    } catch (error) {
      console.error("Failed to fetch comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.get("/api/community/my-favorites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const favorites = await CommunityFavorite.find({ userId }, 'sharedContentId');
      res.json({ favoriteIds: favorites.map(f => f.sharedContentId.toString()) });
    } catch (error) {
      console.error("Failed to fetch favorites:", error);
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  app.post("/api/admin/blog", isAdmin, async (req: any, res) => {
    try {
      const { sharedContentId, title, content } = req.body;

      if (!title || !content) {
        return res.status(400).json({ message: "Title and content are required" });
      }

      const firstUser = await User.findOne();
      const adminId = firstUser?._id;

      const post = await BlogPost.create({
        sharedContentId: sharedContentId || null,
        title,
        content,
        authorId: adminId,
      });

      if (sharedContentId) {
        await SharedContent.findByIdAndUpdate(sharedContentId, { blogPostId: post._id });
      }

      res.json({ post: toId(post) });
    } catch (error) {
      console.error("Failed to create blog post:", error);
      res.status(500).json({ message: "Failed to create blog post" });
    }
  });

  app.get("/api/blog", async (req, res) => {
    try {
      const posts = await BlogPost.find({ isPublished: true }).sort({ publishedAt: -1 });
      res.json({ posts: posts.map(toId) });
    } catch (error) {
      console.error("Failed to fetch blog posts:", error);
      res.status(500).json({ message: "Failed to fetch blog posts" });
    }
  });

  app.post("/api/admin/blog/:id/publish", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const post = await BlogPost.findById(id);

      if (!post) {
        return res.status(404).json({ message: "Blog post not found" });
      }

      const newStatus = !post.isPublished;
      const updated = await BlogPost.findByIdAndUpdate(id, {
        isPublished: newStatus,
        publishedAt: newStatus ? new Date() : null,
      }, { new: true });

      res.json({ post: toId(updated) });
    } catch (error) {
      console.error("Failed to toggle publish:", error);
      res.status(500).json({ message: "Failed to toggle publish" });
    }
  });

  app.get("/api/studio/artists", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await User.findById(userId);

      if (user?.role !== "studio") {
        return res.status(403).json({ message: "Studio access only" });
      }

      const relations = await StudioArtist.find({ studioId: userId });

      const artistsWithInfo = await Promise.all(relations.map(async (rel) => {
        if (rel.artistId) {
          const artist = await User.findById(rel.artistId);
          const artistProjects = await Project.find({ userId: rel.artistId });
          return {
            id: rel._id.toString(),
            artistId: rel.artistId.toString(),
            inviteEmail: rel.inviteEmail,
            status: rel.status,
            createdAt: rel.createdAt,
            acceptedAt: rel.acceptedAt,
            artistName: artist?.displayName || artist?.email || "Unknown",
            artistEmail: artist?.email,
            projectCount: artistProjects.length,
          };
        }
        return {
          id: rel._id.toString(),
          artistId: null,
          inviteEmail: rel.inviteEmail,
          status: rel.status,
          createdAt: rel.createdAt,
          acceptedAt: null,
          artistName: null,
          artistEmail: rel.inviteEmail,
          projectCount: 0,
        };
      }));

      res.json({ artists: artistsWithInfo });
    } catch (error) {
      console.error("Failed to fetch artists:", error);
      res.status(500).json({ message: "Failed to fetch artists" });
    }
  });

  app.post("/api/studio/invite", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { email } = req.body;

      const user = await User.findById(userId);
      if (user?.role !== "studio") {
        return res.status(403).json({ message: "Studio access only" });
      }

      const existingArtist = await User.findOne({ email });

      if (existingArtist) {
        const existingRelation = await StudioArtist.findOne({
          studioId: userId,
          artistId: existingArtist._id
        });

        if (existingRelation) {
          return res.status(400).json({ message: "Artist already in your roster" });
        }

        await StudioArtist.create({
          studioId: userId,
          artistId: existingArtist._id,
          status: "pending",
          inviteEmail: email,
        });
      } else {
        const existingInvite = await StudioArtist.findOne({
          studioId: userId,
          inviteEmail: email
        });

        if (existingInvite) {
          return res.status(400).json({ message: "Invitation already sent" });
        }

        await StudioArtist.create({
          studioId: userId,
          artistId: null,
          status: "pending",
          inviteEmail: email,
        });
      }

      res.json({ success: true, message: "Invitation sent" });
    } catch (error) {
      console.error("Failed to invite artist:", error);
      res.status(500).json({ message: "Failed to invite artist" });
    }
  });

  app.get("/api/studio/artists/:artistId/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { artistId } = req.params;

      const user = await User.findById(userId);
      if (user?.role !== "studio") {
        return res.status(403).json({ message: "Studio access only" });
      }

      const relation = await StudioArtist.findOne({
        studioId: userId,
        artistId
      });

      if (!relation || relation.status !== "accepted") {
        return res.status(403).json({ message: "Artist not in your roster" });
      }

      const artistProjects = await Project.find({ userId: artistId }).sort({ updatedAt: -1 });

      res.json({ projects: artistProjects.map(toId) });
    } catch (error) {
      console.error("Failed to fetch artist projects:", error);
      res.status(500).json({ message: "Failed to fetch artist projects" });
    }
  });

  app.post("/api/studio/projects/:projectId/feature", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { projectId } = req.params;
      const { featured } = req.body;

      const user = await User.findById(userId);
      if (user?.role !== "studio") {
        return res.status(403).json({ message: "Studio access only" });
      }

      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const relation = await StudioArtist.findOne({
        studioId: userId,
        artistId: project.userId
      });

      if (!relation || relation.status !== "accepted") {
        return res.status(403).json({ message: "Artist not in your roster" });
      }

      const updated = await Project.findByIdAndUpdate(projectId, {
        isFeatured: featured
      }, { new: true });

      res.json({ project: toId(updated) });
    } catch (error) {
      console.error("Failed to toggle featured:", error);
      res.status(500).json({ message: "Failed to toggle featured" });
    }
  });

  app.delete("/api/studio/artists/:relationId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { relationId } = req.params;

      const user = await User.findById(userId);
      if (user?.role !== "studio") {
        return res.status(403).json({ message: "Studio access only" });
      }

      await StudioArtist.deleteOne({ _id: relationId, studioId: userId });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to remove artist:", error);
      res.status(500).json({ message: "Failed to remove artist" });
    }
  });

  app.get("/api/portfolio/:studioId", async (req, res) => {
    try {
      const { studioId } = req.params;

      const studio = await User.findById(studioId);
      if (!studio || studio.role !== "studio") {
        return res.status(404).json({ message: "Studio not found" });
      }

      const relations = await StudioArtist.find({
        studioId,
        status: "accepted"
      });

      const roster = await Promise.all(relations.map(async (rel) => {
        if (!rel.artistId) return null;
        const artist = await User.findById(rel.artistId);
        const artistProjects = await Project.find({ userId: rel.artistId });
        return {
          id: rel.artistId.toString(),
          displayName: artist?.displayName || "Unknown",
          projectCount: artistProjects.length,
        };
      }));

      const allFeaturedProjects: any[] = [];
      for (const rel of relations) {
        if (!rel.artistId) continue;
        const artistFeatured = await Project.find({
          userId: rel.artistId,
          isFeatured: true
        });
        const artist = await User.findById(rel.artistId);
        for (const proj of artistFeatured) {
          const projObj = toId(proj);
          allFeaturedProjects.push({
            ...projObj,
            artistName: artist?.displayName || "Unknown",
          });
        }
      }

      res.json({
        studio: {
          id: studio._id.toString(),
          businessName: studio.businessName,
          businessBio: studio.businessBio,
          displayName: studio.displayName,
        },
        roster: roster.filter(r => r !== null),
        featuredProjects: allFeaturedProjects,
      });
    } catch (error) {
      console.error("Failed to fetch portfolio:", error);
      res.status(500).json({ message: "Failed to fetch portfolio" });
    }
  });

  app.post("/api/studio/invitations/:invitationId/accept", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { invitationId } = req.params;

      const invitation = await StudioArtist.findById(invitationId);

      if (!invitation) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      const user = await User.findById(userId);
      if (invitation.inviteEmail !== user?.email) {
        return res.status(403).json({ message: "This invitation is not for you" });
      }

      const updated = await StudioArtist.findByIdAndUpdate(invitationId, {
        artistId: userId,
        status: "accepted",
        acceptedAt: new Date(),
      }, { new: true });

      res.json({ success: true, invitation: toId(updated) });
    } catch (error) {
      console.error("Failed to accept invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  app.get("/api/artist/invitations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await User.findById(userId);

      if (!user?.email) {
        return res.json({ invitations: [] });
      }

      const invitations = await StudioArtist.find({
        inviteEmail: user.email,
        status: "pending"
      });

      const invitationsWithStudio = await Promise.all(invitations.map(async (inv) => {
        const studio = await User.findById(inv.studioId);
        return {
          id: inv._id.toString(),
          studioName: studio?.businessName || studio?.displayName || "Unknown Studio",
          createdAt: inv.createdAt,
        };
      }));

      res.json({ invitations: invitationsWithStudio });
    } catch (error) {
      console.error("Failed to fetch invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  app.get("/api/epk", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const epk = await PressKit.findOne({ userId });
      res.json({ epk: epk ? toId(epk) : null });
    } catch (error) {
      console.error("Failed to fetch EPK:", error);
      res.status(500).json({ message: "Failed to fetch EPK" });
    }
  });

  app.post("/api/epk", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const {
        shortBio, mediumBio, longBio, genre, location,
        photoUrls, videoUrls, featuredTracks, achievements, pressQuotes,
        socialLinks, contactEmail, contactName, bookingEmail,
        technicalRider, stagePlot, isPublished
      } = req.body;

      const existing = await PressKit.findOne({ userId });

      if (existing) {
        const updated = await PressKit.findByIdAndUpdate(existing._id, {
          shortBio, mediumBio, longBio, genre, location,
          photoUrls, videoUrls, featuredTracks, achievements, pressQuotes,
          socialLinks, contactEmail, contactName, bookingEmail,
          technicalRider, stagePlot, isPublished,
          updatedAt: new Date()
        }, { new: true });
        res.json({ epk: toId(updated) });
      } else {
        const created = await PressKit.create({
          userId,
          shortBio, mediumBio, longBio, genre, location,
          photoUrls, videoUrls, featuredTracks, achievements, pressQuotes,
          socialLinks, contactEmail, contactName, bookingEmail,
          technicalRider, stagePlot, isPublished
        });
        res.json({ epk: toId(created) });
      }
    } catch (error) {
      console.error("Failed to save EPK:", error);
      res.status(500).json({ message: "Failed to save EPK" });
    }
  });

  // Documents API - save/list/get agreements generated by the Generator UI
  app.post("/api/documents", isAuthenticated, async (req: any, res) => {
    try {
      const { title, templateId, html, metadata, collaborators } = req.body;
      if (!title || !html) return res.status(400).json({ message: "Title and html are required" });
      const { StoredDocument } = await import("./shared/models/mongoose/Document");
      const doc = await StoredDocument.create({
        userId: req.user.claims.sub,
        title,
        templateId: templateId || null,
        html,
        metadata: metadata || {},
        collaborators: collaborators || [],
      });
      res.json({ success: true, document: toId(doc) });
    } catch (err) {
      console.error("Create document error:", err);
      res.status(500).json({ message: "Failed to save document" });
    }
  });

  // List documents with optional search + pagination
  app.get("/api/documents", isAuthenticated, async (req: any, res) => {
    try {
      const { q, page = "1", limit = "20" } = req.query;
      const pg = Math.max(1, parseInt(String(page) || "1"));
      const lim = Math.max(1, Math.min(100, parseInt(String(limit) || "20")));
      const skip = (pg - 1) * lim;
      const { StoredDocument } = await import("./shared/models/mongoose/Document");

      const baseFilter: any = { userId: req.user.claims.sub };
      if (q && String(q).trim()) {
        const re = new RegExp(String(q).trim(), "i");
        baseFilter.$or = [ { title: re }, { "metadata.formData.trackTitle": re }, { "metadata.formData.artistName": re } ];
      }

      const [docs, total] = await Promise.all([
        StoredDocument.find(baseFilter).sort({ createdAt: -1 }).skip(skip).limit(lim),
        StoredDocument.countDocuments(baseFilter)
      ]);

      res.json({ documents: docs.map(toId), total, page: pg, limit: lim });
    } catch (err) {
      console.error("List documents error:", err);
      res.status(500).json({ message: "Failed to list documents" });
    }
  });

  app.get("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { StoredDocument } = await import("./shared/models/mongoose/Document");
      const doc = await StoredDocument.findById(req.params.id);
      if (!doc || doc.userId.toString() !== req.user.claims.sub) return res.status(404).json({ message: "Not found" });
      res.json(toId(doc));
    } catch (err) {
      console.error("Get document error:", err);
      res.status(500).json({ message: "Failed to get document" });
    }
  });

  // Update (rename / update metadata)
  app.put("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { title, metadata } = req.body;
      const { StoredDocument } = await import("./shared/models/mongoose/Document");
      const doc = await StoredDocument.findById(req.params.id);
      if (!doc || doc.userId.toString() !== req.user.claims.sub) return res.status(404).json({ message: "Not found" });
      if (title) doc.title = title;
      if (metadata) doc.metadata = metadata;
      await doc.save();
      res.json({ success: true, document: toId(doc) });
    } catch (err) {
      console.error("Update document error:", err);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  // Delete document
  app.delete("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { StoredDocument } = await import("./shared/models/mongoose/Document");
      const doc = await StoredDocument.findById(req.params.id);
      if (!doc || doc.userId.toString() !== req.user.claims.sub) return res.status(404).json({ message: "Not found" });
      await StoredDocument.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete document error:", err);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  app.get("/api/epk/:boxCode", async (req, res) => {
    try {
      const { boxCode } = req.params;
      const user = await User.findOne({ boxCode: boxCode.toUpperCase() });

      if (!user) {
        return res.status(404).json({ message: "Artist not found" });
      }

      const epk = await PressKit.findOne({ userId: user._id });

      if (!epk || !epk.isPublished) {
        return res.status(404).json({ message: "Press kit not found or not published" });
      }

      const userProjects = await Project.find({ userId: user._id, status: "published" })
        .sort({ createdAt: -1 })
        .limit(10);

      res.json({
        epk: toId(epk),
        artist: {
          id: user._id.toString(),
          displayName: user.displayName,
          profileImageUrl: user.profileImageUrl,
          boxCode: user.boxCode,
        },
        projects: userProjects.map(toId)
      });
    } catch (error) {
      console.error("Failed to fetch public EPK:", error);
      res.status(500).json({ message: "Failed to fetch EPK" });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        role: user.role,
        businessName: user.businessName,
        displayName: user.displayName,
        boxCode: user.boxCode,
        authType: user.authType
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  const possiblePaths = [
    path.resolve(__dirname, "..", "public"),
    path.resolve(__dirname, "..", "dist", "public"),
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(process.cwd(), "wayfinder_app-v2", "dist", "public"),
  ];
  const fs = await import("fs");
  const publicDir = possiblePaths.find(p => fs.existsSync(path.join(p, "index.html")));
  if (publicDir) {
    app.use(express.static(publicDir, { maxAge: "1d" }));

    // SPA Fallback: Serve index.html for any unknown non-API routes
    app.get("*", (req: any, res: any) => {
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ message: "API endpoint not found" });
      }
      res.sendFile(path.join(publicDir, "index.html"));
    });
  } else {
    console.log("No public directory found - serving API only");
  }

  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("Unhandled error:", err?.message || String(err));
    if (!res.headersSent) {
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  const requestedPort = process.env.PORT ? parseInt(process.env.PORT) : 61234;
  const server = http.createServer(app);
  server.on("error", (err: any) => {
    if (err && err.code === "EADDRINUSE") {
      console.log(`Requested port ${requestedPort ?? '(not set)'} is already in use — server not started`);
      process.exit(1);
    }
    console.error("Server error:", err?.message || String(err));
    process.exit(1);
  });
  server.listen(requestedPort ?? 0, "0.0.0.0", async () => {
    const addr: any = server.address();
    const actualPort = addr && addr.port ? addr.port : '(unknown)';

    // Update frontend .env file with the actual backend port
    try {
      const frontendEnvPath = path.join(__dirname, '..', 'frontend', '.env');
      const backendUrl = `http://localhost:${actualPort}`;
      const envContent = `# This file is automatically updated by backend startup
VITE_BACKEND_URL=${backendUrl}
`;
      fs.writeFileSync(frontendEnvPath, envContent);
      console.log(`Updated frontend .env with backend URL: ${backendUrl}`);
    } catch (err) {
      console.error("Failed to update frontend .env:", err);
    }

    // Set up Google OAuth with actual port
    if (googleConfigured) {
      try {
        const { setupGoogleAuth } = await import("./auth/google");
        const enabled = setupGoogleAuth(app, actualPort);
        if (!enabled) googleConfigured = false;
      } catch (err) {
        console.error("Failed to set up Google OAuth after server start:", err);
        googleConfigured = false;
      }
    }

    const parts: string[] = [];
    if (mongoConnected) parts.push("MongoDB connected");
    if (passportEnabled) parts.push("Passport enabled");
    if (googleConfigured) parts.push("Google OAuth configured");
    const summary = parts.length ? ` — ${parts.join(' | ')}` : '';
    console.log(`Server running on port ${actualPort}${summary}`);
  });
}

main().catch((err) => console.error("Startup error:", err?.message || String(err)));