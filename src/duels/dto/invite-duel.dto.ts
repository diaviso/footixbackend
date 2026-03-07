import { IsString } from 'class-validator';

export class InviteDuelDto {
  @IsString()
  userId: string;
}
