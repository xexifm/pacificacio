import { 
  type User, type InsertUser, type TrafficData, type InsertTrafficData, 
  type CameraSettings, type InsertCameraSettings, type AdminSession, type PasswordReset,
  users, trafficData, cameraSettings, adminSessions, passwordResets, adminConfig,
  CAMERA_DISPLAY_NAMES, DEFAULT_CAMERA_TYPES
} from "@/lib/schema";
import "server-only";
import { createHash } from "crypto";
import { eq, sql, and, lt, gt } from "drizzle-orm";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";

const DEFAULT_CAMERA_MAPPINGS: Record<string, string> = {
  'CT10': 'Pedró', 'CT11': 'Pedró', 'CT12': 'Pedró', 
  'CT13': 'Pedró', 'CT14': 'Pedró', 'CT15': 'Pedró',
  'CT16': 'Gavarra', 'CT17': 'Gavarra', 'CT18': 'Gavarra', 
  'CT19': 'Gavarra', 'CT20': 'Gavarra', 'CT21': 'Gavarra', 
  'CT22': 'Gavarra', 'CT23': 'Gavarra',
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface DataCoverageDetail {
  camera: string;
  date: string;
  totalVehicles: number;
  vehicleBreakdown: Record<string, number>;
}

export interface BollardSettings {
  bollardStartDatePedro: string | null;
  bollardStartDateGavarra: string | null;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  insertTrafficData(data: InsertTrafficData[]): Promise<{ inserted: number; skipped: number }>;
  getAllTrafficData(): Promise<TrafficData[]>;
  getExistingDatesPerCamera(): Promise<Map<string, Set<string>>>;
  getDataCoverage(): Promise<{ camera: string; dates: string[] }[]>;
  getDetailedDataCoverage(): Promise<DataCoverageDetail[]>;
  
  clearAllData(): Promise<{ deleted: number }>;
  refreshDerivedData(): Promise<{ success: boolean }>;
  
  getCameraSettings(): Promise<CameraSettings[]>;
  updateCameraSettings(settings: InsertCameraSettings[]): Promise<void>;
  initializeCameraSettings(): Promise<void>;
  
  getBollardSettings(): Promise<BollardSettings>;
  setBollardSettings(settings: BollardSettings): Promise<void>;
  
  verifyAdminPassword(password: string): Promise<boolean>;
  getAdminPasswordHash(): Promise<string | null>;
  setAdminPasswordHash(hash: string): Promise<void>;
  
  createAdminSession(token: string, expiresAt: Date): Promise<void>;
  validateAdminSession(token: string): Promise<boolean>;
  deleteAdminSession(token: string): Promise<void>;
  cleanExpiredSessions(): Promise<void>;
  
  createPasswordResetToken(token: string, expiresAt: Date): Promise<void>;
  validatePasswordResetToken(token: string): Promise<boolean>;
  markPasswordResetUsed(token: string): Promise<void>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async insertTrafficData(data: InsertTrafficData[]): Promise<{ inserted: number; skipped: number }> {
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    let totalSkipped = 0;
    
    console.log(`[DB] Starting batch insertion of ${data.length} records`);
    const startTime = Date.now();

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(data.length / BATCH_SIZE);
      
      try {
        const result = await db
          .insert(trafficData)
          .values(batch)
          .onConflictDoNothing()
          .returning({ id: trafficData.id });
        
        const inserted = result.length;
        const skipped = batch.length - inserted;
        
        totalInserted += inserted;
        totalSkipped += skipped;
        
        console.log(`[DB] Batch ${batchNumber}/${totalBatches}: inserted ${inserted}, skipped ${skipped} (${i + batch.length}/${data.length} total processed)`);
      } catch (error: any) {
        console.error(`[DB] Error in batch ${batchNumber}:`, error.message);
        throw error;
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[DB] Completed: ${totalInserted} inserted, ${totalSkipped} skipped in ${duration}s`);

    return { inserted: totalInserted, skipped: totalSkipped };
  }

  async getAllTrafficData(): Promise<TrafficData[]> {
    return await db.select().from(trafficData).orderBy(trafficData.dateTime);
  }

  async getExistingDatesPerCamera(): Promise<Map<string, Set<string>>> {
    const allData = await db.select({
      camera: trafficData.camera,
      dateTime: trafficData.dateTime,
    }).from(trafficData);

    const dateMap = new Map<string, Set<string>>();
    
    for (const record of allData) {
      if (!dateMap.has(record.camera)) {
        dateMap.set(record.camera, new Set());
      }
      const dateOnly = record.dateTime.toISOString().split('T')[0];
      dateMap.get(record.camera)!.add(dateOnly);
    }

    return dateMap;
  }

  async getDataCoverage(): Promise<{ camera: string; dates: string[] }[]> {
    const result = await db
      .select({
        camera: trafficData.camera,
        date: sql<string>`DATE(${trafficData.dateTime})`,
      })
      .from(trafficData)
      .groupBy(trafficData.camera, sql`DATE(${trafficData.dateTime})`)
      .orderBy(trafficData.camera, sql`DATE(${trafficData.dateTime})`);

    const coverageMap = new Map<string, string[]>();
    
    for (const record of result) {
      if (!coverageMap.has(record.camera)) {
        coverageMap.set(record.camera, []);
      }
      coverageMap.get(record.camera)!.push(record.date);
    }

    return Array.from(coverageMap.entries()).map(([camera, dates]) => ({
      camera,
      dates,
    }));
  }

  async getDetailedDataCoverage(): Promise<DataCoverageDetail[]> {
    const result = await db
      .select({
        camera: trafficData.camera,
        date: sql<string>`DATE(${trafficData.dateTime})`,
        tipusVehicle: trafficData.tipusVehicle,
        totalValor: sql<number>`SUM(${trafficData.valor})`,
      })
      .from(trafficData)
      .groupBy(trafficData.camera, sql`DATE(${trafficData.dateTime})`, trafficData.tipusVehicle)
      .orderBy(trafficData.camera, sql`DATE(${trafficData.dateTime})`);

    const coverageMap = new Map<string, DataCoverageDetail>();
    
    for (const record of result) {
      const key = `${record.camera}-${record.date}`;
      
      if (!coverageMap.has(key)) {
        coverageMap.set(key, {
          camera: record.camera,
          date: record.date,
          totalVehicles: 0,
          vehicleBreakdown: {},
        });
      }
      
      const coverage = coverageMap.get(key)!;
      const valorNumber = Number(record.totalValor);
      coverage.totalVehicles += valorNumber;
      coverage.vehicleBreakdown[record.tipusVehicle] = valorNumber;
    }

    return Array.from(coverageMap.values());
  }

  async clearAllData(): Promise<{ deleted: number }> {
    console.log('[DB Admin] Starting data deletion...');
    const startTime = Date.now();
    
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(trafficData);
    const totalRecords = Number(countResult[0]?.count || 0);
    
    await db.delete(trafficData);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[DB Admin] Deleted ${totalRecords} records in ${duration}s`);
    
    return { deleted: totalRecords };
  }

  async refreshDerivedData(): Promise<{ success: boolean }> {
    console.log('[DB Admin] Refreshing derived data...');
    const startTime = Date.now();
    
    const cameraMappings = await this.getCameraSettings();
    const mappingLookup = new Map(cameraMappings.map(c => [c.cameraId, c.neighbourhood]));
    
    const allData = await db.select({
      id: trafficData.id,
      camera: trafficData.camera,
      neighbourhood: trafficData.neighbourhood,
    }).from(trafficData);
    
    let updatedCount = 0;
    const BATCH_SIZE = 500;
    
    for (let i = 0; i < allData.length; i += BATCH_SIZE) {
      const batch = allData.slice(i, i + BATCH_SIZE);
      
      for (const record of batch) {
        const correctNeighbourhood = mappingLookup.get(record.camera) || null;
        if (record.neighbourhood !== correctNeighbourhood) {
          await db.update(trafficData)
            .set({ neighbourhood: correctNeighbourhood })
            .where(eq(trafficData.id, record.id));
          updatedCount++;
        }
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[DB Admin] Refreshed derived data in ${duration}s, updated ${updatedCount} records`);
    
    return { success: true };
  }

  async getCameraSettings(): Promise<CameraSettings[]> {
    const settings = await db.select().from(cameraSettings).orderBy(cameraSettings.cameraId);
    
    if (settings.length === 0) {
      await this.initializeCameraSettings();
      return await db.select().from(cameraSettings).orderBy(cameraSettings.cameraId);
    }
    
    return settings;
  }

  async updateCameraSettings(settings: InsertCameraSettings[]): Promise<void> {
    for (const setting of settings) {
      await db.insert(cameraSettings)
        .values({ ...setting, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: cameraSettings.cameraId,
          set: { neighbourhood: setting.neighbourhood, cameraType: setting.cameraType ?? 'Càmera', updatedAt: new Date() },
        });
    }
    console.log(`[DB Admin] Updated ${settings.length} camera settings`);
  }

  async initializeCameraSettings(): Promise<void> {
    const existing = await db.select().from(cameraSettings);
    if (existing.length > 0) {
      // Update existing records with display names and camera types if missing
      for (const setting of existing) {
        const updates: Record<string, string> = {};
        if (!setting.displayName && CAMERA_DISPLAY_NAMES[setting.cameraId]) {
          updates.displayName = CAMERA_DISPLAY_NAMES[setting.cameraId];
        }
        if (!setting.cameraType && DEFAULT_CAMERA_TYPES[setting.cameraId]) {
          updates.cameraType = DEFAULT_CAMERA_TYPES[setting.cameraId];
        }
        if (Object.keys(updates).length > 0) {
          await db.update(cameraSettings)
            .set(updates)
            .where(eq(cameraSettings.cameraId, setting.cameraId));
        }
      }
      return;
    }
    
    const initialSettings = Object.entries(DEFAULT_CAMERA_MAPPINGS).map(([cameraId, neighbourhood]) => ({
      cameraId,
      neighbourhood,
      displayName: CAMERA_DISPLAY_NAMES[cameraId] || null,
      cameraType: DEFAULT_CAMERA_TYPES[cameraId] || 'Càmera',
    }));
    
    await db.insert(cameraSettings).values(initialSettings);
    console.log('[DB Admin] Initialized default camera settings with display names and types');
  }

  async getBollardSettings(): Promise<BollardSettings> {
    const pedroResult = await db.select().from(adminConfig).where(eq(adminConfig.key, 'bollard_start_date_pedro'));
    const gavarraResult = await db.select().from(adminConfig).where(eq(adminConfig.key, 'bollard_start_date_gavarra'));
    
    return {
      bollardStartDatePedro: pedroResult[0]?.value || null,
      bollardStartDateGavarra: gavarraResult[0]?.value || null,
    };
  }

  async setBollardSettings(settings: BollardSettings): Promise<void> {
    if (settings.bollardStartDatePedro !== null) {
      await db.insert(adminConfig)
        .values({ key: 'bollard_start_date_pedro', value: settings.bollardStartDatePedro, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: adminConfig.key,
          set: { value: settings.bollardStartDatePedro, updatedAt: new Date() },
        });
    }
    
    if (settings.bollardStartDateGavarra !== null) {
      await db.insert(adminConfig)
        .values({ key: 'bollard_start_date_gavarra', value: settings.bollardStartDateGavarra, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: adminConfig.key,
          set: { value: settings.bollardStartDateGavarra, updatedAt: new Date() },
        });
    }
    
    console.log('[DB Admin] Updated bollard settings:', settings);
  }

  async verifyAdminPassword(password: string): Promise<boolean> {
    const storedHash = await this.getAdminPasswordHash();
    
    if (!storedHash) {
      const envPassword = process.env.ADMIN_PASSWORD || 'CORNELLA';
      if (password === envPassword) {
        const hash = await bcrypt.hash(envPassword, 10);
        await this.setAdminPasswordHash(hash);
        return true;
      }
      return false;
    }
    
    return await bcrypt.compare(password, storedHash);
  }

  async getAdminPasswordHash(): Promise<string | null> {
    const result = await db.select().from(adminConfig).where(eq(adminConfig.key, 'admin_password_hash'));
    return result[0]?.value || null;
  }

  async setAdminPasswordHash(hash: string): Promise<void> {
    await db.insert(adminConfig)
      .values({ key: 'admin_password_hash', value: hash, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: adminConfig.key,
        set: { value: hash, updatedAt: new Date() },
      });
    console.log('[DB Admin] Updated admin password hash');
  }

  async createAdminSession(token: string, expiresAt: Date): Promise<void> {
    const tokenHash = hashToken(token);
    await db.insert(adminSessions).values({ tokenHash, expiresAt });
    console.log('[DB Admin] Created new admin session');
  }

  async validateAdminSession(token: string): Promise<boolean> {
    const tokenHash = hashToken(token);
    const result = await db.select().from(adminSessions)
      .where(and(
        eq(adminSessions.tokenHash, tokenHash),
        gt(adminSessions.expiresAt, new Date())
      ));
    return result.length > 0;
  }

  async deleteAdminSession(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    await db.delete(adminSessions).where(eq(adminSessions.tokenHash, tokenHash));
    console.log('[DB Admin] Deleted admin session');
  }

  async cleanExpiredSessions(): Promise<void> {
    await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
  }

  async createPasswordResetToken(token: string, expiresAt: Date): Promise<void> {
    const tokenHash = hashToken(token);
    await db.insert(passwordResets).values({ tokenHash, expiresAt });
    console.log('[DB Admin] Created password reset token');
  }

  async validatePasswordResetToken(token: string): Promise<boolean> {
    const tokenHash = hashToken(token);
    const result = await db.select().from(passwordResets)
      .where(and(
        eq(passwordResets.tokenHash, tokenHash),
        gt(passwordResets.expiresAt, new Date()),
        eq(passwordResets.used, 'false')
      ));
    return result.length > 0;
  }

  async markPasswordResetUsed(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    await db.update(passwordResets)
      .set({ used: 'true' })
      .where(eq(passwordResets.tokenHash, tokenHash));
    console.log('[DB Admin] Marked password reset token as used');
  }
}

export const storage = new DbStorage();
