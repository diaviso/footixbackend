import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { QuizzesService } from './quizzes.service';
import { CreateQuizDto } from './dto/create-quiz.dto';
import { UpdateQuizDto } from './dto/update-quiz.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { AnalyzeQuestionDto } from './dto/analyze-question.dto';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { GenerateQuizDto } from './dto/generate-quiz.dto';
import { PurchaseAttemptDto } from './dto/purchase-attempt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createQuiz(@Body() createQuizDto: CreateQuizDto) {
    return this.quizzesService.createQuiz(createQuizDto);
  }

  @Get()
  findAllQuizzes(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('themeId') themeId?: string,
  ) {
    return this.quizzesService.findAllQuizzes(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      search,
      themeId,
    );
  }

  // Static routes MUST be before dynamic :id routes
  @Get('attempts/me')
  @UseGuards(JwtAuthGuard)
  getUserAttempts(@CurrentUser('id') userId: string) {
    return this.quizzesService.getUserAttempts(userId);
  }

  @Get('attempts')
  @UseGuards(JwtAuthGuard)
  getUserAttemptsAlias(@CurrentUser('id') userId: string) {
    return this.quizzesService.getUserAttempts(userId);
  }

  @Post('questions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createQuestion(@Body() createQuestionDto: CreateQuestionDto) {
    return this.quizzesService.createQuestion(createQuestionDto);
  }

  @Get('questions/:id')
  findQuestionById(@Param('id') id: string) {
    return this.quizzesService.findQuestionById(id);
  }

  @Patch('questions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateQuestion(@Param('id') id: string, @Body() updateQuestionDto: UpdateQuestionDto) {
    return this.quizzesService.updateQuestion(id, updateQuestionDto);
  }

  @Delete('questions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  removeQuestion(@Param('id') id: string) {
    return this.quizzesService.removeQuestion(id);
  }

  @Post('submit')
  @UseGuards(JwtAuthGuard)
  submitQuiz(
    @CurrentUser('id') userId: string,
    @Body() submitQuizDto: SubmitQuizDto,
  ) {
    return this.quizzesService.submitQuiz(userId, submitQuizDto);
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  generateQuiz(@Body() generateQuizDto: GenerateQuizDto) {
    return this.quizzesService.generateQuizWithAI(generateQuizDto);
  }

  @Post('purchase-attempt')
  @UseGuards(JwtAuthGuard)
  purchaseExtraAttempt(
    @CurrentUser('id') userId: string,
    @Body() purchaseAttemptDto: PurchaseAttemptDto,
  ) {
    return this.quizzesService.purchaseExtraAttempt(userId, purchaseAttemptDto);
  }

  @Get('with-status')
  @UseGuards(JwtAuthGuard)
  getQuizzesWithUserStatus(@CurrentUser('id') userId: string) {
    return this.quizzesService.getQuizzesWithUserStatus(userId);
  }

  @Post('questions/analyze')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  analyzeQuestion(@Body() analyzeQuestionDto: AnalyzeQuestionDto) {
    return this.quizzesService.analyzeQuestion(analyzeQuestionDto);
  }

  @Get('revision/random')
  @UseGuards(JwtAuthGuard)
  getRandomRevisionQuiz(@CurrentUser('id') userId: string) {
    return this.quizzesService.getRandomRevisionQuiz(userId);
  }

  @Post('revision/submit')
  @UseGuards(JwtAuthGuard)
  submitRevisionQuiz(
    @CurrentUser('id') userId: string,
    @Body() body: { answers: Record<string, string[]> },
  ) {
    return this.quizzesService.submitRevisionQuiz(userId, body.answers);
  }

  @Post('questions/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  generateQuestions(@Body() generateQuestionsDto: GenerateQuestionsDto) {
    return this.quizzesService.generateQuestionsWithAI(generateQuestionsDto);
  }

  // Dynamic :id routes MUST be after static routes
  // For admin users - includes explanations
  @Get(':id/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findQuizByIdAdmin(@Param('id') id: string) {
    return this.quizzesService.findQuizById(id, true);
  }

  // For regular users - excludes explanations (they see explanations only in correction)
  @Get(':id')
  findQuizById(@Param('id') id: string) {
    return this.quizzesService.findQuizById(id, false);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateQuiz(@Param('id') id: string, @Body() updateQuizDto: UpdateQuizDto) {
    return this.quizzesService.updateQuiz(id, updateQuizDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  removeQuiz(@Param('id') id: string) {
    return this.quizzesService.removeQuiz(id);
  }

  @Get(':id/attempts')
  @UseGuards(JwtAuthGuard)
  getUserQuizAttempts(
    @CurrentUser('id') userId: string,
    @Param('id') quizId: string,
  ) {
    return this.quizzesService.getUserQuizAttempts(userId, quizId);
  }

  @Get(':id/correction')
  @UseGuards(JwtAuthGuard)
  getQuizWithCorrections(
    @CurrentUser('id') userId: string,
    @Param('id') quizId: string,
  ) {
    return this.quizzesService.getQuizWithCorrections(userId, quizId);
  }

  @Get(':id/access')
  @UseGuards(JwtAuthGuard)
  checkQuizAccess(
    @CurrentUser('id') userId: string,
    @Param('id') quizId: string,
  ) {
    return this.quizzesService.checkQuizAccess(userId, quizId);
  }
}
