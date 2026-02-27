import * as cron from 'node-cron';
import { logger } from '../services/logger';
import { GDPRService } from '../services/gdpr';

/**
 * Background job for automatic GDPR data cleanup
 * Deletes data 30 days after admin approval
 * Runs daily at 02:00 UTC
 */
export class GDPRCleanupJob {
  private gdprService: GDPRService;
  private taskSchedule: cron.ScheduledTask | null = null;

  constructor(gdprService: GDPRService) {
    this.gdprService = gdprService;
  }

  /**
   * Start the cleanup job
   * Runs daily at 02:00 UTC (every day at midnight UTC + 2 hours)
   */
  start(): void {
    try {
      // Cron expression: "0 2 * * *" = Every day at 02:00 UTC
      // Format: minute hour day month day-of-week
      this.taskSchedule = cron.schedule('0 2 * * *', async () => {
        await this.executeCleanup();
      });

      logger.info('GDPR cleanup job started', {
        service: 'GDPRCleanupJob',
        schedule: 'Daily at 02:00 UTC',
      });
    } catch (error) {
      logger.error('Failed to start GDPR cleanup job:', error);
      throw error;
    }
  }

  /**
   * Stop the cleanup job
   */
  stop(): void {
    if (this.taskSchedule) {
      this.taskSchedule.stop();
      logger.info('GDPR cleanup job stopped', {
        service: 'GDPRCleanupJob',
      });
    }
  }

  /**
   * Execute cleanup immediately (for testing)
   */
  async executeCleanupNow(): Promise<number> {
    return await this.executeCleanup();
  }

  /**
   * Core cleanup logic
   */
  private async executeCleanup(): Promise<number> {
    const startTime = Date.now();

    try {
      logger.info('GDPR cleanup job executing...', {
        service: 'GDPRCleanupJob',
        timestamp: new Date().toISOString(),
      });

      const deletedCount = await this.gdprService.autoCleanupExpiredRequests();

      const duration = Date.now() - startTime;
      logger.info('GDPR cleanup job completed successfully', {
        service: 'GDPRCleanupJob',
        deletedCount,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });

      return deletedCount;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('GDPR cleanup job failed', {
        service: 'GDPRCleanupJob',
        error,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });

      // Don't throw - cleanup job should not crash the bot
      return 0;
    }
  }
}
