import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadImage(
    buffer: Buffer,
    folder: string,
    filename?: string,
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: filename,
          resource_type: 'image',
          overwrite: true,
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('No result from Cloudinary'));
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }

  async uploadRaw(
    buffer: Buffer,
    folder: string,
    filename: string,
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: filename,
          resource_type: 'raw',
          overwrite: true,
          access_mode: 'public',
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('No result from Cloudinary'));
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }

  async deleteFile(publicId: string, resourceType: 'image' | 'raw' = 'image'): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
      this.logger.warn(`Failed to delete Cloudinary file ${publicId}: ${error.message}`);
    }
  }

  extractPublicId(url: string): string | null {
    try {
      const parts = url.split('/upload/');
      if (parts.length < 2) return null;
      const withVersion = parts[1];
      const withoutVersion = withVersion.replace(/^v\d+\//, '');
      const withoutExtension = withoutVersion.replace(/\.[^/.]+$/, '');
      return withoutExtension;
    } catch {
      return null;
    }
  }
}
