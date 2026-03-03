import { IsNotEmpty, IsString, IsEnum, IsInt, IsBoolean, Min, Max, IsOptional } from 'class-validator';

export enum QuizDifficulty {
  FACILE = 'FACILE',
  MOYEN = 'MOYEN',
  DIFFICILE = 'DIFFICILE',
}

export class CreateQuizDto {
  @IsString()
  @IsNotEmpty()
  themeId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(QuizDifficulty)
  difficulty: QuizDifficulty;

  @IsInt()
  @Min(1)
  timeLimit: number;

  @IsInt()
  @Min(0)
  @Max(100)
  passingScore: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  requiredStars?: number;

  @IsBoolean()
  @IsOptional()
  isFree?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
