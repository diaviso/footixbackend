import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId: string;
    type: 'DUEL_INVITE' | 'RANK_DROP' | 'GENERAL';
    title: string;
    message: string;
    data?: Record<string, any>;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data ? JSON.stringify(data.data) : null,
      },
    });
  }

  async getForUser(userId: string, limit = 30) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return notifications.map((n) => ({
      ...n,
      data: n.data ? JSON.parse(n.data) : null,
    }));
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  /**
   * After a user gains stars, check if they overtook anyone in the leaderboard
   * and notify those users about their rank drop.
   */
  async checkRankDrops(gainerId: string) {
    const gainer = await this.prisma.user.findUnique({
      where: { id: gainerId },
      select: { id: true, firstName: true, lastName: true, stars: true, role: true, showInLeaderboard: true },
    });
    if (!gainer || gainer.role === 'ADMIN' || !gainer.showInLeaderboard) return;

    // Find users who now have fewer stars than the gainer but were previously ranked above or equal
    // We approximate by finding users with stars just below the gainer (within a range that could have been overtaken)
    const overtakenUsers = await this.prisma.user.findMany({
      where: {
        id: { not: gainerId },
        role: 'USER',
        showInLeaderboard: true,
        stars: { lt: gainer.stars, gte: Math.max(0, gainer.stars - 30) }, // reasonable range
      },
      select: { id: true, stars: true },
      take: 20,
    });

    for (const user of overtakenUsers) {
      // Check we haven't already notified this user about this gainer recently (within 1h)
      const recentNotif = await this.prisma.notification.findFirst({
        where: {
          userId: user.id,
          type: 'RANK_DROP',
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
      });
      if (recentNotif) continue;

      // Count how many users are above this user now
      const usersAbove = await this.prisma.user.count({
        where: { showInLeaderboard: true, role: 'USER', stars: { gt: user.stars } },
      });
      const rank = usersAbove + 1;

      await this.create({
        userId: user.id,
        type: 'RANK_DROP',
        title: 'Classement mis à jour',
        message: `${gainer.firstName} ${gainer.lastName} vous a dépassé ! Vous êtes maintenant ${rank}${rank === 1 ? 'er' : 'e'} au classement.`,
        data: { newRank: rank, overtakenBy: gainer.firstName },
      });
    }
  }
}
