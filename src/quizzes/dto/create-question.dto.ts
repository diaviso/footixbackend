import { IsNotEmpty, IsString, IsEnum, IsArray, ValidateNested, IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export enum QuestionType {
  QCM = 'QCM',
  QCU = 'QCU',
}

export class CreateOptionDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsString()
  @IsOptional()
  explanation?: string;
}

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  quizId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsEnum(QuestionType)
  type: QuestionType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options: CreateOptionDto[];
}
