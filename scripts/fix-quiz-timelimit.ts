/**
 * Fix Quiz timeLimit values from backup.sql
 * 
 * The migrate-data.ts script multiplied time_limit by 60 (treating minutes as seconds),
 * but the frontend expects timeLimit in minutes. This script reads the original
 * backup.sql and restores the correct time_limit values.
 * 
 * Usage:
 *   npx ts-node scripts/fix-quiz-timelimit.ts
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { PrismaClient } = require('../src/generated/prisma');
import * as fs from 'fs';

const prisma = new PrismaClient();

const BACKUP_PATH = 'E:\\dec\\backup.sql';

async function main() {
  console.log('Reading backup.sql...');
  const sql = fs.readFileSync(BACKUP_PATH, 'utf-8');

  // Extract quiz ID → time_limit from INSERT statements
  // Format: INSERT INTO public."Quiz_quiz" VALUES ('id', 'title', 'desc', 'created', 'updated', time_limit, ...
  const regex = /INSERT INTO public\."Quiz_quiz" VALUES \('([^']+)',\s*'(?:[^']*(?:''[^']*)*)',\s*'(?:[^']*(?:''[^']*)*)',\s*'[^']*',\s*'[^']*',\s*(\d+),/g;

  const timeLimitMap = new Map<string, number>();
  let match;
  while ((match = regex.exec(sql)) !== null) {
    const quizId = match[1];
    const timeLimit = parseInt(match[2], 10);
    timeLimitMap.set(quizId, timeLimit);
  }

  console.log(`Found ${timeLimitMap.size} quizzes in backup`);

  // Show unique time_limit values
  const uniqueValues = new Set(timeLimitMap.values());
  console.log(`Unique time_limit values in backup: ${[...uniqueValues].sort((a, b) => a - b).join(', ')}`);

  // Get all quizzes from current DB
  const dbQuizzes = await prisma.quiz.findMany({ select: { id: true, title: true, timeLimit: true } });
  console.log(`Found ${dbQuizzes.length} quizzes in current DB`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const quiz of dbQuizzes) {
    const correctTimeLimit = timeLimitMap.get(quiz.id);
    if (correctTimeLimit === undefined) {
      // Quiz not in backup (created after migration) — skip
      notFound++;
      continue;
    }

    if (quiz.timeLimit === correctTimeLimit) {
      skipped++;
      continue;
    }

    console.log(`  Fixing "${quiz.title}": ${quiz.timeLimit} → ${correctTimeLimit} min`);
    await prisma.quiz.update({
      where: { id: quiz.id },
      data: { timeLimit: correctTimeLimit },
    });
    updated++;
  }

  console.log(`\nDone!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Already correct: ${skipped}`);
  console.log(`  Not in backup (post-migration): ${notFound}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
