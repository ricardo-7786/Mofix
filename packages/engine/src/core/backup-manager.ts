import path from 'path';
import fs from 'fs-extra';
import archiver from 'archiver';
import { Logger } from './logger.js';

export class BackupManager {
  private backupDir: string;

  constructor(private logger: Logger) {
    this.backupDir = path.join(process.cwd(), '.dev-migrate-backups');
  }

  async createBackup(projectPath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${timestamp}.zip`;
    const backupPath = path.join(this.backupDir, backupName);

    await fs.ensureDir(this.backupDir);

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(backupPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        this.logger.success(`Backup created: ${backupPath} (${archive.pointer()} bytes)`);
        resolve(backupPath);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      
      // Add all files except node_modules and other common ignore patterns
      archive.glob('**/*', {
        cwd: projectPath,
        ignore: [
          'node_modules/**',
          '.git/**',
          'dist/**',
          'build/**',
          '.next/**',
          '.nuxt/**',
          '*.log',
          '.DS_Store',
          'Thumbs.db'
        ]
      });

      archive.finalize();
    });
  }

  async rollback(projectPath: string): Promise<void> {
    // Find the most recent backup
    const backups = await fs.readdir(this.backupDir);
    const sortedBackups = backups
      .filter(file => file.startsWith('backup-') && file.endsWith('.zip'))
      .sort()
      .reverse();

    if (sortedBackups.length === 0) {
      throw new Error('No backups found for rollback');
    }

    const latestBackup = path.join(this.backupDir, sortedBackups[0]);
    this.logger.info(`Rolling back from: ${latestBackup}`);

    // This is a simplified rollback - in a real implementation,
    // you would extract the backup and restore files
    this.logger.warning('Rollback functionality is simplified in this version');
    this.logger.info(`Manual rollback: extract ${latestBackup} to ${projectPath}`);
  }

  async listBackups(): Promise<string[]> {
    if (!await fs.pathExists(this.backupDir)) {
      return [];
    }

    const backups = await fs.readdir(this.backupDir);
    return backups
      .filter(file => file.startsWith('backup-') && file.endsWith('.zip'))
      .sort()
      .reverse();
  }
}