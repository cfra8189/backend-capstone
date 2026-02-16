
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User } from "../shared/models/mongoose/User";
import { StudioArtist } from "../shared/models/mongoose/StudioArtist";
import { sendVerificationEmail } from "../lib/email";
import { renderVerificationPage } from "../lib/emailTemplates";
import { isAuthenticated } from "../integrations/auth";
import { signRefreshToken, signAccessToken, verifyRefreshToken } from "../lib/jwt";

const router = express.Router();

// Helper to generate unique box code
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

router.post("/register", async (req: any, res) => {
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

router.get("/verify", async (req: any, res) => {
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
    } catch (error: any) {
        console.error("Verification error:", error?.message || String(error));
        res.status(500).send(renderVerificationPage(false, "Verification failed"));
    }
});

router.post("/resend-verification", async (req: any, res) => {
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

// Development helper
if (process.env.NODE_ENV !== 'production' && !process.env.PLATFORM_ID) {
    router.post('/dev/verify', async (req: any, res) => {
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

router.post("/login", async (req: any, res) => {
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
        const tid = crypto.randomBytes(16).toString("hex");
        const refreshToken = signRefreshToken(user._id.toString(), tid);
        const hash = await bcrypt.hash(refreshToken, 10);
        user.refreshTokenHash = hash;
        await user.save();
        res.cookie("refresh_token", refreshToken, { httpOnly: true, secure: false, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });

        console.log("Login successful for:", email, "session set");
        res.json({ success: true, user: { id: user._id.toString(), email: user.email, firstName: user.firstName, lastName: user.lastName } });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Login failed" });
    }
});

router.post("/refresh", async (req: any, res) => {
    try {
        const token = req.cookies?.refresh_token;
        if (!token) return res.status(401).json({ message: "No refresh token" });

        let payload;
        try { payload = verifyRefreshToken(token); } catch (e) { return res.status(401).json({ message: "Invalid refresh token" }); }

        const user = await User.findById(payload.sub);
        if (!user || !user.refreshTokenHash) return res.status(401).json({ message: "Invalid refresh token" });

        const match = await bcrypt.compare(token, user.refreshTokenHash);
        if (!match) return res.status(401).json({ message: "Refresh token mismatch" });

        // rotate refresh token
        const tid = crypto.randomBytes(16).toString("hex");
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

router.post("/logout", async (req: any, res) => {
    try {
        const token = req.cookies?.refresh_token;
        if (token) {
            try {
                const payload = verifyRefreshToken(token);
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

router.post("/change-password", isAuthenticated, async (req: any, res) => {
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

router.post("/update-profile", isAuthenticated, async (req: any, res) => {
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

export default router;
