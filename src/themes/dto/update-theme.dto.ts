import { IsOptional, IsString, IsInt, Min, IsBoolean } from 'class-validator';

export class UpdateThemeDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  position?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
