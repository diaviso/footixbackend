import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { randomBytes, randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      // If user exists but email is NOT verified, resend a new verification code
      if (!existingUser.isEmailVerified) {
        // Update password and name in case they changed
        const hashedPassword = await bcrypt.hash(registerDto.password, 10);
        await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            password: hashedPassword,
            firstName: registerDto.firstName,
            lastName: registerDto.lastName,
          },
        });

        // Delete old verification codes
        await this.prisma.emailVerification.deleteMany({
          where: { userId: existingUser.id },
        });

        // Generate and send new code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        await this.prisma.emailVerification.create({
          data: {
            userId: existingUser.id,
            code: verificationCode,
            expiresAt,
          },
        });

        await this.mailService.sendVerificationEmail(existingUser.email, verificationCode);

        return {
          message: 'A new verification code has been sent to your email.',
          userId: existingUser.id,
          resent: true,
        };
      }

      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const userCount = await this.prisma.user.count();
    const isFirstUser = userCount === 0;

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: isFirstUser ? 'ADMIN' : 'USER',
      },
    });

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.prisma.emailVerification.create({
      data: {
        userId: user.id,
        code: verificationCode,
        expiresAt,
      },
    });

    await this.mailService.sendVerificationEmail(user.email, verificationCode);

    return {
      message: 'Registration successful. Please check your email for verification code.',
      userId: user.id,
    };
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: verifyEmailDto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const verification = await this.prisma.emailVerification.findFirst({
      where: {
        userId: user.id,
        code: verifyEmailDto.code,
        expiresAt: { gte: new Date() },
      },
    });

    if (!verification) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    // Generate new session token and invalidate previous session
    const sessionToken = randomUUID();

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true, currentSessionToken: sessionToken },
    });

    await this.prisma.emailVerification.deleteMany({
      where: { userId: user.id },
    });

    const token = this.generateToken(updatedUser, sessionToken);

    return {
      message: 'Email verified successfully',
      token,
      user: this.sanitizeUser(updatedUser),
    };
  }

  async checkActiveSession(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { currentSessionToken: true },
    });

    return {
      hasActiveSession: !!user?.currentSessionToken,
    };
  }

  async login(loginDto: LoginDto, forceLogin = false) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isEmailVerified) {
      // Auto-resend verification code
      await this.prisma.emailVerification.deleteMany({
        where: { userId: user.id },
      });
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      await this.prisma.emailVerification.create({
        data: { userId: user.id, code: verificationCode, expiresAt },
      });
      await this.mailService.sendVerificationEmail(user.email, verificationCode);

      throw new UnauthorizedException('EMAIL_NOT_VERIFIED');
    }

    // Generate new session token and invalidate previous session
    const sessionToken = randomUUID();
    
    // Update user with new session token
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { currentSessionToken: sessionToken },
    });

    const token = this.generateToken(updatedUser, sessionToken);

    return {
      token,
      user: this.sanitizeUser(updatedUser),
    };
  }

  async googleLogin(profile: any) {
    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.id },
    });

    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { email: profile.emails[0].value },
      });

      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: profile.id,
            isEmailVerified: true,
          },
        });
      } else {
        const userCount = await this.prisma.user.count();
        const isFirstUser = userCount === 0;

        user = await this.prisma.user.create({
          data: {
            email: profile.emails[0].value,
            googleId: profile.id,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            isEmailVerified: true,
            role: isFirstUser ? 'ADMIN' : 'USER',
          },
        });
      }
    }

    // Generate new session token and invalidate previous session
    const sessionToken = randomUUID();
    
    // Update user with new session token
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { currentSessionToken: sessionToken },
    });

    const token = this.generateToken(updatedUser, sessionToken);

    return {
      token,
      user: this.sanitizeUser(updatedUser),
    };
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: any = {};

    if (updateProfileDto.email && updateProfileDto.email !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateProfileDto.email },
      });

      if (existingUser) {
        throw new ConflictException('Email already in use');
      }

      updateData.email = updateProfileDto.email;
      updateData.isEmailVerified = false;

      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await this.prisma.emailVerification.create({
        data: {
          userId: user.id,
          code: verificationCode,
          expiresAt,
        },
      });

      await this.mailService.sendVerificationEmail(updateProfileDto.email, verificationCode);
    }

    if (updateProfileDto.password) {
      updateData.password = await bcrypt.hash(updateProfileDto.password, 10);
    }

    if (updateProfileDto.firstName) {
      updateData.firstName = updateProfileDto.firstName;
    }

    if (updateProfileDto.lastName) {
      updateData.lastName = updateProfileDto.lastName;
    }

    if (updateProfileDto.country !== undefined) {
      updateData.country = updateProfileDto.country;
    }

    if (updateProfileDto.city !== undefined) {
      updateData.city = updateProfileDto.city;
    }

    if (updateProfileDto.emailNotifications !== undefined) {
      updateData.emailNotifications = updateProfileDto.emailNotifications;
    }

    if (updateProfileDto.pushNotifications !== undefined) {
      updateData.pushNotifications = updateProfileDto.pushNotifications;
    }

    if (updateProfileDto.marketingEmails !== undefined) {
      updateData.marketingEmails = updateProfileDto.marketingEmails;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return {
      message: 'Profile updated successfully',
      user: this.sanitizeUser(updatedUser),
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: forgotPasswordDto.email },
    });

    if (!user) {
      return {
        message: 'Si un compte existe avec cet email, vous recevrez un lien de réinitialisation.',
      };
    }

    await this.prisma.passwordReset.deleteMany({
      where: { userId: user.id },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;
    await this.mailService.sendPasswordResetEmail(user.email, resetLink);

    return {
      message: 'Si un compte existe avec cet email, vous recevrez un lien de réinitialisation.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const passwordReset = await this.prisma.passwordReset.findUnique({
      where: { token: resetPasswordDto.token },
      include: { user: true },
    });

    if (!passwordReset) {
      throw new BadRequestException('Lien de réinitialisation invalide ou expiré');
    }

    if (passwordReset.expiresAt < new Date()) {
      await this.prisma.passwordReset.delete({
        where: { id: passwordReset.id },
      });
      throw new BadRequestException('Lien de réinitialisation expiré');
    }

    const hashedPassword = await bcrypt.hash(resetPasswordDto.password, 10);

    await this.prisma.user.update({
      where: { id: passwordReset.userId },
      data: { password: hashedPassword },
    });

    await this.prisma.passwordReset.delete({
      where: { id: passwordReset.id },
    });

    return {
      message: 'Votre mot de passe a été réinitialisé avec succès',
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (!user.password) {
      throw new BadRequestException('Vous utilisez une connexion Google. Vous ne pouvez pas changer votre mot de passe.');
    }

    const isCurrentPasswordValid = await bcrypt.compare(changePasswordDto.currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return {
      message: 'Votre mot de passe a été modifié avec succès',
    };
  }

  async updateLeaderboardVisibility(userId: string, showInLeaderboard: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { showInLeaderboard },
    });

    return {
      message: 'Préférence de visibilité mise à jour',
      user: this.sanitizeUser(updatedUser),
    };
  }

  async updateAvatar(userId: string, avatarPath: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarPath },
    });

    return {
      message: 'Photo de profil mise à jour',
      user: this.sanitizeUser(updatedUser),
    };
  }

  async googleMobileLogin(idToken: string) {
    // Verify the Google ID token
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    
    if (!response.ok) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const payload = await response.json();
    
    // Verify the token is for our app (accept Web + Android debug/release + iOS client IDs)
    const allowedClientIds = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_ANDROID_RELEASE_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
    ].filter(Boolean);
    if (!allowedClientIds.includes(payload.aud)) {
      throw new UnauthorizedException('Invalid token audience');
    }

    const { sub: googleId, email, given_name: firstName, family_name: lastName, picture: avatar } = payload;

    let user = await this.prisma.user.findUnique({
      where: { googleId },
    });

    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            isEmailVerified: true,
          },
        });
      } else {
        const userCount = await this.prisma.user.count();
        const isFirstUser = userCount === 0;

        user = await this.prisma.user.create({
          data: {
            email,
            googleId,
            firstName: firstName || 'User',
            lastName: lastName || '',
            isEmailVerified: true,
            role: isFirstUser ? 'ADMIN' : 'USER',
          },
        });
      }
    }

    // Generate new session token and invalidate previous session
    const sessionToken = randomUUID();

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { currentSessionToken: sessionToken },
    });

    const token = this.generateToken(updatedUser, sessionToken);

    return {
      token,
      user: this.sanitizeUser(updatedUser),
    };
  }

  async resendVerificationCode(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Delete old verification codes
    await this.prisma.emailVerification.deleteMany({
      where: { userId: user.id },
    });

    // Generate and send new code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.prisma.emailVerification.create({
      data: {
        userId: user.id,
        code: verificationCode,
        expiresAt,
      },
    });

    await this.mailService.sendVerificationEmail(user.email, verificationCode);

    return {
      message: 'A new verification code has been sent to your email.',
    };
  }

  private generateToken(user: any, sessionToken?: string) {
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      sessionToken: sessionToken || user.currentSessionToken,
    };
    return this.jwtService.sign(payload);
  }

  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Delete the user — all related data will be cascade-deleted by Prisma
    await this.prisma.user.delete({ where: { id: userId } });

    return { message: 'Votre compte a été supprimé avec succès. Toutes vos données ont été effacées.' };
  }

  private sanitizeUser(user: any) {
    const { password, ...result } = user;
    return result;
  }
}
