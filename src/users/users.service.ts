import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../generated/prisma';
import * as bcrypt from 'bcrypt';

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: UserRole;
}

export interface CreateUserDto {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  role?: UserRole;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, limit = 50, search?: string, role?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role && role !== 'all') {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isEmailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = createUserDto.password
      ? await bcrypt.hash(createUserDto.password, 10)
      : await bcrypt.hash(Math.random().toString(36), 10);

    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        password: hashedPassword,
        role: createUserDto.role || UserRole.USER,
        isEmailVerified: false,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('Email already exists');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async delete(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({ where: { id } });

    return { message: 'User deleted successfully' };
  }

  async toggleEmailVerification(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { isEmailVerified: !user.isEmailVerified },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async findOneDetailed(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        country: true,
        city: true,
        avatar: true,
        role: true,
        isEmailVerified: true,
        googleId: true,
        stars: true,
        showInLeaderboard: true,
        emailNotifications: true,
        pushNotifications: true,
        marketingEmails: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Fetch activity data in parallel
    const [
      quizAttempts,
      quizAttemptCount,
    ] = await Promise.all([
      this.prisma.quizAttempt.findMany({
        where: { userId: id },
        orderBy: { completedAt: 'desc' },
        take: 20,
        include: {
          quiz: {
            select: { id: true, title: true, difficulty: true, theme: { select: { title: true } } },
          },
        },
      }),
      this.prisma.quizAttempt.count({ where: { userId: id } }),
    ]);

    // Compute quiz stats
    const avgScore = quizAttemptCount > 0
      ? Math.round(quizAttempts.reduce((sum, a) => sum + a.score, 0) / Math.min(quizAttempts.length, quizAttemptCount))
      : 0;
    const bestScore = quizAttempts.length > 0
      ? Math.max(...quizAttempts.map(a => a.score))
      : 0;

    return {
      ...user,
      activity: {
        quizAttempts: quizAttempts.map(a => ({
          id: a.id,
          score: a.score,
          starsEarned: a.starsEarned,
          completedAt: a.completedAt,
          quiz: a.quiz,
        })),
        quizAttemptCount,
        avgScore,
        bestScore,
      },
    };
  }

  async getStats() {
    const [total, admins, verified, pending] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
      this.prisma.user.count({ where: { isEmailVerified: true } }),
      this.prisma.user.count({ where: { isEmailVerified: false } }),
    ]);

    return {
      total,
      admins,
      verified,
      pending,
    };
  }
}
