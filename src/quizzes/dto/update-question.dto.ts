import { IsOptional, IsString, IsEnum, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from './create-question.dto';

export class UpdateOptionDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsBoolean()
  @IsOptional()
  isCorrect?: boolean;

  @IsString()
  @IsOptional()
  explanation?: string;
}

export class UpdateQuestionDto {
  @IsString()
  @IsOptional()
  content?: string;

  @IsEnum(QuestionType)
  @IsOptional()
  type?: QuestionType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOptionDto)
  @IsOptional()
  options?: UpdateOptionDto[];
}
