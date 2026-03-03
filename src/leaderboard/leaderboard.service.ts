import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  stars: number;
}

@Injectable()
export class LeaderboardService {
  constructor(private prisma: PrismaService) {}

  async getTopUsers(limit: number = 100): Promise<LeaderboardEntry[]> {
    const users = await this.prisma.user.findMany({
      where: {
        showInLeaderboard: true,
        role: 'USER', // Exclude admins from leaderboard
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        stars: true,
      },
      orderBy: {
        stars: 'desc',
      },
      take: limit,
    });

    return users.map((user, index) => ({
      rank: index + 1,
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      stars: user.stars,
    }));
  }

  async getUserPosition(userId: string): Promise<{ rank: number; stars: number; totalUsers: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stars: true, role: true },
    });

    if (!user) {
      return { rank: 0, stars: 0, totalUsers: 0 };
    }

    // Admins don't have a rank
    if (user.role === 'ADMIN') {
      return { rank: 0, stars: 0, totalUsers: 0 };
    }

    // Count users with more stars (visible in leaderboard, excluding admins)
    const usersAbove = await this.prisma.user.count({
      where: {
        showInLeaderboard: true,
        role: 'USER',
        stars: { gt: user.stars },
      },
    });

    // Count users with same stars but created earlier (for consistent ranking)
    const userInfo = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    const usersWithSameStarsAbove = await this.prisma.user.count({
      where: {
        showInLeaderboard: true,
        role: 'USER',
        stars: user.stars,
        createdAt: { lt: userInfo?.createdAt },
      },
    });

    const totalUsers = await this.prisma.user.count({
      where: { showInLeaderboard: true, role: 'USER' },
    });

    return {
      rank: usersAbove + usersWithSameStarsAbove + 1,
      stars: user.stars,
      totalUsers,
    };
  }
}
