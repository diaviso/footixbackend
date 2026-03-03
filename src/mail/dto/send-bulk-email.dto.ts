import { IsArray, IsNotEmpty, IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';

export class SendBulkEmailDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  userIds?: string[];

  @IsBoolean()
  @IsOptional()
  sendToAll?: boolean;

  @IsString()
  @IsIn(['all', 'premium', 'free'])
  @IsOptional()
  recipientCategory?: 'all' | 'premium' | 'free';

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  htmlContent: string;

  @IsString()
  @IsOptional()
  signatureImageUrl?: string;
}
