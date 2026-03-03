import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(userId?: string) {
    const [themesCount, quizzesCount] = await Promise.all([
      this.prisma.theme.count({ where: { isActive: true } }),
      this.prisma.quiz.count({ where: { isActive: true } }),
    ]);

    let userQuizAttempts = 0;
    if (userId) {
      userQuizAttempts = await this.prisma.quizAttempt.count({
        where: { userId },
      });
    }

    return {
      themes: themesCount,
      quizzes: quizzesCount,
      userQuizAttempts,
    };
  }

  async getUserActivity(userId: string) {
    const recentQuizzes = await this.prisma.quizAttempt.findMany({
      where: { userId },
      take: 10,
      orderBy: { completedAt: 'desc' },
      include: {
        quiz: {
          select: {
            title: true,
          },
        },
      },
    });

    const activities = recentQuizzes.map((attempt) => ({
      type: 'quiz',
      title: attempt.quiz.title,
      time: this.getRelativeTime(attempt.completedAt),
      score: `${attempt.score}%`,
    }));

    return activities.slice(0, 5);
  }

  async getUserProgress(userId: string) {
    const [totalQuizzes, userAttempts, totalThemes] = await Promise.all([
      this.prisma.quiz.count({ where: { isActive: true } }),
      this.prisma.quizAttempt.count({ where: { userId } }),
      this.prisma.theme.count({ where: { isActive: true } }),
    ]);

    const allUserAttempts = await this.prisma.quizAttempt.findMany({
      where: { userId },
      include: {
        quiz: {
          select: {
            passingScore: true,
          },
        },
      },
    });

    const passedQuizzes = allUserAttempts.filter(
      (attempt) => attempt.score >= attempt.quiz.passingScore
    ).length;

    const quizSuccessRate = userAttempts > 0 ? Math.round((passedQuizzes / userAttempts) * 100) : 0;

    const uniqueQuizzesAttempted = await this.prisma.quizAttempt.groupBy({
      by: ['quizId'],
      where: { userId },
    });

    const quizCompletionRate = totalQuizzes > 0 
      ? Math.round((uniqueQuizzesAttempted.length / totalQuizzes) * 100) 
      : 0;

    return {
      quizSuccessRate,
      quizCompletionRate,
    };
  }

  async getUserStats(userId: string) {
    const [totalQuizzes, userAttempts, uniqueQuizzes, passedAttempts] = await Promise.all([
      this.prisma.quiz.count({ where: { isActive: true } }),
      this.prisma.quizAttempt.findMany({
        where: { userId },
        include: { quiz: { select: { passingScore: true } } },
      }),
      this.prisma.quizAttempt.groupBy({
        by: ['quizId'],
        where: { userId },
      }),
      this.prisma.quizAttempt.findMany({
        where: { userId },
        include: { quiz: { select: { passingScore: true } } },
      }),
    ]);

    const quizzesPassed = passedAttempts.filter(
      (a) => a.score >= a.quiz.passingScore
    ).length;

    const totalScore = userAttempts.reduce((sum, a) => sum + a.score, 0);
    const averageScore = userAttempts.length > 0
      ? Math.round(totalScore / userAttempts.length)
      : 0;

    return {
      totalQuizzes,
      uniqueQuizzesCompleted: uniqueQuizzes.length,
      totalAttempts: userAttempts.length,
      quizzesPassed,
      averageScore,
    };
  }

  async getAdminStats() {
    const [
      totalUsers,
      totalQuizzes,
      totalAttempts,
      recentUsers,
      attemptsByDay,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'USER' } }),
      this.prisma.quiz.count(),
      this.prisma.quizAttempt.count(),
      this.prisma.user.findMany({
        where: { role: 'USER' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, firstName: true, lastName: true, email: true, createdAt: true, stars: true },
      }),
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT DATE("completedAt") as date, COUNT(*) as count
        FROM quiz_attempts
        WHERE "completedAt" >= NOW() - INTERVAL '30 days'
        GROUP BY DATE("completedAt")
        ORDER BY date DESC
      `,
    ]);

    const passedAttempts = await this.prisma.quizAttempt.count({
      where: {
        score: { gte: 70 },
      },
    });

    const globalSuccessRate = totalAttempts > 0
      ? Math.round((passedAttempts / totalAttempts) * 100)
      : 0;

    const topUsers = await this.prisma.user.findMany({
      where: { role: 'USER', showInLeaderboard: true },
      orderBy: { stars: 'desc' },
      take: 5,
      select: { id: true, firstName: true, lastName: true, stars: true },
    });

    return {
      totalUsers,
      totalQuizzes,
      totalAttempts,
      globalSuccessRate,
      recentUsers,
      topUsers,
      attemptsByDay: attemptsByDay.map(d => ({ date: d.date, count: Number(d.count) })),
    };
  }

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `Il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    } else if (diffHours < 24) {
      return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
    } else if (diffDays === 1) {
      return 'Hier';
    } else if (diffDays < 7) {
      return `Il y a ${diffDays} jours`;
    } else {
      return date.toLocaleDateString('fr-FR');
    }
  }
}
