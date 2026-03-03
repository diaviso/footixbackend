import { IsNotEmpty, IsString, IsInt, Min, IsBoolean, IsOptional } from 'class-validator';

export class CreateThemeDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsInt()
  @Min(1)
  position: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
