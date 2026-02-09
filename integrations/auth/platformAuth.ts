import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import MongoStore from "connect-mongo";
import { authStorage } from "./storage";

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://example.com/oidc"),
      process.env.PLATFORM_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const sessionStore = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI!,
    collectionName: "sessions",
    ttl: sessionTtl / 1000,
  });
  return session({
    secret: process.env.SESSION_SECRET || "box-session-secret-" + (process.env.PLATFORM_ID || "dev"),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: !!process.env.PLATFORM_ID,
      sameSite: process.env.PLATFORM_ID ? "none" as const : "lax" as const,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  console.log("Setting up OIDC with PLATFORM_ID:", process.env.PLATFORM_ID ? "present" : "missing");
  const config = await getOidcConfig();
  console.log("OIDC config loaded successfully");

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `platformauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

    app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`platformauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    const hostname = req.hostname;
    console.log(`OAuth callback received for hostname: ${hostname}`);
    console.log(`Query params: ${JSON.stringify(req.query)}`);
    console.log(`Session ID: ${req.sessionID}`);
    console.log(`Has session: ${!!req.session}`);
    
    try {
      ensureStrategy(hostname);
    } catch (strategyErr: any) {
      console.error("Strategy setup error:", strategyErr?.message);
      return res.redirect("/?error=strategy_setup_failed");
    }
    
    const authMiddleware = passport.authenticate(`platformauth:${hostname}`, (err: any, user: any, info: any) => {
      if (err) {
        console.error("OAuth callback error:", err?.message || err);
        console.error("OAuth callback error stack:", err?.stack);
        return res.redirect("/?error=auth_failed");
      }
      if (!user) {
        console.error("OAuth callback: no user returned, info:", JSON.stringify(info));
        return res.redirect("/api/login");
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          console.error("OAuth login error:", loginErr?.message || loginErr);
          return res.redirect("/?error=login_failed");
        }
        console.log("OAuth login successful for user:", user?.claims?.sub);
        return res.redirect("/");
      });
    });

    try {
      authMiddleware(req, res, (middlewareErr: any) => {
        if (middlewareErr) {
          console.error("OAuth middleware next error:", middlewareErr?.message || middlewareErr);
          console.error("OAuth middleware next stack:", middlewareErr?.stack);
          if (!res.headersSent) {
            return res.redirect("/?error=auth_middleware_error");
          }
        }
      });
    } catch (error: any) {
      console.error("OAuth callback uncaught error:", error?.message || error);
      console.error("OAuth callback uncaught stack:", error?.stack);
      if (!res.headersSent) {
        return res.redirect("/?error=auth_exception");
      }
    }
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy((err) => {
        res.clearCookie('connect.sid');
        res.redirect('/');
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Session/user from dev (Passport + Mongoose) has _id but no claims/expires_at
  if (!user.expires_at) {
    if (user.claims?.sub || user._id) {
      return next();
    }
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
