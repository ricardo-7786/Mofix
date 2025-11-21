import path from 'path';
import fs from 'fs-extra';
import { Logger } from './logger.js';

export class FileManager {
  constructor(private logger: Logger) {}

  async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf8');
  }

  async copyFile(source: string, target: string): Promise<void> {
    await fs.ensureDir(path.dirname(target));
    await fs.copy(source, target);
  }

  async deleteFile(filePath: string): Promise<void> {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    return await fs.pathExists(filePath);
  }

  async readJson(filePath: string): Promise<any> {
    return await fs.readJson(filePath);
  }

  async writeJson(filePath: string, data: any): Promise<void> {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, data, { spaces: 2 });
  }
}