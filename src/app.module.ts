import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { ThemesModule } from './themes/themes.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { UploadModule } from './upload/upload.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UsersModule } from './users/users.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { DuelsModule } from './duels/duels.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot(
      {
        rootPath: join(process.cwd(), 'uploads'),
        serveRoot: '/uploads',
      },
      {
        rootPath: join(process.cwd(), 'uploads', 'documents'),
        serveRoot: '/uploads/documents',
      },
    ),
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    ThemesModule,
    QuizzesModule,
    UploadModule,
    DashboardModule,
    LeaderboardModule,
    DuelsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
