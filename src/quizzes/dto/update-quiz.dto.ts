import { IsOptional, IsString, IsEnum, IsInt, IsBoolean, Min, Max } from 'class-validator';
import { QuizDifficulty } from './create-quiz.dto';

export class UpdateQuizDto {
  @IsString()
  @IsOptional()
  themeId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(QuizDifficulty)
  @IsOptional()
  difficulty?: QuizDifficulty;

  @IsInt()
  @Min(1)
  @IsOptional()
  timeLimit?: number;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  passingScore?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  requiredStars?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @IsBoolean()
  @IsOptional()
  isFree?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
