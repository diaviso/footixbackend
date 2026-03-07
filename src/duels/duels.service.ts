import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDuelDto } from './dto/create-duel.dto';
import { JoinDuelDto } from './dto/join-duel.dto';
import { InviteDuelDto } from './dto/invite-duel.dto';
import { SubmitDuelDto } from './dto/submit-duel.dto';

const STARS_COST_MAP = {
  FACILE: 5,
  MOYEN: 10,
  DIFFICILE: 20,
  ALEATOIRE: 12,
};

const DUEL_EXPIRY_MINUTES = 30;
const DUEL_QUESTION_COUNT = 10;
const DUEL_TIME_LIMIT_SECONDS = 300; // 5 minutes

@Injectable()
export class DuelsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async create(userId: string, dto: CreateDuelDto) {
    const starsCost = STARS_COST_MAP[dto.difficulty];

    // Check user has enough stars
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.stars < starsCost) {
      throw new BadRequestException(
        `Vous n'avez pas assez d'étoiles. Requis : ${starsCost}, disponible : ${user.stars}`,
      );
    }

    // Generate unique code
    let code: string;
    let exists = true;
    do {
      code = this.generateCode();
      const existing = await this.prisma.duel.findUnique({ where: { code } });
      exists = !!existing;
    } while (exists);

    const expiresAt = new Date(Date.now() + DUEL_EXPIRY_MINUTES * 60 * 1000);

    // Create duel + add creator as first participant + debit stars
    const duel = await this.prisma.$transaction(async (tx) => {
      // Debit stars
      await tx.user.update({
        where: { id: userId },
        data: { stars: { decrement: starsCost } },
      });

      // Create duel
      const d = await tx.duel.create({
        data: {
          code,
          creatorId: userId,
          maxParticipants: dto.maxParticipants,
          difficulty: dto.difficulty,
          starsCost,
          questionIds: '[]',
          expiresAt,
        },
      });

      // Add creator as participant
      await tx.duelParticipant.create({
        data: {
          duelId: d.id,
          userId,
        },
      });

      return d;
    });

    // Reload with participants to return full response
    const fullDuel = await this.prisma.duel.findUnique({
      where: { id: duel.id },
      include: { participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } } },
    });

    return this.formatDuelResponse(fullDuel!, userId);
  }

  async join(userId: string, dto: JoinDuelDto) {
    const duel = await this.prisma.duel.findUnique({
      where: { code: dto.code.toUpperCase() },
      include: { participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } } },
    });

    if (!duel) throw new NotFoundException('Salon introuvable. Vérifiez le code.');

    if (duel.status === 'FINISHED' || duel.status === 'CANCELLED') {
      throw new BadRequestException('Ce salon est déjà terminé.');
    }
    if (duel.status === 'PLAYING') {
      throw new BadRequestException('Ce salon est déjà en cours de jeu.');
    }
    if (new Date() > duel.expiresAt) {
      throw new BadRequestException('Ce salon a expiré.');
    }

    // Check if already joined
    const alreadyJoined = duel.participants.find((p) => p.userId === userId);
    if (alreadyJoined) {
      // Return duel info (re-entering lobby)
      return this.formatDuelResponse(duel, userId);
    }

    if (duel.participants.length >= duel.maxParticipants) {
      throw new BadRequestException('Ce salon est plein.');
    }

    // Check stars
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.stars < duel.starsCost) {
      throw new BadRequestException(
        `Vous n'avez pas assez d'étoiles. Requis : ${duel.starsCost}, disponible : ${user.stars}`,
      );
    }

    // Join duel + debit stars
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { stars: { decrement: duel.starsCost } },
      });
      await tx.duelParticipant.create({
        data: { duelId: duel.id, userId },
      });
    });

    // Check if duel is now full -> set READY
    const updatedParticipantCount = duel.participants.length + 1;
    if (updatedParticipantCount >= duel.maxParticipants) {
      await this.prisma.duel.update({
        where: { id: duel.id },
        data: { status: 'READY' },
      });
    }

    // Return updated duel
    const updatedDuel = await this.prisma.duel.findUnique({
      where: { id: duel.id },
      include: { participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } } },
    });

    return this.formatDuelResponse(updatedDuel!, userId);
  }

  async leave(userId: string, duelId: string) {
    const duel = await this.prisma.duel.findUnique({
      where: { id: duelId },
      include: { participants: true },
    });

    if (!duel) throw new NotFoundException('Salon introuvable');

    if (duel.status === 'PLAYING' || duel.status === 'FINISHED') {
      throw new BadRequestException('Impossible de quitter un salon en cours ou terminé.');
    }

    const participant = duel.participants.find((p) => p.userId === userId);
    if (!participant) throw new BadRequestException('Vous ne faites pas partie de ce salon.');

    // If creator leaves, cancel the entire duel and refund everyone
    if (duel.creatorId === userId) {
      await this.prisma.$transaction(async (tx) => {
        // Refund all participants
        for (const p of duel.participants) {
          await tx.user.update({
            where: { id: p.userId },
            data: { stars: { increment: duel.starsCost } },
          });
        }
        await tx.duel.update({
          where: { id: duel.id },
          data: { status: 'CANCELLED' },
        });
      });
      return { message: 'Salon annulé. Tous les participants ont été remboursés.' };
    }

    // Regular participant leaves -> refund and remove
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { stars: { increment: duel.starsCost } },
      });
      await tx.duelParticipant.delete({
        where: { id: participant.id },
      });
      // If was READY, go back to WAITING
      if (duel.status === 'READY') {
        await tx.duel.update({
          where: { id: duel.id },
          data: { status: 'WAITING' },
        });
      }
    });

    return { message: 'Vous avez quitté le salon. Vos étoiles ont été remboursées.' };
  }

  async launch(userId: string, duelId: string) {
    const duel = await this.prisma.duel.findUnique({
      where: { id: duelId },
      include: { participants: true },
    });

    if (!duel) throw new NotFoundException('Salon introuvable');
    if (duel.creatorId !== userId) throw new ForbiddenException('Seul le créateur peut lancer le duel.');
    if (duel.status !== 'READY') {
      throw new BadRequestException('Le salon doit être plein pour être lancé.');
    }

    // Pick 10 random questions based on difficulty
    const questionIds = await this.pickRandomQuestions(duel.difficulty);

    if (questionIds.length < DUEL_QUESTION_COUNT) {
      throw new BadRequestException(
        `Pas assez de questions disponibles pour ce niveau de difficulté. Trouvé : ${questionIds.length}/${DUEL_QUESTION_COUNT}`,
      );
    }

    await this.prisma.duel.update({
      where: { id: duel.id },
      data: {
        status: 'PLAYING',
        questionIds: JSON.stringify(questionIds),
        startedAt: new Date(),
      },
    });

    return { message: 'Le duel a été lancé !', startedAt: new Date() };
  }

  private async pickRandomQuestions(difficulty: string): Promise<string[]> {
    let difficultyFilter: any = {};

    if (difficulty === 'ALEATOIRE') {
      // No filter — random across all difficulties
    } else {
      difficultyFilter = { quiz: { difficulty: difficulty as any } };
    }

    // Get all questions matching difficulty with their options
    const questions = await this.prisma.question.findMany({
      where: {
        ...difficultyFilter,
        options: { some: { isCorrect: true } }, // Must have at least one correct answer
      },
      select: { id: true },
    });

    // Shuffle and pick 10
    const shuffled = questions.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, DUEL_QUESTION_COUNT).map((q) => q.id);
  }

  async getDuel(userId: string, duelId: string) {
    const duel = await this.prisma.duel.findUnique({
      where: { id: duelId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
      },
    });

    if (!duel) throw new NotFoundException('Salon introuvable');

    const isParticipant = duel.participants.some((p) => p.userId === userId);
    if (!isParticipant) throw new ForbiddenException('Vous ne faites pas partie de ce salon.');

    return this.formatDuelResponse(duel, userId);
  }

  async getDuelQuestions(userId: string, duelId: string) {
    const duel = await this.prisma.duel.findUnique({
      where: { id: duelId },
      include: { participants: true },
    });

    if (!duel) throw new NotFoundException('Salon introuvable');
    if (!duel.participants.some((p) => p.userId === userId)) {
      throw new ForbiddenException('Vous ne faites pas partie de ce salon.');
    }
    if (duel.status !== 'PLAYING' && duel.status !== 'FINISHED') {
      throw new BadRequestException('Le duel n\'a pas encore commencé.');
    }

    const questionIds: string[] = JSON.parse(duel.questionIds);

    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: {
        options: {
          select: {
            id: true,
            content: true,
            // Only show isCorrect and explanation if duel is finished
            ...(duel.status === 'FINISHED' ? { isCorrect: true, explanation: true } : {}),
          },
        },
      },
    });

    // Maintain the order from questionIds
    const orderedQuestions = questionIds.map((qid) => questions.find((q) => q.id === qid)).filter(Boolean);

    return {
      questions: orderedQuestions,
      timeLimit: DUEL_TIME_LIMIT_SECONDS,
      startedAt: duel.startedAt,
    };
  }

  async submit(userId: string, dto: SubmitDuelDto) {
    const duel = await this.prisma.duel.findUnique({
      where: { id: dto.duelId },
      include: { participants: true },
    });

    if (!duel) throw new NotFoundException('Salon introuvable');
    if (duel.status !== 'PLAYING') {
      throw new BadRequestException('Ce duel n\'est pas en cours.');
    }

    const participant = duel.participants.find((p) => p.userId === userId);
    if (!participant) throw new ForbiddenException('Vous ne faites pas partie de ce salon.');
    if (participant.finishedAt) {
      throw new BadRequestException('Vous avez déjà soumis vos réponses.');
    }

    // Calculate score
    const questionIds: string[] = JSON.parse(duel.questionIds);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: { options: true },
    });

    let correctCount = 0;
    for (const question of questions) {
      const userAnswers = dto.answers[question.id] || [];
      const correctOptions = question.options.filter((o) => o.isCorrect).map((o) => o.id);

      // Check if user's answers exactly match correct answers
      const isCorrect =
        userAnswers.length === correctOptions.length &&
        userAnswers.every((a) => correctOptions.includes(a)) &&
        correctOptions.every((c) => userAnswers.includes(c));

      if (isCorrect) correctCount++;
    }

    const score = Math.round((correctCount / questionIds.length) * 100);

    await this.prisma.duelParticipant.update({
      where: { id: participant.id },
      data: {
        answers: JSON.stringify(dto.answers),
        score,
        correctCount,
        finishedAt: new Date(),
      },
    });

    // Check if all participants have finished
    const allParticipants = await this.prisma.duelParticipant.findMany({
      where: { duelId: duel.id },
    });

    const allFinished = allParticipants.every(
      (p) => p.id === participant.id ? true : !!p.finishedAt,
    );

    // Also check time limit
    const timeLimitReached = duel.startedAt &&
      new Date().getTime() - duel.startedAt.getTime() > DUEL_TIME_LIMIT_SECONDS * 1000;

    if (allFinished || timeLimitReached) {
      await this.finalizeDuel(duel.id);
    }

    return { score, correctCount, total: questionIds.length };
  }

  async finalizeDuel(duelId: string) {
    const duel = await this.prisma.duel.findUnique({
      where: { id: duelId },
      include: { participants: true },
    });

    if (!duel || duel.status === 'FINISHED') return;

    // Rank participants: by correctCount DESC, then by finishedAt ASC (faster = better)
    const ranked = [...duel.participants].sort((a, b) => {
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      // If tied on correctCount, the one who finished earlier wins
      const aTime = a.finishedAt ? a.finishedAt.getTime() : Infinity;
      const bTime = b.finishedAt ? b.finishedAt.getTime() : Infinity;
      return aTime - bTime;
    });

    // Calculate star distribution: 1st = 70%, 2nd = 30%
    const totalPot = duel.starsCost * duel.participants.length;
    const firstPrize = Math.round(totalPot * 0.7);
    const secondPrize = totalPot - firstPrize;

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < ranked.length; i++) {
        const p = ranked[i];
        let starsWon = 0;

        if (i === 0) starsWon = firstPrize;
        else if (i === 1) starsWon = secondPrize;
        // 3rd and 4th get nothing (they lost their wager)

        await tx.duelParticipant.update({
          where: { id: p.id },
          data: { rank: i + 1, starsWon },
        });

        if (starsWon > 0) {
          await tx.user.update({
            where: { id: p.userId },
            data: { stars: { increment: starsWon } },
          });
        }
      }

      await tx.duel.update({
        where: { id: duelId },
        data: { status: 'FINISHED', finishedAt: new Date() },
      });
    });

    // Check for leaderboard rank drops for winners (fire-and-forget)
    for (let i = 0; i < ranked.length; i++) {
      if (i === 0 || i === 1) {
        this.notifications.checkRankDrops(ranked[i].userId).catch(() => {});
      }
    }
  }

  async getMyDuels(userId: string) {
    const participations = await this.prisma.duelParticipant.findMany({
      where: { userId },
      include: {
        duel: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: 50,
    });

    return participations.map((p) => ({
      id: p.duel.id,
      code: p.duel.code,
      difficulty: p.duel.difficulty,
      starsCost: p.duel.starsCost,
      status: p.duel.status,
      maxParticipants: p.duel.maxParticipants,
      participantCount: p.duel.participants.length,
      isCreator: p.duel.creatorId === userId,
      myRank: p.rank,
      myStarsWon: p.starsWon,
      myCorrectCount: p.correctCount,
      createdAt: p.duel.createdAt,
      startedAt: p.duel.startedAt,
      finishedAt: p.duel.finishedAt,
      participants: p.duel.participants.map((dp) => ({
        id: dp.userId,
        firstName: dp.user.firstName,
        lastName: dp.user.lastName,
        avatar: dp.user.avatar,
        rank: dp.rank,
        starsWon: dp.starsWon,
        correctCount: dp.correctCount,
        score: dp.score,
        finishedAt: dp.finishedAt,
      })),
    }));
  }

  async checkExpiredDuels() {
    // Find expired duels that haven't been launched
    const expiredDuels = await this.prisma.duel.findMany({
      where: {
        status: { in: ['WAITING', 'READY'] },
        expiresAt: { lt: new Date() },
      },
      include: { participants: true },
    });

    for (const duel of expiredDuels) {
      await this.prisma.$transaction(async (tx) => {
        // Refund all participants
        for (const p of duel.participants) {
          await tx.user.update({
            where: { id: p.userId },
            data: { stars: { increment: duel.starsCost } },
          });
        }
        await tx.duel.update({
          where: { id: duel.id },
          data: { status: 'CANCELLED' },
        });
      });
    }

    return { cancelled: expiredDuels.length };
  }

  async checkTimedOutDuels() {
    // Find playing duels that have exceeded the time limit
    const timedOut = await this.prisma.duel.findMany({
      where: {
        status: 'PLAYING',
        startedAt: { lt: new Date(Date.now() - DUEL_TIME_LIMIT_SECONDS * 1000) },
      },
    });

    for (const duel of timedOut) {
      await this.finalizeDuel(duel.id);
    }

    return { finalized: timedOut.length };
  }

  async searchUsers(currentUserId: string, query: string) {
    if (!query || query.trim().length < 2) return [];

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        isEmailVerified: true,
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        email: true,
      },
      take: 10,
    });

    return users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      avatar: u.avatar,
      email: u.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'), // mask email
    }));
  }

  async invite(creatorId: string, duelId: string, dto: InviteDuelDto) {
    const duel = await this.prisma.duel.findUnique({
      where: { id: duelId },
      include: { participants: true },
    });

    if (!duel) throw new NotFoundException('Salon introuvable');
    if (duel.creatorId !== creatorId) throw new ForbiddenException('Seul le créateur peut inviter.');
    if (duel.status !== 'WAITING' && duel.status !== 'READY') {
      throw new BadRequestException('Ce salon n\'accepte plus de joueurs.');
    }
    if (duel.participants.length >= duel.maxParticipants) {
      throw new BadRequestException('Ce salon est plein.');
    }

    const invitedUser = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!invitedUser) throw new NotFoundException('Utilisateur introuvable');

    // Check if already in duel
    const alreadyIn = duel.participants.some((p) => p.userId === dto.userId);
    if (alreadyIn) throw new BadRequestException('Ce joueur est déjà dans le salon.');

    // Check if invited user has enough stars
    if (invitedUser.stars < duel.starsCost) {
      throw new BadRequestException(
        `${invitedUser.firstName} n'a pas assez d'étoiles (${invitedUser.stars}/${duel.starsCost}).`,
      );
    }

    // Auto-join the invited user (debit stars + add as participant)
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: dto.userId },
        data: { stars: { decrement: duel.starsCost } },
      });
      await tx.duelParticipant.create({
        data: { duelId: duel.id, userId: dto.userId },
      });
    });

    // Check if duel is now full -> set READY
    const updatedCount = duel.participants.length + 1;
    if (updatedCount >= duel.maxParticipants) {
      await this.prisma.duel.update({
        where: { id: duel.id },
        data: { status: 'READY' },
      });
    }

    // Send notification to invited user
    const creator = await this.prisma.user.findUnique({ where: { id: creatorId }, select: { firstName: true, lastName: true } });
    await this.notifications.create({
      userId: dto.userId,
      type: 'DUEL_INVITE',
      title: 'Invitation à un duel',
      message: `${creator?.firstName ?? 'Un joueur'} ${creator?.lastName ?? ''} vous a invité dans un duel ${duel.difficulty}.`,
      data: { duelId: duel.id, code: duel.code },
    });

    const updatedDuel = await this.prisma.duel.findUnique({
      where: { id: duel.id },
      include: { participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } } },
    });

    return this.formatDuelResponse(updatedDuel!, creatorId);
  }

  private formatDuelResponse(duel: any, userId: string) {
    return {
      id: duel.id,
      code: duel.code,
      creatorId: duel.creatorId,
      maxParticipants: duel.maxParticipants,
      difficulty: duel.difficulty,
      starsCost: duel.starsCost,
      status: duel.status,
      startedAt: duel.startedAt,
      finishedAt: duel.finishedAt,
      expiresAt: duel.expiresAt,
      isCreator: duel.creatorId === userId,
      participants: duel.participants.map((p: any) => ({
        id: p.userId,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        avatar: p.user.avatar,
        rank: p.rank,
        starsWon: p.starsWon,
        correctCount: p.correctCount,
        score: p.score,
        finishedAt: p.finishedAt,
      })),
    };
  }
}
