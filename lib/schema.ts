import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const cameraSettings = pgTable("camera_settings", {
  cameraId: text("camera_id").primaryKey(),
  displayName: text("display_name"),
  neighbourhood: text("neighbourhood").notNull(),
  cameraType: text("camera_type").notNull().default("Càmera"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCameraSettingsSchema = createInsertSchema(cameraSettings).omit({
  updatedAt: true,
});

export type InsertCameraSettings = z.infer<typeof insertCameraSettingsSchema>;
export type CameraSettings = typeof cameraSettings.$inferSelect;

export const DEFAULT_CAMERA_TYPES: Record<string, 'Pilona' | 'Càmera'> = {
  'CT10': 'Pilona', 'CT11': 'Pilona', 'CT12': 'Pilona', 'CT13': 'Pilona',
  'CT14': 'Càmera', 'CT15': 'Càmera',
  'CT16': 'Pilona', 'CT17': 'Pilona', 'CT18': 'Pilona', 'CT19': 'Pilona',
  'CT20': 'Càmera', 'CT21': 'Càmera', 'CT22': 'Càmera', 'CT23': 'Càmera',
};

export const CAMERA_DISPLAY_NAMES: Record<string, string> = {
  'CT10': 'c/de Maria Benlliure',
  'CT11': 'c/Joan Fernández i Comas amb c/Lluís Domènech i Montaner',
  'CT12': 'c/Feliu i Codina',
  'CT13': 'c/Ignasi Iglesias',
  'CT14': 'c/Iscle Soler',
  'CT15': 'c/Josep Fiter',
  'CT16': 'c/Doctor Ferran amb c/Cornella Modern',
  'CT17': 'c/Orioles amb c/Cornella Modern',
  'CT18': 'c/Miranda',
  'CT19': 'c/Ermengol Goula (Av. del Parc)',
  'CT20': 'c/Palma Mallorca (Av. Del Parc)',
  'CT21': 'Av. Republica Argentina',
  'CT22': 'c/Mossèn Andreu amb c/dels Catalans',
  'CT23': 'c/Mossèn Andreu amb c/Jacinto Guerrero',
};

export const adminSessions = pgTable("admin_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdminSession = typeof adminSessions.$inferSelect;

export const passwordResets = pgTable("password_resets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: text("used").default("false").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PasswordReset = typeof passwordResets.$inferSelect;

export const adminConfig = pgTable("admin_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AdminConfig = typeof adminConfig.$inferSelect;

export const trafficData = pgTable("traffic_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  camera: text("camera").notNull(),
  datahora: text("datahora").notNull(),
  tipusVehicle: text("tipus_vehicle").notNull(),
  valor: integer("valor").notNull(),
  dateTime: timestamp("date_time").notNull(),
  neighbourhood: text("neighbourhood"),
}, (table) => ({
  cameraDateTimeIdx: uniqueIndex("camera_datetime_vehicle_idx").on(table.camera, table.dateTime, table.tipusVehicle),
}));

export const insertTrafficDataSchema = createInsertSchema(trafficData).omit({
  id: true,
}).extend({
  dateTime: z.union([
    z.date(),
    z.string().transform((str) => new Date(str))
  ]),
});

export type InsertTrafficData = z.infer<typeof insertTrafficDataSchema>;
export type TrafficData = typeof trafficData.$inferSelect;
