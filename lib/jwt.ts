import jwt from "jsonwebtoken";
import crypto from "crypto";

const accessSecret = process.env.JWT_ACCESS_SECRET || "dev_access_secret";
const refreshSecret = process.env.JWT_REFRESH_SECRET || "dev_refresh_secret";
const accessExp = process.env.JWT_ACCESS_EXP || "15m";
const refreshExp = process.env.JWT_REFRESH_EXP || "30d";

export function signAccessToken(userId: string) {
  return jwt.sign({ sub: userId }, accessSecret, { expiresIn: accessExp });
}

export function signRefreshToken(userId: string, tid: string) {
  return jwt.sign({ sub: userId, tid }, refreshSecret, { expiresIn: refreshExp });
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, refreshSecret) as any;
}

export function generateTokenId() {
  return crypto.randomBytes(16).toString("hex");
}
