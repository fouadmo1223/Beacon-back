import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { logger } from '../../lib/logger';
import type { DeviceEntity, NotificationEntity, PendingReceipt } from '../types';

export interface DatabaseShape {
  devices: DeviceEntity[];
  notifications: NotificationEntity[];
  /** `${notificationId}:${installationId}` pairs — dedupes the opened counter. */
  opens: string[];
  pendingReceipts: PendingReceipt[];
}

const emptyDatabase = (): DatabaseShape => ({ devices: [], notifications: [], opens: [], pendingReceipts: [] });

/**
 * Minimal JSON-file persistence for local development without a database
 * (and fully in-memory when no file path is given — used by tests).
 */
export class JsonStore {
  private data: DatabaseShape;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string | null;

  constructor(filePath: string | null) {
    this.filePath = filePath ? resolve(process.cwd(), filePath) : null;
    this.data = this.load();
  }

  get state(): DatabaseShape {
    return this.data;
  }

  /** Mutates state and schedules a debounced write to disk. */
  update<T>(mutator: (data: DatabaseShape) => T): T {
    const result = mutator(this.data);
    this.scheduleSave();
    return result;
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.persist();
  }

  private load(): DatabaseShape {
    if (!this.filePath || !existsSync(this.filePath)) return emptyDatabase();
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<DatabaseShape>;
      return { ...emptyDatabase(), ...parsed };
    } catch (error) {
      logger.error('Failed to read data file — starting with an empty database', { error });
      return emptyDatabase();
    }
  }

  private scheduleSave() {
    if (!this.filePath || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persist();
    }, 250);
  }

  private persist() {
    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      renameSync(tmp, this.filePath);
    } catch (error) {
      logger.error('Failed to persist data file', { error });
    }
  }
}
