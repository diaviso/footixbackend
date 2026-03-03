import { IsNotEmpty, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsArray()
  @IsString({ each: true })
  selectedOptionIds: string[];
}

export class SubmitQuizDto {
  @IsString()
  @IsNotEmpty()
  quizId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}
