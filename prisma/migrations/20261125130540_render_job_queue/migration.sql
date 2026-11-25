-- AlterTable
ALTER TABLE "render_jobs" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancel_requested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "heartbeat_at" TIMESTAMP(3),
ADD COLUMN     "worker_id" TEXT;
