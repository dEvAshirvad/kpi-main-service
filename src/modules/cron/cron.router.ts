import { Router } from 'express';
import { CronHandler } from './cron.handler';
import requireAdmin from '@/middlewares/requireAdmin';

const router = Router();

// All cron management endpoints require admin access
router.use(requireAdmin);

// Get cron job status
router.get('/status', CronHandler.getCronJobStatus);

// Manually trigger monthly entries generation
router.post('/trigger-monthly-entries', CronHandler.triggerMonthlyEntries);

// Manually trigger monthly reports generation
router.post('/trigger-monthly-reports', CronHandler.triggerMonthlyReports);

// Restart all cron jobs
router.post('/restart', CronHandler.restartCronJobs);

export default router;
