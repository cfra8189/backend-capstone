import { boolean, index, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for platform auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire)
  })
);

// User storage table.
// (IMPORTANT) This table is mandatory for platform auth, don't drop it.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  displayName: varchar("display_name"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 20 }).default("artist"),
  businessName: varchar("business_name"),
  businessBio: text("business_bio"),
  boxCode: varchar("box_code", { length: 12 }).unique(),
  emailVerified: boolean("email_verified").default(false),
  verificationToken: varchar("verification_token"),
  verificationTokenExpires: timestamp("verification_token_expires"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
