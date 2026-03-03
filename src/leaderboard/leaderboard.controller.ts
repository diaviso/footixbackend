import { Controller, Get, UseGuards } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  async getLeaderboard() {
    return this.leaderboardService.getTopUsers(100);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyPosition(@CurrentUser('id') userId: string) {
    return this.leaderboardService.getUserPosition(userId);
  }
}
