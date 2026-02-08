import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Express } from "express";
import { User } from "../shared/models/mongoose/User";
import crypto from "crypto";

function generateBoxCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BOX-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function setupGitHubAuth(app: Express) {
  const clientID = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  
  if (!clientID || !clientSecret) {
    console.log("GitHub OAuth not configured - GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET required");
    return;
  }

  const callbackURL = process.env.GITHUB_CALLBACK_URL || 
    (process.env.PLATFORM_DEV_DOMAIN
      ? `https://${process.env.PLATFORM_DEV_DOMAIN}/api/auth/github/callback`
      : (process.env.PLATFORM_DOMAINS
        ? `https://${process.env.PLATFORM_DOMAINS.split(",")[0]}/api/auth/github/callback`
        : "http://localhost:5000/api/auth/github/callback"));

  passport.use(new GitHubStrategy({
    clientID,
    clientSecret,
    callbackURL,
    scope: ["user:email"],
  }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;
      const githubId = profile.id;
      
      let existingUser = await User.findOne({
        $or: [{ email }, { githubId }]
      });
      
      if (!existingUser) {
        const boxCode = generateBoxCode();
        existingUser = await User.create({
          email,
          displayName: profile.displayName || profile.username,
          firstName: profile.displayName?.split(" ")[0] || profile.username,
          lastName: profile.displayName?.split(" ").slice(1).join(" ") || null,
          profileImageUrl: profile.photos?.[0]?.value || null,
          role: "artist",
          boxCode,
          emailVerified: true,
          githubId,
        });
      } else if (!existingUser.githubId) {
        existingUser.githubId = githubId;
        existingUser.profileImageUrl = existingUser.profileImageUrl || profile.photos?.[0]?.value;
        await existingUser.save();
      }

      return done(null, existingUser);
    } catch (error) {
      console.error("GitHub auth error:", error);
      return done(error);
    }
  }));

  app.get("/api/auth/github", passport.authenticate("github", { scope: ["user:email"] }));

  app.get("/api/auth/github/callback",
    passport.authenticate("github", { failureRedirect: "/?error=github_auth_failed" }),
    (req: any, res) => {
      const user = req.user;
      const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
      req.session.passport = {
        user: {
          claims: { sub: user._id.toString() },
          expires_at: expiresAt,
        }
      };
      res.redirect("/");
    }
  );

  console.log("GitHub OAuth configured");
}
