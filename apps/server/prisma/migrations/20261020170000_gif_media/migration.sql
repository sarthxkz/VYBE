-- CreateTable
CREATE TABLE "gif_media" (
    "id" TEXT NOT NULL,
    "small" TEXT NOT NULL,
    "full" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gif_media_pkey" PRIMARY KEY ("id")
);
