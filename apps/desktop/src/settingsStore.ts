import { promises as fs } from "node:fs";
import path from "node:path";

interface Settings {
  baseDirectory: string | null;
  lastOpenedDirectory: string | null;
  authToken: string | null;
}

const DEFAULTS: Settings = { baseDirectory: null, lastOpenedDirectory: null, authToken: null };

export class SettingsStore {
  private settings: Settings = { ...DEFAULTS };

  public constructor(private readonly filePath: string) {}

  public async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<Settings>;
      this.settings = { ...DEFAULTS, ...parsed };
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") throw error;
      this.settings = { ...DEFAULTS };
      await this.persist();
    }
  }

  public getBaseDirectory(): string | null {
    return this.settings.baseDirectory;
  }

  public async setBaseDirectory(dir: string): Promise<void> {
    this.settings.baseDirectory = dir;
    await this.persist();
  }

  public getLastOpenedDirectory(): string | null {
    return this.settings.lastOpenedDirectory;
  }

  public async setLastOpenedDirectory(dir: string): Promise<void> {
    this.settings.lastOpenedDirectory = dir;
    await this.persist();
  }

  public getAuthToken(): string | null {
    return this.settings.authToken;
  }

  public async setAuthToken(token: string): Promise<void> {
    this.settings.authToken = token;
    await this.persist();
  }

  public async clearAuthToken(): Promise<void> {
    this.settings.authToken = null;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(this.settings, null, 2), "utf8");
  }
}
