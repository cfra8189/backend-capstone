import { pgTable, serial, varchar, text, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("single"),
  status: varchar("status", { length: 50 }).notNull().default("concept"),
  description: text("description"),
  metadata: jsonb("metadata").default({}),
  isFeatured: boolean("is_featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const studioArtists = pgTable("studio_artists", {
  id: serial("id").primaryKey(),
  studioId: integer("studio_id").notNull(),
  artistId: integer("artist_id"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  inviteEmail: varchar("invite_email"),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

export const creativeNotes = pgTable("creative_notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  category: varchar("category", { length: 50 }).notNull().default("ideas"),
  title: varchar("title", { length: 255 }),
  content: text("content").notNull(),
  mediaUrls: jsonb("media_urls").default([]),
  tags: jsonb("tags").default([]),
  isPinned: varchar("is_pinned").default("false"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sharedContent = pgTable("shared_content", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull().references(() => creativeNotes.id),
  userId: integer("user_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  adminNotes: text("admin_notes"),
  blogPostId: integer("blog_post_id"),
  createdAt: timestamp("created_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
});

export const communityFavorites = pgTable("community_favorites", {
  id: serial("id").primaryKey(),
  sharedContentId: integer("shared_content_id").notNull().references(() => sharedContent.id),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const communityComments = pgTable("community_comments", {
  id: serial("id").primaryKey(),
  sharedContentId: integer("shared_content_id").notNull().references(() => sharedContent.id),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  sharedContentId: integer("shared_content_id").references(() => sharedContent.id),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  authorId: integer("author_id").notNull(),
  isPublished: varchar("is_published").default("false"),
  createdAt: timestamp("created_at").defaultNow(),
  publishedAt: timestamp("published_at"),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
export type StudioArtist = typeof studioArtists.$inferSelect;
export type InsertStudioArtist = typeof studioArtists.$inferInsert;
export type CreativeNote = typeof creativeNotes.$inferSelect;
export type InsertCreativeNote = typeof creativeNotes.$inferInsert;
export type SharedContent = typeof sharedContent.$inferSelect;
export type InsertSharedContent = typeof sharedContent.$inferInsert;
export type CommunityFavorite = typeof communityFavorites.$inferSelect;
export type CommunityComment = typeof communityComments.$inferSelect;
export type BlogPost = typeof blogPosts.$inferSelect;

export const pressKits = pgTable("press_kits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  shortBio: text("short_bio"),
  mediumBio: text("medium_bio"),
  longBio: text("long_bio"),
  genre: varchar("genre", { length: 100 }),
  location: varchar("location", { length: 255 }),
  photoUrls: jsonb("photo_urls").default([]),
  videoUrls: jsonb("video_urls").default([]),
  featuredTracks: jsonb("featured_tracks").default([]),
  achievements: jsonb("achievements").default([]),
  pressQuotes: jsonb("press_quotes").default([]),
  socialLinks: jsonb("social_links").default({}),
  contactEmail: varchar("contact_email"),
  contactName: varchar("contact_name"),
  bookingEmail: varchar("booking_email"),
  technicalRider: text("technical_rider"),
  stagePlot: text("stage_plot"),
  isPublished: boolean("is_published").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PressKit = typeof pressKits.$inferSelect;
export type InsertPressKit = typeof pressKits.$inferInsert;
