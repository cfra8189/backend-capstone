import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Express } from "express";
import { User } from "../shared/models/mongoose/User";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { signRefreshToken } from "../lib/jwt";

function generateBoxCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BOX-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function setupGoogleAuth(app: Express, serverPort?: number) {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    return;
  }

  // Use dynamic callback URL based on server port, fallback to env var or defaults
  const callbackURL = process.env.GOOGLE_CALLBACK_URL ||
    (serverPort 
      ? `http://localhost:${serverPort}/api/auth/google/callback`
      : (process.env.PLATFORM_DEV_DOMAIN
        ? `https://${process.env.PLATFORM_DEV_DOMAIN}/api/auth/google/callback`
        : (process.env.PLATFORM_DOMAINS
          ? `https://${process.env.PLATFORM_DOMAINS.split(",")[0]}/api/auth/google/callback`
          : "http://localhost:5000/api/auth/google/callback")));

  passport.use(new GoogleStrategy({
    clientID,
    clientSecret,
    callbackURL,
    scope: ["profile", "email"],
  }, async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error("No email found in Google profile"));
      }

      const googleId = profile.id;

      let existingUser = await User.findOne({
        $or: [{ email }, { googleId }]
      });

      if (!existingUser) {
        const boxCode = generateBoxCode();
        existingUser = await User.create({
          email,
          displayName: profile.displayName || email,
          firstName: profile.name?.givenName || profile.displayName?.split(" ")[0] || "",
          lastName: profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "",
          profileImageUrl: profile.photos?.[0]?.value || null,
          role: "artist",
          boxCode,
          emailVerified: true,
          googleId,
        });
      } else if (!existingUser.googleId) {
        existingUser.googleId = googleId;
        existingUser.profileImageUrl = existingUser.profileImageUrl || profile.photos?.[0]?.value;
        existingUser.emailVerified = true;
        await existingUser.save();
      }

      return done(null, existingUser);
    } catch (error) {
      console.error("Google auth error:", (error as any)?.message || String(error));
      return done(error);
    }
  }));

  app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  app.get("/api/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/?error=google_auth_failed" }),
    (req: any, res) => {
      const user = req.user;
      const expiresAt = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);
      req.session.passport = {
        user: {
          claims: { sub: user._id.toString() },
          expires_at: expiresAt,
        }
      };
      // Also issue a refresh token cookie for JWT flows (minimal implementation)
      (async () => {
        try {
          const tid = crypto.randomBytes(16).toString("hex");
          const refreshToken = signRefreshToken(user._id.toString(), tid);
          const hash = await bcrypt.hash(refreshToken, 10);
          user.refreshTokenHash = hash;
          await user.save();
          res.cookie("refresh_token", refreshToken, { httpOnly: true, secure: false, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
        } catch (err) {
          console.error("Failed to set refresh token cookie:", (err as any)?.message || String(err));
        }
        res.redirect("/");
      })();
    }
  );

  return true;
}
