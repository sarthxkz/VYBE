-- AlterTable
ALTER TABLE "photo_posts" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "instant" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "chat_backups" (
    "userId" UUID NOT NULL,
    "salt" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_backups_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "chat_backups" ADD CONSTRAINT "chat_backups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
