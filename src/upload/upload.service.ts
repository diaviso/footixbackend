import { Injectable } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';

@Injectable()
export class UploadService {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  async uploadImage(file: Express.Multer.File, folder = 'uploads'): Promise<{ url: string; publicId: string }> {
    return this.cloudinaryService.uploadImage(file.buffer, folder);
  }

  async deleteFile(publicIdOrUrl: string): Promise<void> {
    const publicId = publicIdOrUrl.startsWith('http')
      ? this.cloudinaryService.extractPublicId(publicIdOrUrl)
      : publicIdOrUrl;
    if (publicId) {
      await this.cloudinaryService.deleteFile(publicId, 'image');
    }
  }
}
