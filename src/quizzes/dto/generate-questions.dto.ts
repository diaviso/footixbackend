import { IsNotEmpty, IsString, IsNumber, IsEnum, Min, Max } from 'class-validator';

export class GenerateQuestionsDto {
  @IsString()
  @IsNotEmpty()
  quizId: string;

  @IsNumber()
  @Min(1)
  @Max(20)
  numberOfQuestions: number;

  @IsEnum(['QCU', 'QCM', 'MIXTE'])
  type: 'QCU' | 'QCM' | 'MIXTE';
}
