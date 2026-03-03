import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { DuelsService } from './duels.service';
import { CreateDuelDto } from './dto/create-duel.dto';
import { JoinDuelDto } from './dto/join-duel.dto';
import { SubmitDuelDto } from './dto/submit-duel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('duels')
@UseGuards(JwtAuthGuard)
export class DuelsController {
  constructor(private readonly duelsService: DuelsService) {}

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() createDuelDto: CreateDuelDto,
  ) {
    return this.duelsService.create(userId, createDuelDto);
  }

  @Post('join')
  join(
    @CurrentUser('id') userId: string,
    @Body() joinDuelDto: JoinDuelDto,
  ) {
    return this.duelsService.join(userId, joinDuelDto);
  }

  @Get('my')
  getMyDuels(@CurrentUser('id') userId: string) {
    return this.duelsService.getMyDuels(userId);
  }

  @Get(':id')
  getDuel(
    @CurrentUser('id') userId: string,
    @Param('id') duelId: string,
  ) {
    return this.duelsService.getDuel(userId, duelId);
  }

  @Get(':id/questions')
  getDuelQuestions(
    @CurrentUser('id') userId: string,
    @Param('id') duelId: string,
  ) {
    return this.duelsService.getDuelQuestions(userId, duelId);
  }

  @Post(':id/launch')
  launch(
    @CurrentUser('id') userId: string,
    @Param('id') duelId: string,
  ) {
    return this.duelsService.launch(userId, duelId);
  }

  @Post('submit')
  submit(
    @CurrentUser('id') userId: string,
    @Body() submitDuelDto: SubmitDuelDto,
  ) {
    return this.duelsService.submit(userId, submitDuelDto);
  }

  @Delete(':id/leave')
  leave(
    @CurrentUser('id') userId: string,
    @Param('id') duelId: string,
  ) {
    return this.duelsService.leave(userId, duelId);
  }

  @Post('cleanup')
  cleanup() {
    return Promise.all([
      this.duelsService.checkExpiredDuels(),
      this.duelsService.checkTimedOutDuels(),
    ]);
  }
}
