import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { GenerateQuizDto } from './dto/generate-quiz.dto';
import { PurchaseAttemptDto } from './dto/purchase-attempt.dto';
import { AnalyzeQuestionDto, AnalysisResult } from './dto/analyze-question.dto';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { NotificationsService } from '../notifications/notifications.service';

// Cost in stars to purchase an extra attempt
const EXTRA_ATTEMPT_COST = 10;

@Injectable()
export class QuizzesService {
  private readonly logger = new Logger(QuizzesService.name);
  private chatModel: ChatOpenAI;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notifications: NotificationsService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.chatModel = new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName:  "gpt-5.2",        
        temperature: 0.2,
      });
    }
  }

  async createQuiz(createQuizDto: CreateQuizDto) {
    const theme = await this.prisma.theme.findUnique({
      where: { id: createQuizDto.themeId },
    });

    if (!theme) {
      throw new NotFoundException('Theme not found');
    }

    return this.prisma.quiz.create({
      data: {
        themeId: createQuizDto.themeId,
        title: createQuizDto.title,
        description: createQuizDto.description,
        difficulty: createQuizDto.difficulty,
        timeLimit: createQuizDto.timeLimit,
        passingScore: createQuizDto.passingScore,
        requiredStars: createQuizDto.requiredStars ?? 0,
        isFree: createQuizDto.isFree ?? false,
      },
    });
  }

  async findAllQuizzes(page = 1, limit = 50, search?: string, themeId?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }
    if (themeId) {
      where.themeId = themeId;
    }

    const [quizzes, total] = await Promise.all([
      this.prisma.quiz.findMany({
        where,
        include: {
          theme: {
            select: { id: true, title: true },
          },
          _count: {
            select: { questions: true },
          },
        },
        orderBy: [{ theme: { position: 'asc' } }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.quiz.count({ where }),
    ]);

    return {
      data: quizzes,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findQuizById(id: string, includeExplanations: boolean = true) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        theme: true,
        questions: {
          include: {
            options: true,
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // If explanations should not be included, strip them from the response
    if (!includeExplanations) {
      return {
        ...quiz,
        questions: quiz.questions.map(q => ({
          ...q,
          options: q.options.map(o => ({
            id: o.id,
            questionId: o.questionId,
            content: o.content,
            isCorrect: o.isCorrect,
            createdAt: o.createdAt,
          })),
        })),
      };
    }

    return quiz;
  }

  async updateQuiz(id: string, updateQuizDto: UpdateQuizDto) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return this.prisma.quiz.update({
      where: { id },
      data: updateQuizDto,
    });
  }

  async removeQuiz(id: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    await this.prisma.quiz.delete({ where: { id } });

    return { message: 'Quiz deleted successfully' };
  }

  async createQuestion(createQuestionDto: CreateQuestionDto) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: createQuestionDto.quizId },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    if (createQuestionDto.type === 'QCU') {
      const correctOptions = createQuestionDto.options.filter(o => o.isCorrect);
      if (correctOptions.length !== 1) {
        throw new BadRequestException('QCU must have exactly one correct answer');
      }
    }

    if (createQuestionDto.type === 'QCM') {
      const correctOptions = createQuestionDto.options.filter(o => o.isCorrect);
      if (correctOptions.length < 1) {
        throw new BadRequestException('QCM must have at least one correct answer');
      }
    }

    return this.prisma.question.create({
      data: {
        quizId: createQuestionDto.quizId,
        content: createQuestionDto.content,
        type: createQuestionDto.type,
        options: {
          create: createQuestionDto.options.map(opt => ({
            content: opt.content,
            isCorrect: opt.isCorrect,
            explanation: opt.explanation || null,
          })),
        },
      },
      include: {
        options: true,
      },
    });
  }

  async findQuestionById(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        options: true,
      },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return question;
  }

  async updateQuestion(id: string, updateQuestionDto: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({ where: { id } });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (updateQuestionDto.options) {
      await this.prisma.option.deleteMany({ where: { questionId: id } });

      await this.prisma.option.createMany({
        data: updateQuestionDto.options.map(opt => ({
          questionId: id,
          content: opt.content || '',
          isCorrect: opt.isCorrect || false,
          explanation: opt.explanation || null,
        })),
      });
    }

    return this.prisma.question.update({
      where: { id },
      data: {
        content: updateQuestionDto.content,
        type: updateQuestionDto.type,
      },
      include: {
        options: true,
      },
    });
  }

  async removeQuestion(id: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    await this.prisma.question.delete({ where: { id } });

    return { message: 'Question deleted successfully' };
  }

  private calculateStars(score: number, passingScore: number, difficulty: string): number {
    const passed = score >= passingScore;

    if (!passed) {
      return 1; // Participation star for encouragement
    }

    // Base stars for passing
    let stars = 5;

    // Bonus for exceeding passing score: +1 star per 10% above passing score
    const bonusPercentage = score - passingScore;
    const bonusStars = Math.floor(bonusPercentage / 10);
    stars += bonusStars;

    // Difficulty multiplier
    let multiplier = 1;
    switch (difficulty) {
      case 'FACILE':
        multiplier = 1;
        break;
      case 'MOYEN':
        multiplier = 1.5;
        break;
      case 'DIFFICILE':
        multiplier = 2;
        break;
    }

    return Math.round(stars * multiplier);
  }

  async getUserQuizAttempts(userId: string, quizId: string) {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { userId, quizId },
      orderBy: { completedAt: 'desc' },
    });

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { passingScore: true, requiredStars: true },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // Count extra attempts purchased
    const extraAttempts = await this.prisma.quizExtraAttempt.count({
      where: { userId, quizId },
    });

    const failedAttempts = attempts.filter(a => a.score < quiz.passingScore).length;
    const passedAttempts = attempts.filter(a => a.score >= quiz.passingScore).length;
    const hasPassed = passedAttempts > 0;

    // Base attempts (3) + extra purchased attempts
    const totalAllowedAttempts = 3 + extraAttempts;
    const usedAttempts = failedAttempts; // Only failed attempts count against the limit
    const remainingAttempts = hasPassed ? 999 : Math.max(0, totalAllowedAttempts - usedAttempts);

    // Quiz is completed if passed OR if all attempts used (including extras)
    const isCompleted = hasPassed || (usedAttempts >= totalAllowedAttempts);
    const canRetry = hasPassed || (!isCompleted && remainingAttempts > 0);

    // Can view correction after using all base attempts (3) without passing, or after passing
    const canViewCorrection = (failedAttempts >= 3 && !hasPassed) || hasPassed;

    return {
      attempts,
      totalAttempts: attempts.length,
      failedAttempts,
      passedAttempts,
      hasPassed,
      isCompleted,
      canRetry,
      canViewCorrection,
      remainingAttempts,
      extraAttemptsPurchased: extraAttempts,
      canPurchaseAttempt: isCompleted && !hasPassed, // Can only buy if completed by failure
      extraAttemptCost: EXTRA_ATTEMPT_COST,
    };
  }

  async getQuizWithCorrections(userId: string, quizId: string) {
    const attemptInfo = await this.getUserQuizAttempts(userId, quizId);

    if (!attemptInfo.canViewCorrection) {
      throw new BadRequestException(
        'Vous devez avoir échoué 3 fois pour voir la correction'
      );
    }

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        theme: true,
        questions: {
          include: {
            options: true,
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return quiz;
  }

  async submitQuiz(userId: string, submitQuizDto: SubmitQuizDto) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: submitQuizDto.quizId },
      include: {
        questions: {
          include: {
            options: true,
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // Check if user has enough stars to unlock this quiz
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stars: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (quiz.requiredStars > 0 && user.stars < quiz.requiredStars) {
      throw new ForbiddenException(
        `Ce quiz nécessite ${quiz.requiredStars} étoiles pour être débloqué. Vous avez ${user.stars} étoiles.`
      );
    }

    // Check if user can still attempt this quiz
    const attemptInfo = await this.getUserQuizAttempts(userId, submitQuizDto.quizId);

    if (!attemptInfo.hasPassed && !attemptInfo.canRetry) {
      throw new BadRequestException(
        `Vous avez épuisé toutes vos tentatives. Achetez une tentative supplémentaire (${EXTRA_ATTEMPT_COST} étoiles) ou consultez la correction.`
      );
    }

    let totalScore = 0;
    const pointsPerQuestion = 100 / quiz.questions.length;

    for (const answer of submitQuizDto.answers) {
      const question = quiz.questions.find(q => q.id === answer.questionId);
      if (!question) continue;

      const correctOptionIds = question.options
        .filter(o => o.isCorrect)
        .map(o => o.id);

      const isCorrect =
        correctOptionIds.length === answer.selectedOptionIds.length &&
        correctOptionIds.every(id => answer.selectedOptionIds.includes(id));

      if (isCorrect) {
        totalScore += pointsPerQuestion;
      }
    }

    const finalScore = Math.round(totalScore);
    const passed = finalScore >= quiz.passingScore;

    // Calculate stars earned (0 if already passed — replay gives no stars)
    const alreadyPassed = attemptInfo.hasPassed;
    const starsEarned = alreadyPassed ? 0 : this.calculateStars(finalScore, quiz.passingScore, quiz.difficulty);

    // Create attempt and update user stars atomically
    const [attempt, updatedUser] = await this.prisma.$transaction([
      this.prisma.quizAttempt.create({
        data: {
          userId,
          quizId: submitQuizDto.quizId,
          score: finalScore,
          starsEarned,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          stars: { increment: starsEarned },
        },
        select: { stars: true },
      }),
    ]);

    // Get updated attempt info
    const newAttemptInfo = await this.getUserQuizAttempts(userId, submitQuizDto.quizId);

    // Check if theme is completed (all quizzes passed)
    let themeCompleted = false;
    let themeName = '';

    if (passed && quiz.themeId) {
      // Get all quizzes of this theme
      const themeQuizzes = await this.prisma.quiz.findMany({
        where: { themeId: quiz.themeId, isActive: true },
        select: { id: true, passingScore: true },
      });

      // Get theme name
      const theme = await this.prisma.theme.findUnique({
        where: { id: quiz.themeId },
        select: { title: true },
      });
      themeName = theme?.title || '';

      // Check if user has passed all quizzes of this theme
      const passedQuizIds = new Set<string>();

      for (const themeQuiz of themeQuizzes) {
        // Get best attempt for this quiz
        const bestAttempt = await this.prisma.quizAttempt.findFirst({
          where: { userId, quizId: themeQuiz.id },
          orderBy: { score: 'desc' },
        });

        if (bestAttempt && bestAttempt.score >= themeQuiz.passingScore) {
          passedQuizIds.add(themeQuiz.id);
        }
      }

      // If all quizzes are passed, theme is completed
      themeCompleted = passedQuizIds.size === themeQuizzes.length && themeQuizzes.length > 0;
    }

    // Check for leaderboard rank drops (fire-and-forget)
    if (starsEarned > 0) {
      this.notifications.checkRankDrops(userId).catch(() => {});
    }

    return {
      attempt,
      score: finalScore,
      passed,
      passingScore: quiz.passingScore,
      starsEarned,
      totalStars: updatedUser.stars,
      remainingAttempts: newAttemptInfo.remainingAttempts,
      canViewCorrection: newAttemptInfo.canViewCorrection,
      themeCompleted,
      themeName,
    };
  }

  async getUserAttempts(userId: string) {
    return this.prisma.quizAttempt.findMany({
      where: { userId },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            difficulty: true,
            theme: {
              select: { title: true },
            },
          },
        },
      },
      orderBy: { completedAt: 'desc' },
    });
  }

  /**
   * Check if a quiz is unlocked for a user based on their star count
   */
  async checkQuizAccess(userId: string, quizId: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { requiredStars: true, title: true },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stars: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isUnlocked = user.stars >= quiz.requiredStars;

    return {
      isUnlocked,
      requiredStars: quiz.requiredStars,
      userStars: user.stars,
      starsNeeded: Math.max(0, quiz.requiredStars - user.stars),
    };
  }

  /**
   * Purchase an extra attempt for a quiz using stars
   */
  async purchaseExtraAttempt(userId: string, purchaseAttemptDto: PurchaseAttemptDto) {
    const { quizId } = purchaseAttemptDto;

    const quiz = await this.prisma.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, title: true, passingScore: true },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    // Get user's current attempt status
    const attemptInfo = await this.getUserQuizAttempts(userId, quizId);

    // Can only purchase if quiz is completed by failure (not by passing)
    if (attemptInfo.hasPassed) {
      throw new BadRequestException('Vous avez déjà réussi ce quiz. Pas besoin de tentatives supplémentaires.');
    }

    if (!attemptInfo.isCompleted) {
      throw new BadRequestException(
        `Vous avez encore ${attemptInfo.remainingAttempts} tentative(s) disponible(s). Utilisez-les avant d'en acheter.`
      );
    }

    // Check if user has enough stars
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stars: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.stars < EXTRA_ATTEMPT_COST) {
      throw new BadRequestException(
        `Vous n'avez pas assez d'étoiles. Coût: ${EXTRA_ATTEMPT_COST} étoiles, vous avez: ${user.stars} étoiles.`
      );
    }

    // Deduct stars and create extra attempt record atomically
    const [updatedUser, extraAttempt] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          stars: { decrement: EXTRA_ATTEMPT_COST },
        },
        select: { stars: true },
      }),
      this.prisma.quizExtraAttempt.create({
        data: {
          userId,
          quizId,
          starsCost: EXTRA_ATTEMPT_COST,
        },
      }),
    ]);

    // Get updated attempt info
    const newAttemptInfo = await this.getUserQuizAttempts(userId, quizId);

    return {
      success: true,
      message: `Tentative supplémentaire achetée pour ${EXTRA_ATTEMPT_COST} étoiles.`,
      starsCost: EXTRA_ATTEMPT_COST,
      remainingStars: updatedUser.stars,
      remainingAttempts: newAttemptInfo.remainingAttempts,
      totalExtraAttemptsPurchased: newAttemptInfo.extraAttemptsPurchased,
    };
  }

  /**
   * Get quizzes with user's unlock status and attempt info
   */
  async getQuizzesWithUserStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stars: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const quizzes = await this.prisma.quiz.findMany({
      where: { isActive: true },
      include: {
        theme: {
          select: { id: true, title: true },
        },
        _count: {
          select: { questions: true },
        },
      },
      orderBy: [
        { theme: { position: 'asc' } },
        { displayOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    // Get attempt info for each quiz
    const quizzesWithStatus = await Promise.all(
      quizzes.map(async (quiz) => {
        const attempts = await this.prisma.quizAttempt.findMany({
          where: { userId, quizId: quiz.id },
          orderBy: { completedAt: 'desc' },
        });

        const extraAttempts = await this.prisma.quizExtraAttempt.count({
          where: { userId, quizId: quiz.id },
        });

        const failedAttempts = attempts.filter(a => a.score < quiz.passingScore).length;
        const hasPassed = attempts.some(a => a.score >= quiz.passingScore);
        const totalAllowedAttempts = 3 + extraAttempts;
        const isCompleted = hasPassed || (failedAttempts >= totalAllowedAttempts);
        const remainingAttempts = hasPassed ? 0 : Math.max(0, totalAllowedAttempts - failedAttempts);
        const isUnlocked = user.stars >= quiz.requiredStars;

        return {
          ...quiz,
          userStatus: {
            isUnlocked,
            requiredStars: quiz.requiredStars,
            hasPassed,
            isCompleted,
            remainingAttempts,
            totalAttempts: attempts.length,
            bestScore: attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : null,
            canPurchaseAttempt: isCompleted && !hasPassed,
            extraAttemptCost: EXTRA_ATTEMPT_COST,
          },
        };
      })
    );

    return quizzesWithStatus;
  }

  async generateQuizWithAI(generateQuizDto: GenerateQuizDto) {
    if (!this.chatModel) {
      throw new BadRequestException('Service IA non configuré. Vérifiez la clé API OpenAI.');
    }

    const theme = await this.prisma.theme.findUnique({
      where: { id: generateQuizDto.themeId },
    });

    if (!theme) {
      throw new NotFoundException('Thème non trouvé');
    }

    const difficulty = generateQuizDto.difficulty || 'MOYEN';
    const numberOfQuestions = generateQuizDto.numberOfQuestions || 5;

    // RAG context disabled (documents module removed)
    const ragContext = '';

    const userInstructions = generateQuizDto.instructions?.trim();

    const systemPrompt = `Tu es un expert en football et en création de quiz sportifs.
Tu possèdes une connaissance approfondie de l'histoire du football, des compétitions internationales (Coupe du Monde, Euro, Ligue des Champions, etc.), des clubs, des joueurs légendaires et actuels, des règles du jeu, des tactiques et des records.
Tu dois générer un quiz au format JSON strict.

IMPORTANT: Ta réponse doit être UNIQUEMENT du JSON valide, sans texte avant ou après.`;

    const userPrompt = `Génère un quiz sur le thème "${theme.title}" avec les paramètres suivants:
- Difficulté: ${difficulty}
- Nombre de questions: ${numberOfQuestions}
${userInstructions ? `\nInstruction supplémentaire de l'utilisateur : "${userInstructions}"\nPrends en compte cette directive dans la génération des questions.\n` : ''}
Le quiz doit être pertinent et porter sur le football (histoire, compétitions, joueurs, clubs, règles, tactiques, records, etc.).

Retourne UNIQUEMENT un objet JSON avec cette structure exacte:
{
  "title": "Titre du quiz (court et descriptif)",
  "description": "Description du quiz en 1-2 phrases",
  "questions": [
    {
      "content": "Texte de la question",
      "type": "QCU",
      "options": [
        { "content": "Option A", "isCorrect": false, "explanation": "Explication" },
        { "content": "Option B", "isCorrect": true, "explanation": "Explication" }
      ]
    }
  ]
}

Règles IMPORTANTES pour varier les questions :
- type peut être "QCU" (une seule bonne réponse) ou "QCM" (plusieurs bonnes réponses). Mélange les deux types.
- Le nombre d'options par question DOIT VARIER : les questions ont 4 ou 5 réponses possibles.
- Pour QCU: exactement 1 option avec isCorrect: true
- Pour QCM: au moins 2 options avec isCorrect: true
- Les questions doivent être variées en formulation : affirmations à valider, questions sur des faits historiques, des records, des compétitions, des joueurs, des clubs, des règles, etc.
- Chaque option DOIT avoir une explication (explanation) qui explique pourquoi la réponse est correcte ou incorrecte
- Difficulté ${difficulty}: ${difficulty === 'FACILE' ? 'questions de culture générale football accessibles à tous' : difficulty === 'MOYEN' ? 'questions nécessitant une bonne connaissance du football' : 'questions pointues pour les vrais experts du football'}`;

    try {
      const response = await this.chatModel.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = response.content as string;
      
      // Extract JSON from response (handle potential markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const quizData = JSON.parse(jsonStr);

      // Validate the structure
      if (!quizData.title || !quizData.questions || !Array.isArray(quizData.questions)) {
        throw new Error('Structure JSON invalide');
      }

      // Create the quiz
      const quiz = await this.prisma.quiz.create({
        data: {
          themeId: generateQuizDto.themeId,
          title: quizData.title,
          description: quizData.description || '',
          difficulty: difficulty,
          timeLimit: Math.min(Math.max(Math.ceil(numberOfQuestions * 0.6), 3), 6),
          passingScore: 70,
          isFree: true,
          isActive: true,
        },
      });

      // Create questions with options
      for (const questionData of quizData.questions) {
        await this.prisma.question.create({
          data: {
            quizId: quiz.id,
            content: questionData.content,
            type: questionData.type || 'QCU',
            options: {
              create: questionData.options.map((opt: { content: string; isCorrect: boolean; explanation?: string }) => ({
                content: opt.content,
                isCorrect: opt.isCorrect,
                explanation: opt.explanation || null,
              })),
            },
          },
        });
      }

      // Return the complete quiz with questions
      return this.findQuizById(quiz.id);
    } catch (error) {
      this.logger.error('Erreur lors de la génération du quiz:', error);
      if (error instanceof SyntaxError) {
        throw new BadRequestException('Erreur de parsing de la réponse IA. Veuillez réessayer.');
      }
      throw new BadRequestException(
        error.message || 'Erreur lors de la génération du quiz. Veuillez réessayer.'
      );
    }
  }

  async analyzeQuestion(analyzeDto: AnalyzeQuestionDto): Promise<AnalysisResult> {
    if (!this.chatModel) {
      throw new BadRequestException('Service IA non configuré. Vérifiez la clé API OpenAI.');
    }

    // Get existing questions from the quiz for redundancy check (with full details)
    const existingQuestions = await this.prisma.question.findMany({
      where: { quizId: analyzeDto.quizId },
      select: { 
        id: true, 
        content: true,
        type: true,
        options: {
          select: {
            content: true,
            isCorrect: true,
          }
        }
      },
    });

    // Build the full question text for analysis
    const optionsText = analyzeDto.options
      .map((opt, i) => `  Option ${i + 1}: "${opt.content}" ${opt.isCorrect ? '(correcte)' : ''}`)
      .join('\n');
    
    const fullQuestionText = `Question: "${analyzeDto.content}"\nOptions:\n${optionsText}`;

    // Build existing questions text for redundancy check
    const existingQuestionsText = existingQuestions.length > 0
      ? existingQuestions.map((q, i) => `${i + 1}. "${q.content}"`).join('\n')
      : 'Aucune question existante.';

    const systemPrompt = `Tu es un assistant spécialisé dans l'analyse de questions de quiz éducatifs.
Tu dois effectuer deux analyses et retourner un JSON strict.

IMPORTANT: Ta réponse doit être UNIQUEMENT du JSON valide, sans texte avant ou après.`;

    const userPrompt = `Analyse cette question de quiz :

${fullQuestionText}

Questions existantes dans ce quiz :
${existingQuestionsText}

Effectue les analyses suivantes :

1. **Orthographe et grammaire** : Vérifie la qualité du français (orthographe, grammaire, ponctuation, clarté). Propose des corrections si nécessaire.

2. **Redondance** : Compare avec les questions existantes. Identifie si la nouvelle question est trop similaire à une question existante (même sujet, même formulation, etc.).

Retourne UNIQUEMENT un objet JSON avec cette structure exacte :
{
  "spelling": {
    "hasCorrections": true/false,
    "correctedContent": "Le texte de la question corrigé (ou identique si pas de correction)",
    "correctedOptions": ["Option 1 corrigée", "Option 2 corrigée", ...],
    "corrections": [
      {
        "field": "content" ou "option",
        "optionIndex": 0 (si field="option"),
        "original": "texte original",
        "corrected": "texte corrigé",
        "explanation": "explication de la correction"
      }
    ]
  },
  "redundancy": {
    "hasSimilarQuestions": true/false,
    "similarQuestions": [
      {
        "id": "id de la question similaire",
        "content": "contenu de la question similaire",
        "similarityScore": 0.85,
        "reason": "explication de la similarité"
      }
    ]
  }
}

Règles :
- Pour la similarité, un score > 0.7 indique une forte similarité
- Ne retourne que les questions avec un score de similarité > 0.5
- Sois précis dans les corrections orthographiques
- Explique brièvement chaque correction`;

    try {
      const response = await this.chatModel.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = response.content as string;
      
      // Extract JSON from response
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const analysisData = JSON.parse(jsonStr);

      // Build the result
      const result: AnalysisResult = {
        spelling: {
          original: analyzeDto.content,
          corrected: analysisData.spelling?.correctedContent || analyzeDto.content,
          hasCorrections: analysisData.spelling?.hasCorrections || false,
          corrections: (analysisData.spelling?.corrections || []).map((c: { field: string; optionIndex?: number; original: string; corrected: string; explanation?: string }) => ({
            field: c.field as 'content' | 'option',
            optionIndex: c.optionIndex,
            original: c.original,
            corrected: c.corrected,
            explanation: c.explanation,
          })),
        },
        redundancy: {
          hasSimilarQuestions: analysisData.redundancy?.hasSimilarQuestions || false,
          similarQuestions: (analysisData.redundancy?.similarQuestions || []).map((q: { id?: string; content: string; similarityScore: number }) => {
            // Find the actual question with full details from existing questions
            const matchingQuestion = existingQuestions.find(eq => eq.content === q.content);
            return {
              id: matchingQuestion?.id || q.id || '',
              content: q.content,
              similarityScore: q.similarityScore,
              type: matchingQuestion?.type,
              options: matchingQuestion?.options || [],
            };
          }),
        },
      };

      // Add corrected options to the result if available
      if (analysisData.spelling?.correctedOptions) {
        (result.spelling as { correctedOptions?: string[] }).correctedOptions = analysisData.spelling.correctedOptions;
      }

      return result;
    } catch (error) {
      this.logger.error('Erreur lors de l\'analyse de la question:', error);
      if (error instanceof SyntaxError) {
        throw new BadRequestException('Erreur de parsing de la réponse IA. Veuillez réessayer.');
      }
      throw new BadRequestException(
        error.message || 'Erreur lors de l\'analyse de la question. Veuillez réessayer.'
      );
    }
  }

  async generateQuestionsWithAI(generateDto: GenerateQuestionsDto) {
    if (!this.chatModel) {
      throw new BadRequestException('Service IA non configuré. Vérifiez la clé API OpenAI.');
    }

    // Get the quiz with its theme
    const quiz = await this.prisma.quiz.findUnique({
      where: { id: generateDto.quizId },
      include: { 
        theme: true,
        questions: {
          select: { content: true }
        }
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz non trouvé');
    }

    // Get existing questions to avoid duplicates
    const existingQuestionsText = quiz.questions.length > 0
      ? quiz.questions.map((q, i) => `${i + 1}. ${q.content}`).join('\n')
      : 'Aucune question existante.';

    // RAG context disabled (documents module removed)
    const ragContext = '';

    // Use quiz difficulty for questions
    const quizDifficulty = quiz.difficulty;

    // Handle type: QCU, QCM, or MIXTE
    const typeInstruction = generateDto.type === 'MIXTE'
      ? 'Mélange de QCU (Question à Choix Unique avec exactement 1 bonne réponse) et QCM (Question à Choix Multiple avec plusieurs bonnes réponses). Varie les types de manière équilibrée.'
      : generateDto.type === 'QCU'
        ? '(Question à Choix Unique) : exactement UNE seule bonne réponse parmi 4 options'
        : '(Question à Choix Multiple) : PLUSIEURS bonnes réponses parmi 4 options';

    const systemPrompt = `Tu es un expert en football et en création de quiz sportifs.
Tu possèdes une connaissance approfondie de l'histoire du football, des compétitions, des clubs, des joueurs, des règles et des tactiques.
Tu dois générer des questions de qualité, précises et intéressantes.

IMPORTANT: Ta réponse doit être UNIQUEMENT du JSON valide, sans texte avant ou après.`;

    const userPrompt = `Génère ${generateDto.numberOfQuestions} question(s) pour le quiz suivant :

Quiz : "${quiz.title}"
Description : "${quiz.description || 'Non spécifiée'}"
Thème : "${quiz.theme?.title || 'Non spécifié'}"
Difficulté du quiz : ${quizDifficulty}

Questions existantes (à ne pas dupliquer) :
${existingQuestionsText}
${ragContext}

Règles :
- Type de questions : ${typeInstruction}
- Difficulté ${quizDifficulty} : ${
  quizDifficulty === 'FACILE' ? 'questions de culture générale football accessibles à tous' :
  quizDifficulty === 'MOYEN' ? 'questions nécessitant une bonne connaissance du football' :
  'questions pointues pour les vrais experts du football'
}
- Les questions doivent porter sur le football (histoire, compétitions, joueurs, clubs, règles, tactiques, records)
- Évite les questions trop similaires aux questions existantes
- Chaque question doit avoir exactement 4 options

Retourne UNIQUEMENT un tableau JSON avec cette structure :
[
  {
    "content": "Texte de la question",
    "type": "QCU" ou "QCM",
    "options": [
      { "content": "Option 1", "isCorrect": false, "explanation": "Explication pourquoi cette réponse est incorrecte" },
      { "content": "Option 2", "isCorrect": true, "explanation": "Explication pourquoi cette réponse est correcte" },
      { "content": "Option 3", "isCorrect": false, "explanation": "Explication pourquoi cette réponse est incorrecte" },
      { "content": "Option 4", "isCorrect": false, "explanation": "Explication pourquoi cette réponse est incorrecte" }
    ]
  }
]

IMPORTANT: Chaque option DOIT avoir une explication (explanation) qui explique pourquoi la réponse est correcte ou incorrecte.`;

    try {
      const response = await this.chatModel.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const content = response.content as string;
      
      // Extract JSON from response
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const questionsData = JSON.parse(jsonStr);

      if (!Array.isArray(questionsData)) {
        throw new BadRequestException('Format de réponse IA invalide');
      }

      // Create questions in database
      const createdQuestions: Awaited<ReturnType<typeof this.prisma.question.create>>[] = [];
      for (const questionData of questionsData) {
        // For MIXTE type, use the type from AI response; otherwise use the specified type
        const questionType = generateDto.type === 'MIXTE' 
          ? (questionData.type || 'QCU') 
          : generateDto.type;
        
        const question = await this.prisma.question.create({
          data: {
            quizId: generateDto.quizId,
            content: questionData.content,
            type: questionType,
            options: {
              create: questionData.options.map((opt: { content: string; isCorrect: boolean; explanation?: string }) => ({
                content: opt.content,
                isCorrect: opt.isCorrect,
                explanation: opt.explanation || null,
              })),
            },
          },
          include: { options: true },
        });
        createdQuestions.push(question);
      }

      return {
        message: `${createdQuestions.length} question(s) générée(s) avec succès`,
        questions: createdQuestions,
      };
    } catch (error) {
      this.logger.error('Erreur lors de la génération des questions:', error);
      if (error instanceof SyntaxError) {
        throw new BadRequestException('Erreur de parsing de la réponse IA. Veuillez réessayer.');
      }
      throw new BadRequestException(
        error.message || 'Erreur lors de la génération des questions. Veuillez réessayer.'
      );
    }
  }

  /**
   * Generate a random revision quiz with 10 questions from various themes/quizzes
   * Only for premium users, no history saved, no stars earned
   */
  async getRandomRevisionQuiz(userId: string) {
    // Get 10 random questions from the database
    const allQuestions = await this.prisma.question.findMany({
      include: {
        options: true,
        quiz: {
          select: {
            id: true,
            title: true,
            theme: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    if (allQuestions.length < 10) {
      throw new BadRequestException('Pas assez de questions disponibles pour générer un quiz de révision');
    }

    // Shuffle and pick 10 random questions
    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    const selectedQuestions = shuffled.slice(0, 10);

    // Return a virtual quiz object (not saved to database)
    return {
      id: 'revision-' + Date.now(),
      title: 'Quiz de Révision',
      description: 'Quiz aléatoire de révision - 10 questions variées',
      difficulty: 'MEDIUM',
      timeLimit: 5, // 5 minutes
      passingScore: 70,
      isRevisionQuiz: true,
      questions: selectedQuestions.map(q => ({
        id: q.id,
        content: q.content,
        type: q.type,
        quizTitle: q.quiz.title,
        themeTitle: q.quiz.theme?.title,
        options: q.options.map(o => ({
          id: o.id,
          content: o.content,
          isCorrect: o.isCorrect,
          // Don't include explanation initially - only in correction
        })),
      })),
    };
  }

  /**
   * Submit a revision quiz and get correction
   * No history saved, no stars earned
   */
  async submitRevisionQuiz(userId: string, answers: Record<string, string[]>) {
    const questionIds = Object.keys(answers);
    
    // Get all questions with their options
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: {
        options: true,
        quiz: {
          select: {
            title: true,
            theme: {
              select: { title: true },
            },
          },
        },
      },
    });

    let correctCount = 0;
    const results = questions.map(question => {
      const userAnswers = answers[question.id] || [];
      const correctOptions = question.options.filter(o => o.isCorrect).map(o => o.id);
      
      // Check if answer is correct
      const isCorrect = 
        userAnswers.length === correctOptions.length &&
        userAnswers.every(a => correctOptions.includes(a));
      
      if (isCorrect) correctCount++;

      return {
        questionId: question.id,
        content: question.content,
        type: question.type,
        quizTitle: question.quiz.title,
        themeTitle: question.quiz.theme?.title,
        userAnswers,
        isCorrect,
        options: question.options.map(o => ({
          id: o.id,
          content: o.content,
          isCorrect: o.isCorrect,
          explanation: o.explanation, // Include explanation in correction
          wasSelected: userAnswers.includes(o.id),
        })),
      };
    });

    const score = Math.round((correctCount / questions.length) * 100);

    return {
      score,
      correctCount,
      totalQuestions: questions.length,
      passed: score >= 70,
      results,
    };
  }
}
