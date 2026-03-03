/**
 * Migration Script: Old Django DecLearningAPI → New NestJS Footix
 * 
 * Reads prod.sql dump and inserts data into the new Prisma database.
 * 
 * Usage:
 *   npx ts-node scripts/migrate-prod-data.ts
 * 
 * Prerequisites:
 *   - DATABASE_URL must be set in .env pointing to the NEW database
 *   - The new database must have the Prisma schema applied (npx prisma db push)
 *   - prod.sql must be at the path specified below
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { PrismaClient } = require('../src/generated/prisma');
import * as fs from 'fs';

const prisma = new PrismaClient();

// ============================================================
// CONFIGURATION
// ============================================================
const SQL_DUMP_PATH = 'F:\\prod.sql';

// ============================================================
// SQL PARSER — Extracts tab-separated data from COPY blocks
// ============================================================
function extractTableData(sql: string, tableName: string, columns: string[]): Record<string, string | null>[] {
  // Match COPY public."TableName" (...) FROM stdin;\n<data>\n\.
  const escapedName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `COPY public\\."${escapedName}"\\s*\\([^)]+\\)\\s*FROM stdin;\\n([\\s\\S]*?)\\n\\\\\\.`,
    'm'
  );
  const match = sql.match(regex);
  if (!match) {
    console.log(`  ⚠ Table "${tableName}" not found or empty`);
    return [];
  }

  const dataBlock = match[1];
  if (!dataBlock.trim()) return [];

  const rows: Record<string, string | null>[] = [];
  const lines = dataBlock.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const values = line.split('\t');
    const row: Record<string, string | null> = {};
    for (let i = 0; i < columns.length; i++) {
      const val = values[i];
      row[columns[i]] = val === '\\N' ? null : val;
    }
    rows.push(row);
  }

  return rows;
}

// ============================================================
// HELPERS
// ============================================================
function splitName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName || !fullName.trim()) return { firstName: 'Utilisateur', lastName: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function mapDifficulty(old: string): 'FACILE' | 'MOYEN' | 'DIFFICILE' {
  switch (old?.toUpperCase()) {
    case 'EASY': return 'FACILE';
    case 'MEDIUM': return 'MOYEN';
    case 'HARD': return 'DIFFICILE';
    default: return 'MOYEN';
  }
}

function mapPaymentStatus(old: string): 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' {
  switch (old?.toUpperCase()) {
    case 'SUCCESS': return 'COMPLETED';
    case 'FAILED': return 'FAILED';
    case 'PENDING': return 'PENDING';
    case 'REFUNDED': return 'REFUNDED';
    default: return 'PENDING';
  }
}

function safeDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function safeInt(val: string | null, defaultVal: number = 0): number {
  if (!val) return defaultVal;
  const n = parseInt(val, 10);
  return isNaN(n) ? defaultVal : n;
}

function safeFloat(val: string | null, defaultVal: number = 0): number {
  if (!val) return defaultVal;
  const n = parseFloat(val);
  return isNaN(n) ? defaultVal : n;
}

// ============================================================
// MAIN MIGRATION
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('  MIGRATION: Old Django DB → New NestJS/Prisma DB');
  console.log('='.repeat(60));
  console.log();

  // Read SQL dump
  console.log(`📂 Reading SQL dump from: ${SQL_DUMP_PATH}`);
  const sql = fs.readFileSync(SQL_DUMP_PATH, 'utf-8');
  console.log(`   File size: ${(sql.length / 1024 / 1024).toFixed(1)} MB`);
  console.log();

  // ========================================
  // STEP 0: CLEAR EXISTING DATA
  // ========================================
  console.log('━'.repeat(60));
  console.log('STEP 0: Clearing existing database (test data)');
  console.log('━'.repeat(60));

  // Delete in reverse FK order
  await prisma.quizExtraAttempt.deleteMany();
  await prisma.quizAttempt.deleteMany();
  await prisma.option.deleteMany();
  await prisma.question.deleteMany();
  await prisma.quiz.deleteMany();
  await prisma.theme.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatConversation.deleteMany();
  await prisma.forumCommentLike.deleteMany();
  await prisma.forumComment.deleteMany();
  await prisma.forumTopic.deleteMany();
  await prisma.forumCategory.deleteMany();
  await prisma.commentLike.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.articleLike.deleteMany();
  await prisma.article.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.blogCategory.deleteMany();
  await prisma.emailHistory.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.documentChunk.deleteMany();
  await prisma.document.deleteMany();
  await prisma.user.deleteMany();
  console.log('  ✓ All existing data cleared');
  console.log();

  // ========================================
  // STEP 1: USERS
  // ========================================
  console.log('━'.repeat(60));
  console.log('STEP 1: Migrating Users');
  console.log('━'.repeat(60));

  const oldUsers = extractTableData(sql, 'Users_user', [
    'password', 'last_login', 'is_superuser', 'id', 'email', 'name',
    'deleted', 'is_active', 'is_staff', 'is_verified',
    'verification_token', 'token_created_at', 'allow_leaderboard_display', 'joined_at'
  ]);
  console.log(`  Found ${oldUsers.length} users in dump`);

  // Filter: only active, non-deleted users
  const activeUsers = oldUsers.filter(u => u.is_active === 't' && u.deleted === 'f');
  console.log(`  After filtering (active & not deleted): ${activeUsers.length} users`);

  // Load UserProgress for stars mapping
  const oldProgress = extractTableData(sql, 'Quiz_userprogress', [
    'id', 'total_points', 'quizzes_completed', 'success_rate', 'total_time_spent', 'user_id'
  ]);
  const progressByUser = new Map<string, Record<string, string | null>>();
  for (const p of oldProgress) {
    if (p.user_id) progressByUser.set(p.user_id, p);
  }

  // Load UserSubscriptions for premium status
  const oldSubscriptions = extractTableData(sql, 'Users_usersubscription', [
    'id', 'status', 'start_date', 'end_date', 'auto_renew', 'cancel_at_period_end',
    'stripe_subscription_id', 'stripe_customer_id', 'created_at', 'updated_at',
    'subscription_id', 'user_id'
  ]);

  // For each user, find the most recent ACTIVE subscription (or CANCELLED but not yet expired)
  const now = new Date();
  const subsByUser = new Map<string, Record<string, string | null>>();
  for (const sub of oldSubscriptions) {
    if (!sub.user_id) continue;
    const endDate = safeDate(sub.end_date);
    const isActive = sub.status === 'ACTIVE' && endDate && endDate > now;
    const isCancelledButValid = sub.status === 'CANCELLED' && endDate && endDate > now;

    if (isActive || isCancelledButValid) {
      const existing = subsByUser.get(sub.user_id);
      if (!existing) {
        subsByUser.set(sub.user_id, sub);
      } else {
        // Keep the one with the latest end_date
        const existingEnd = safeDate(existing.end_date);
        if (endDate && existingEnd && endDate > existingEnd) {
          subsByUser.set(sub.user_id, sub);
        }
      }
    }
  }
  console.log(`  Users with active/valid subscriptions: ${subsByUser.size}`);

  // Track migrated user IDs for FK validation later
  const migratedUserIds = new Set<string>();

  let userCount = 0;
  let userSkipped = 0;
  for (const u of activeUsers) {
    if (!u.id || !u.email) { userSkipped++; continue; }

    const { firstName, lastName } = splitName(u.name || '');
    const progress = progressByUser.get(u.id);
    const subscription = subsByUser.get(u.id);

    const isPremium = !!subscription;
    const premiumExpiresAt = subscription ? safeDate(subscription.end_date) : null;
    const autoRenew = subscription ? subscription.auto_renew === 't' : true;
    const stripeCustomerId = subscription?.stripe_customer_id || null;
    const stripeSubscriptionId = subscription?.stripe_subscription_id || null;

    try {
      await prisma.user.create({
        data: {
          id: u.id,
          email: u.email,
          password: null, // Force password reset — Django hashes are incompatible with bcrypt
          firstName,
          lastName,
          role: u.is_superuser === 't' || u.is_staff === 't' ? 'ADMIN' : 'USER',
          isEmailVerified: u.is_verified === 't',
          showInLeaderboard: u.allow_leaderboard_display === 't',
          stars: safeInt(progress?.total_points ?? null, 0),
          isPremium,
          premiumExpiresAt,
          autoRenew,
          stripeCustomerId,
          stripeSubscriptionId,
          createdAt: safeDate(u.joined_at) || new Date(),
          updatedAt: new Date(),
        },
      });
      migratedUserIds.add(u.id);
      userCount++;
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Duplicate — skip (email or stripe ID uniqueness)
        userSkipped++;
      } else {
        console.error(`  ✗ Error migrating user ${u.email}: ${err.message}`);
        userSkipped++;
      }
    }
  }
  console.log(`  ✓ Migrated: ${userCount} users | Skipped: ${userSkipped}`);
  console.log();

  // ========================================
  // STEP 2: THEMES (from Quiz_module)
  // ========================================
  console.log('━'.repeat(60));
  console.log('STEP 2: Migrating Themes (from Quiz_module)');
  console.log('━'.repeat(60));

  const oldModules = extractTableData(sql, 'Quiz_module', [
    'id', 'name', 'description', 'deleted', 'active', 'validated_by_admin',
    'free', 'created_at', 'updated_at', 'position'
  ]);
  console.log(`  Found ${oldModules.length} modules in dump`);

  const activeModules = oldModules.filter(m => m.deleted === 'f');
  console.log(`  After filtering (not deleted): ${activeModules.length} modules`);

  const migratedThemeIds = new Set<string>();
  let themeCount = 0;

  // Ensure unique positions
  const usedPositions = new Set<number>();
  for (const m of activeModules) {
    if (!m.id) continue;
    let position = safeInt(m.position, 0);
    while (usedPositions.has(position)) position++;
    usedPositions.add(position);

    try {
      await prisma.theme.create({
        data: {
          id: m.id,
          title: m.name || 'Module sans nom',
          description: m.description || '',
          position,
          isActive: m.active === 't',
          createdAt: safeDate(m.created_at) || new Date(),
          updatedAt: safeDate(m.updated_at) || new Date(),
        },
      });
      migratedThemeIds.add(m.id);
      themeCount++;
    } catch (err: any) {
      console.error(`  ✗ Error migrating theme ${m.name}: ${err.message}`);
    }
  }
  console.log(`  ✓ Migrated: ${themeCount} themes`);
  console.log();

  // ========================================
  // STEP 3: QUIZZES (only those with questions)
  // ========================================
  console.log('━'.repeat(60));
  console.log('STEP 3: Migrating Quizzes (only those with active questions)');
  console.log('━'.repeat(60));

  const oldQuizzes = extractTableData(sql, 'Quiz_quiz', [
    'id', 'title', 'description', 'created_at', 'updated_at', 'time_limit',
    'is_active', 'validated_by_admin', 'generated_by_system', 'points_to_pass',
    'free', 'difficulty', 'module_id', 'position'
  ]);
  console.log(`  Found ${oldQuizzes.length} quizzes in dump`);

  // Load questions to know which quizzes have content
  const oldQuestions = extractTableData(sql, 'Quiz_question', [
    'id', 'question_type', 'question', 'created_at', 'updated_at',
    'deleted', 'active', 'difficulty', 'generated_by_system', 'validated_by_admin', 'quiz_id'
  ]);
  const activeQuestions = oldQuestions.filter(q => q.deleted === 'f' && q.active === 't');
  console.log(`  Active questions: ${activeQuestions.length}`);

  // Build set of quiz IDs that have at least 1 active question
  const quizIdsWithQuestions = new Set<string>();
  for (const q of activeQuestions) {
    if (q.quiz_id) quizIdsWithQuestions.add(q.quiz_id);
  }
  console.log(`  Quizzes with active questions: ${quizIdsWithQuestions.size}`);

  // Filter quizzes: must have questions AND belong to a migrated theme
  const quizzesToMigrate = oldQuizzes.filter(q =>
    q.id &&
    quizIdsWithQuestions.has(q.id) &&
    q.module_id &&
    migratedThemeIds.has(q.module_id)
  );
  console.log(`  Quizzes to migrate (with questions + valid theme): ${quizzesToMigrate.length}`);

  const migratedQuizIds = new Set<string>();
  let quizCount = 0;

  for (const q of quizzesToMigrate) {
    if (!q.id || !q.module_id) continue;

    try {
      await prisma.quiz.create({
        data: {
          id: q.id,
          themeId: q.module_id,
          title: q.title || 'Quiz sans titre',
          description: q.description || '',
          difficulty: mapDifficulty(q.difficulty || 'MEDIUM'),
          timeLimit: safeInt(q.time_limit, 30),
          passingScore: safeInt(q.points_to_pass, 70),
          requiredStars: 0,
          isFree: q.free === 't',
          isActive: q.is_active === 't',
          createdAt: safeDate(q.created_at) || new Date(),
          updatedAt: safeDate(q.updated_at) || new Date(),
        },
      });
      migratedQuizIds.add(q.id);
      quizCount++;
    } catch (err: any) {
      console.error(`  ✗ Error migrating quiz "${q.title}": ${err.message}`);
    }
  }
  console.log(`  ✓ Migrated: ${quizCount} quizzes`);
  console.log();

  // ========================================
  // STEP 4: QUESTIONS
  // ========================================
  console.log('━'.repeat(60));
  console.log('STEP 4: Migrating Questions');
  console.log('━'.repeat(60));

  const questionsToMigrate = activeQuestions.filter(q =>
    q.id && q.quiz_id && migratedQuizIds.has(q.quiz_id)
  );
  console.log(`  Questions to migrate (in migrated quizzes): ${questionsToMigrate.length}`);

  const migratedQuestionIds = new Set<string>();
  let questionCount = 0;

  for (const q of questionsToMigrate) {
    if (!q.id || !q.quiz_id) continue;

    const qType = q.question_type?.toUpperCase();
    const type = (qType === 'QCM' || qType === 'QCU') ? qType : 'QCM';

    try {
      await prisma.question.create({
        data: {
          id: q.id,
          quizId: q.quiz_id,
          content: q.question || '',
          type: type as 'QCM' | 'QCU',
          createdAt: safeDate(q.created_at) || new Date(),
          updatedAt: safeDate(q.updated_at) || new Date(),
        },
      });
      migratedQuestionIds.add(q.id);
      questionCount++;
    } catch (err: any) {
      console.error(`  ✗ Error migrating question ${q.id}: ${err.message}`);
    }
  }
  console.log(`  ✓ Migrated: ${questionCount} questions`);
  console.log();

  // ========================================
  // STEP 5: OPTIONS (from Quiz_answer)
  // ========================================
  console.log('━'.repeat(60));
  console.log('STEP 5: Migrating Options (from Quiz_answer)');
  console.log('━'.repeat(60));

  const oldAnswers = extractTableData(sql, 'Quiz_answer', [
    'id', 'answer', 'explanation', 'is_correct', 'created_at', 'updated_at',
    'deleted', 'active', 'generated_by_system', 'validated_by_admin', 'question_id'
  ]);
  console.log(`  Found ${oldAnswers.length} answers in dump`);

  const answersToMigrate = oldAnswers.filter(a =>
    a.id && a.question_id &&
    a.deleted === 'f' && a.active === 't' &&
    migratedQuestionIds.has(a.question_id)
  );
  console.log(`  Answers to migrate: ${answersToMigrate.length}`);

  let optionCount = 0;
  for (const a of answersToMigrate) {
    if (!a.id || !a.question_id) continue;

    try {
      await prisma.option.create({
        data: {
          id: a.id,
          questionId: a.question_id,
          content: a.answer || '',
          isCorrect: a.is_correct === 't',
          explanation: a.explanation || null,
          createdAt: safeDate(a.created_at) || new Date(),
        },
      });
      optionCount++;
    } catch (err: any) {
      console.error(`  ✗ Error migrating option ${a.id}: ${err.message}`);
    }
  }
  console.log(`  ✓ Migrated: ${optionCount} options`);
  console.log();

  // ========================================
  // STEP 6: QUIZ ATTEMPTS
  // ========================================
  console.log('━'.repeat(60));
  console.log('STEP 6: Migrating Quiz Attempts');
  console.log('━'.repeat(60));

  const oldAttempts = extractTableData(sql, 'Quiz_quizattempt', [
    'id', 'created_at', 'updated_at', 'deleted', 'score', 'is_passed',
    'time_taken', 'correct_answers', 'total_questions', 'questions_details',
    'is_favorite', 'quiz_id', 'user_id'
  ]);
  console.log(`  Found ${oldAttempts.length} attempts in dump`);

  const attemptsToMigrate = oldAttempts.filter(a =>
    a.id && a.deleted === 'f' &&
    a.user_id && migratedUserIds.has(a.user_id) &&
    a.quiz_id && migratedQuizIds.has(a.quiz_id)
  );
  console.log(`  Attempts to migrate (valid user + valid quiz + not deleted): ${attemptsToMigrate.length}`);

  let attemptCount = 0;
  let attemptSkipped = 0;
  for (const a of attemptsToMigrate) {
    if (!a.id || !a.user_id || !a.quiz_id) continue;

    try {
      await prisma.quizAttempt.create({
        data: {
          id: a.id,
          userId: a.user_id,
          quizId: a.quiz_id,
          score: safeInt(a.score, 0),
          starsEarned: 0, // Will be recalculated if needed
          completedAt: safeDate(a.created_at) || new Date(),
        },
      });
      attemptCount++;
    } catch (err: any) {
      if (err.code === 'P2002') {
        attemptSkipped++;
      } else {
        console.error(`  ✗ Error migrating attempt ${a.id}: ${err.message}`);
        attemptSkipped++;
      }
    }
  }
  console.log(`  ✓ Migrated: ${attemptCount} attempts | Skipped: ${attemptSkipped}`);
  console.log();

  // ========================================
  // STEP 7: PAYMENTS (from Users_paymenthistory)
  // ========================================
  console.log('━'.repeat(60));
  console.log('STEP 7: Migrating Payments');
  console.log('━'.repeat(60));

  const oldPayments = extractTableData(sql, 'Users_paymenthistory', [
    'id', 'amount', 'status', 'payment_date', 'stripe_payment_id',
    'invoice_url', 'user_subscription_id'
  ]);
  console.log(`  Found ${oldPayments.length} payments in dump`);

  // Build mapping: subscription_id → user_id
  const subToUser = new Map<string, string>();
  for (const sub of oldSubscriptions) {
    if (sub.id && sub.user_id) subToUser.set(sub.id, sub.user_id);
  }

  let paymentCount = 0;
  let paymentSkipped = 0;
  const usedStripePaymentIds = new Set<string>();

  for (const p of oldPayments) {
    if (!p.id) { paymentSkipped++; continue; }

    // Resolve user_id through subscription
    const userId = p.user_subscription_id ? subToUser.get(p.user_subscription_id) : null;
    if (!userId || !migratedUserIds.has(userId)) { paymentSkipped++; continue; }

    // Convert amount from euros (decimal) to cents (integer)
    const amountEuros = safeFloat(p.amount, 0);
    const amountCents = Math.round(amountEuros * 100);

    // Handle duplicate stripe_payment_id (must be unique in new schema)
    let stripePaymentId = p.stripe_payment_id || null;
    if (stripePaymentId && usedStripePaymentIds.has(stripePaymentId)) {
      stripePaymentId = null; // Clear duplicate
    }
    if (stripePaymentId) usedStripePaymentIds.add(stripePaymentId);

    try {
      await prisma.payment.create({
        data: {
          id: p.id,
          userId,
          amount: amountCents,
          currency: 'EUR',
          status: mapPaymentStatus(p.status || 'PENDING'),
          stripePaymentId,
          stripeSessionId: null,
          description: 'Abonnement Premium Footix (migré)',
          createdAt: safeDate(p.payment_date) || new Date(),
          updatedAt: safeDate(p.payment_date) || new Date(),
        },
      });
      paymentCount++;
    } catch (err: any) {
      if (err.code === 'P2002') {
        paymentSkipped++;
      } else {
        console.error(`  ✗ Error migrating payment ${p.id}: ${err.message}`);
        paymentSkipped++;
      }
    }
  }
  console.log(`  ✓ Migrated: ${paymentCount} payments | Skipped: ${paymentSkipped}`);
  console.log();

  // ========================================
  // SUMMARY
  // ========================================
  console.log('='.repeat(60));
  console.log('  MIGRATION COMPLETE — SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Users:          ${userCount}`);
  console.log(`  Themes:         ${themeCount}`);
  console.log(`  Quizzes:        ${quizCount}`);
  console.log(`  Questions:      ${questionCount}`);
  console.log(`  Options:        ${optionCount}`);
  console.log(`  Quiz Attempts:  ${attemptCount}`);
  console.log(`  Payments:       ${paymentCount}`);
  console.log();
  console.log('  ⚠ IMPORTANT POST-MIGRATION STEPS:');
  console.log('  1. All user passwords are NULL — users must reset via "Mot de passe oublié"');
  console.log('  2. Update .env with old Stripe keys (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, etc.)');
  console.log('  3. Update Stripe webhook URL to point to the new backend');
  console.log('  4. Send password reset email to all migrated users');
  console.log('  5. Verify premium users still have active subscriptions in Stripe dashboard');
  console.log('='.repeat(60));
}

main()
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
