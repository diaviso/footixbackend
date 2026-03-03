import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MailService } from './mail.service';
import { SendBulkEmailDto } from './dto/send-bulk-email.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('mail')
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get recipient counts by category for the email form
   */
  @Get('admin/recipient-counts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getRecipientCounts() {
    const baseWhere = { isEmailVerified: true, emailNotifications: true };

    const all = await this.prisma.user.count({ where: baseWhere });

    return { all, premium: 0, free: all };
  }

  /**
   * Search users for manual selection (paginated, max 20)
   */
  @Get('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getEligibleUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = Math.min(limit ? parseInt(limit, 10) : 20, 50);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      isEmailVerified: true,
      emailNotifications: true,
    };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
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
          createdAt: true,
          emailNotifications: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  }

  /**
   * Send bulk email to selected users or by category
   */
  @Post('admin/send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async sendBulkEmail(
    @CurrentUser('id') adminId: string,
    @Body() sendBulkEmailDto: SendBulkEmailDto,
  ) {
    let recipients: string[] = [];

    if (sendBulkEmailDto.recipientCategory) {
      // Category-based sending
      const baseWhere: any = { isEmailVerified: true, emailNotifications: true };
      // Premium categories removed - all users are treated equally
      const users = await this.prisma.user.findMany({
        where: baseWhere,
        select: { email: true },
      });
      recipients = users.map(u => u.email);
    } else if (sendBulkEmailDto.sendToAll) {
      // Legacy: send to all
      const users = await this.prisma.user.findMany({
        where: {
          isEmailVerified: true,
          emailNotifications: true,
        },
        select: {
          email: true,
        },
      });
      recipients = users.map(u => u.email);
    } else if (sendBulkEmailDto.userIds && sendBulkEmailDto.userIds.length > 0) {
      // Manual selection by userIds
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: sendBulkEmailDto.userIds },
          isEmailVerified: true,
          emailNotifications: true,
        },
        select: {
          email: true,
        },
      });
      recipients = users.map(u => u.email);
    }

    if (recipients.length === 0) {
      return {
        success: 0,
        failed: 0,
        errors: [],
        message: 'Aucun destinataire valide trouvé',
      };
    }

    const result = await this.mailService.sendBulkEmail(
      recipients,
      sendBulkEmailDto.subject,
      sendBulkEmailDto.htmlContent,
      sendBulkEmailDto.signatureImageUrl,
    );

    // Save to email history
    await this.prisma.emailHistory.create({
      data: {
        subject: sendBulkEmailDto.subject,
        htmlContent: sendBulkEmailDto.htmlContent,
        recipientCount: recipients.length,
        recipientEmails: JSON.stringify(recipients),
        successCount: result.success,
        failedCount: result.failed,
        errors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        sentById: adminId,
      },
    });

    return {
      ...result,
      totalRecipients: recipients.length,
      message: result.failed === 0
        ? `Email envoyé avec succès à ${result.success} destinataire(s)`
        : `Email envoyé à ${result.success} destinataire(s), ${result.failed} échec(s)`,
    };
  }

  /**
   * Get email history for admin
   */
  @Get('admin/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getEmailHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const skip = (pageNum - 1) * limitNum;

    const [history, total] = await Promise.all([
      this.prisma.emailHistory.findMany({
        orderBy: { sentAt: 'desc' },
        include: {
          sentBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        skip,
        take: limitNum,
      }),
      this.prisma.emailHistory.count(),
    ]);

    return {
      data: history.map(h => ({
        ...h,
        recipientEmails: JSON.parse(h.recipientEmails),
        errors: h.errors ? JSON.parse(h.errors) : [],
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }
}
