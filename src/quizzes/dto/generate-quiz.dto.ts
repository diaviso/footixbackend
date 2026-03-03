import { IsNotEmpty, IsString, IsEnum, IsInt, IsOptional, Min, Max } from 'class-validator';
import { QuizDifficulty } from './create-quiz.dto';

export class GenerateQuizDto {
  @IsString()
  @IsNotEmpty()
  themeId: string;

  @IsEnum(QuizDifficulty)
  @IsOptional()
  difficulty?: QuizDifficulty;

  @IsInt()
  @Min(3)
  @Max(20)
  @IsOptional()
  numberOfQuestions?: number;

  @IsString()
  @IsOptional()
  instructions?: string;
}
