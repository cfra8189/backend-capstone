import { User, type IUser } from "../../shared/models/mongoose/User";
import crypto from "crypto";

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

export interface IAuthStorage {
  getUser(id: string): Promise<IUser | null>;
  upsertUser(user: any): Promise<IUser>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<IUser | null> {
    const user = await User.findById(id);
    
    if (user && !user.boxCode) {
      const boxCode = await generateUniqueBoxCode();
      user.boxCode = boxCode;
      await user.save();
    }
    
    return user;
  }

  async upsertUser(userData: any): Promise<IUser> {
    const boxCode = await generateUniqueBoxCode();
    const user = await User.findOneAndUpdate(
      { email: userData.email },
      {
        $set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          displayName: userData.firstName || userData.email,
          boxCode,
          role: "artist",
          emailVerified: true,
        }
      },
      { upsert: true, new: true }
    );
    return user;
  }
}

export const authStorage = new AuthStorage();
