import { IsNotEmpty, IsString } from 'class-validator';

export class PurchaseAttemptDto {
  @IsString()
  @IsNotEmpty()
  quizId: string;
}
