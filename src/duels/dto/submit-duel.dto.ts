import { IsObject, IsString } from 'class-validator';

export class SubmitDuelDto {
  @IsString()
  duelId: string;

  @IsObject()
  answers: Record<string, string[]>; // { questionId: selectedOptionIds[] }
}
