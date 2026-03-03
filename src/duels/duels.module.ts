import { Module } from '@nestjs/common';
import { DuelsService } from './duels.service';
import { DuelsController } from './duels.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DuelsController],
  providers: [DuelsService],
  exports: [DuelsService],
})
export class DuelsModule {}
