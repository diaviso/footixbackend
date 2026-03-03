import { IsEnum, IsInt, Min, Max } from 'class-validator';

export class CreateDuelDto {
  @IsInt()
  @Min(2)
  @Max(4)
  maxParticipants: number;

  @IsEnum(['FACILE', 'MOYEN', 'DIFFICILE', 'ALEATOIRE'])
  difficulty: 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'ALEATOIRE';
}
