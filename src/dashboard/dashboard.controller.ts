import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  getStats(@CurrentUser('id') userId: string) {
    return this.dashboardService.getStats(userId);
  }

  @Get('activity')
  @UseGuards(JwtAuthGuard)
  getUserActivity(@CurrentUser('id') userId: string) {
    return this.dashboardService.getUserActivity(userId);
  }

  @Get('progress')
  @UseGuards(JwtAuthGuard)
  getUserProgress(@CurrentUser('id') userId: string) {
    return this.dashboardService.getUserProgress(userId);
  }

  @Get('user-stats')
  @UseGuards(JwtAuthGuard)
  getUserStats(@CurrentUser('id') userId: string) {
    return this.dashboardService.getUserStats(userId);
  }

  @Get('admin-stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getAdminStats() {
    return this.dashboardService.getAdminStats();
  }
}
