import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { join, extname } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads');

  constructor() {
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async uploadImage(file: Express.Multer.File, folder = 'uploads'): Promise<{ url: string }> {
    const folderPath = join(this.uploadsDir, folder);
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }

    const ext = extname(file.originalname) || '.jpg';
    const filename = `${randomUUID()}${ext}`;
    const filePath = join(folderPath, filename);

    writeFileSync(filePath, file.buffer);

    const url = `/uploads/${folder}/${filename}`;
    return { url };
  }

  async deleteFile(urlOrPath: string): Promise<void> {
    try {
      // Handle both full URLs and relative paths
      const relativePath = urlOrPath.startsWith('/uploads/')
        ? urlOrPath.replace('/uploads/', '')
        : urlOrPath;

      const filePath = join(this.uploadsDir, relativePath);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (error) {
      this.logger.warn(`Failed to delete file ${urlOrPath}: ${error.message}`);
    }
  }
}
