import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendTestEmail(to: string) {
    await this.mailerService.sendMail({
      to,
      subject: '✅ Test email NestJS',
      html: `
        <h2>Test réussi 🎉</h2>
        <p>Ton application NestJS en local envoie des emails.</p>
        <p><b>Port :</b> localhost:3000</p>
      `,
    });
  }

  async sendVerificationEmail(to: string, code: string) {
    await this.mailerService.sendMail({
      to,
      subject: '🔐 Vérification de votre email - Footix',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #D4AF37 0%, #B8960F 100%); padding: 32px 20px; text-align: center;">
            <h1 style="color: #D4A843; font-size: 28px; margin: 0; font-weight: 700; letter-spacing: 1px;">Footix</h1>
            <p style="color: rgba(255,255,255,0.85); font-size: 13px; margin: 6px 0 0 0;">Quiz football entre amis</p>
          </div>
          <!-- Body -->
          <div style="padding: 36px 32px;">
            <h2 style="color: #D4AF37; font-size: 22px; margin: 0 0 16px 0;">Vérification de votre adresse email</h2>
            <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
              Bienvenue sur Footix ! Pour finaliser votre inscription, veuillez utiliser le code de vérification ci-dessous :
            </p>
            <div style="background-color: #f0f7f3; padding: 24px; text-align: center; border-radius: 8px; margin: 24px 0; border: 1px solid #d4e8dc;">
              <span style="font-size: 36px; font-weight: bold; color: #D4AF37; letter-spacing: 6px;">${code}</span>
            </div>
            <div style="background-color: #f0f7f3; border-left: 4px solid #D4A843; padding: 14px 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
              <p style="color: #5A7265; font-size: 13px; margin: 0;">
                ⏱ Ce code expire dans <strong>1 heure</strong>. Si vous n'avez pas créé de compte sur Footix, ignorez cet email.
              </p>
            </div>
          </div>
          <!-- Footer -->
          <div style="background-color: #f8faf9; padding: 20px 32px; border-top: 1px solid #e8efe9;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
              © ${new Date().getFullYear()} Footix - Quiz football entre amis
            </p>
          </div>
        </div>
      `,
    });
  }

  async sendPasswordResetEmail(to: string, resetLink: string) {
    await this.mailerService.sendMail({
      to,
      subject: '🔑 Réinitialisation de votre mot de passe - Footix',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #D4AF37 0%, #B8960F 100%); padding: 32px 20px; text-align: center;">
            <h1 style="color: #D4A843; font-size: 28px; margin: 0; font-weight: 700; letter-spacing: 1px;">Footix</h1>
            <p style="color: rgba(255,255,255,0.85); font-size: 13px; margin: 6px 0 0 0;">Quiz football entre amis</p>
          </div>
          <!-- Body -->
          <div style="padding: 36px 32px;">
            <h2 style="color: #D4AF37; font-size: 22px; margin: 0 0 16px 0;">Réinitialisation de votre mot de passe</h2>
            <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
              Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #B8960F 100%); color: #ffffff; padding: 14px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 3px 12px rgba(27,94,61,0.3);">
                Réinitialiser mon mot de passe
              </a>
            </div>
            <div style="background-color: #f0f7f3; border-left: 4px solid #D4A843; padding: 14px 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
              <p style="color: #5A7265; font-size: 13px; margin: 0;">
                ⏱ Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
              </p>
            </div>
            <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 20px 0 0 0;">
              Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :<br>
              <a href="${resetLink}" style="color: #D4AF37; word-break: break-all; font-size: 12px;">${resetLink}</a>
            </p>
          </div>
          <!-- Footer -->
          <div style="background-color: #f8faf9; padding: 20px 32px; border-top: 1px solid #e8efe9;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
              © ${new Date().getFullYear()} Footix - Quiz football entre amis
            </p>
          </div>
        </div>
      `,
    });
  }

  /**
   * Send a custom email to one or multiple recipients
   * Used by admin to send bulk emails
   */
  async sendBulkEmail(
    recipients: string[],
    subject: string,
    htmlContent: string,
    signatureImageUrl?: string,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Build signature block if image URL is provided
    const signatureBlock = signatureImageUrl
      ? `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <img src="${signatureImageUrl}" alt="Signature Footix" style="max-width: 100%; height: auto; display: block;" />
        </div>
      `
      : '';

    // Wrap the content in a nice template
    const wrappedHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #D4AF37; margin: 0;">Footix</h1>
          <p style="color: #6b7280; font-size: 14px; margin-top: 5px;">Quiz football entre amis</p>
        </div>
        <div style="color: #1f2937; font-size: 16px; line-height: 1.6;">
          ${htmlContent}
        </div>
        ${signatureBlock}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0 20px 0;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          © ${new Date().getFullYear()} Footix - Tous droits réservés
        </p>
        <p style="color: #9ca3af; font-size: 11px; text-align: center;">
          Vous recevez cet email car vous êtes inscrit sur Footix.
        </p>
      </div>
    `;

    // Send emails one by one to avoid rate limiting and track individual failures
    for (const recipient of recipients) {
      try {
        await this.mailerService.sendMail({
          to: recipient,
          subject,
          html: wrappedHtml,
        });
        success++;
      } catch (error) {
        failed++;
        errors.push(`${recipient}: ${error.message || 'Unknown error'}`);
      }
    }

    return { success, failed, errors };
  }

  async sendFeedbackResponseEmail(
    to: string,
    firstName: string,
    feedbackType: string,
    subject: string,
    originalMessage: string,
    adminResponse: string,
  ) {
    await this.mailerService.sendMail({
      to,
      subject: `💬 Réponse à votre ${feedbackType.toLowerCase()} - Footix`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #D4AF37 0%, #B8960F 100%); padding: 32px 20px; text-align: center;">
            <h1 style="color: #D4A843; font-size: 28px; margin: 0; font-weight: 700; letter-spacing: 1px;">Footix</h1>
            <p style="color: rgba(255,255,255,0.85); font-size: 13px; margin: 6px 0 0 0;">Quiz football entre amis</p>
          </div>
          <!-- Body -->
          <div style="padding: 36px 32px;">
            <h2 style="color: #D4AF37; font-size: 22px; margin: 0 0 16px 0;">Bonjour ${firstName},</h2>
            <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
              L'équipe Footix a répondu à votre <strong>${feedbackType.toLowerCase()}</strong>.
            </p>

            <!-- Original message -->
            <div style="background-color: #f8faf9; border-left: 4px solid #D1DDD6; padding: 16px; border-radius: 0 8px 8px 0; margin: 0 0 20px 0;">
              <p style="color: #5A7265; font-size: 12px; font-weight: 600; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px;">Votre message — ${subject}</p>
              <p style="color: #4b5563; font-size: 14px; line-height: 1.5; margin: 0; white-space: pre-line;">${originalMessage}</p>
            </div>

            <!-- Admin response -->
            <div style="background-color: #f0f7f3; border-left: 4px solid #D4AF37; padding: 16px; border-radius: 0 8px 8px 0; margin: 0 0 24px 0;">
              <p style="color: #D4AF37; font-size: 12px; font-weight: 600; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px;">Réponse de l'équipe</p>
              <p style="color: #1A2E23; font-size: 14px; line-height: 1.5; margin: 0; white-space: pre-line;">${adminResponse}</p>
            </div>

            <div style="background-color: #f0f7f3; border-left: 4px solid #D4A843; padding: 14px 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
              <p style="color: #5A7265; font-size: 13px; margin: 0;">
                Merci pour votre retour ! Votre avis nous aide à améliorer Footix.
              </p>
            </div>
          </div>
          <!-- Footer -->
          <div style="background-color: #f8faf9; padding: 20px 32px; border-top: 1px solid #e8efe9;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
              © ${new Date().getFullYear()} Footix - Quiz football entre amis
            </p>
          </div>
        </div>
      `,
    });
  }
}
