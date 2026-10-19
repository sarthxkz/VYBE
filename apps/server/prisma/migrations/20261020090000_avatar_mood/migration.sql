-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarStyle" JSONB,
ADD COLUMN     "moodEmoji" TEXT,
ADD COLUMN     "moodSetAt" TIMESTAMP(3),
ADD COLUMN     "moodText" TEXT;
