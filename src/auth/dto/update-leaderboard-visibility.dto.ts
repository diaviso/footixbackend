import { IsBoolean } from 'class-validator';

export class UpdateLeaderboardVisibilityDto {
  @IsBoolean()
  showInLeaderboard: boolean;
}
