import { IsString, Length } from 'class-validator';

export class JoinDuelDto {
  @IsString()
  @Length(6, 6)
  code: string;
}
