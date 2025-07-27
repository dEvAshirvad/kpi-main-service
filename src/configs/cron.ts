import cron from 'node-cron';
import logger from './logger';
import { KpiEntryService } from '@/modules/kpi_entry/kpi_entry.services';
import { KpiTemplateService } from '@/modules/kpi_template/kpi_template.services';

/**
 * Initialize all cron jobs for KPI system
 */
export function initializeCronJobs() {
  logger.info('Initializing KPI cron jobs...');

  // Generate monthly KPI entries on 2nd day of every month at 2:00 AM
  cron.schedule(
    '0 2 2 * *',
    async () => {
      try {
        logger.info('Starting monthly KPI entries generation...');

        const currentDate = new Date();
        const month = currentDate.getMonth() + 1; // 1-12
        const year = currentDate.getFullYear();

        // Get all active KPI templates
        const templates = await KpiTemplateService.getKpiTemplates({
          page: 1,
          limit: 1000, // Get all templates
        });

        if (!templates.docs || templates.docs.length === 0) {
          logger.warn(
            'No active KPI templates found for monthly entry generation'
          );
          return;
        }

        // Generate entries for each template
        for (const template of templates.docs) {
          try {
            await KpiEntryService.generateDefaultKpiEntries(
              template._id.toString(),
              month,
              year
            );
            logger.info(
              `Generated monthly entries for template: ${template.name}`
            );
          } catch (error) {
            logger.error(
              `Failed to generate entries for template ${template.name}:`,
              error
            );
            // Continue with other templates even if one fails
          }
        }

        logger.info('Monthly KPI entries generation completed');
      } catch (error) {
        logger.error(
          'Error in monthly KPI entries generation cron job:',
          error
        );
      }
    },
    {
      timezone: 'Asia/Kolkata', // Indian Standard Time
    }
  );

  // Generate monthly reports on 1st day of every month at 1:00 AM
  cron.schedule(
    '0 1 1 * *',
    async () => {
      try {
        logger.info('Starting monthly KPI reports generation...');

        const currentDate = new Date();
        const month = currentDate.getMonth(); // Previous month (0-11)
        const year = currentDate.getFullYear();

        // If it's January, we need to handle December of previous year
        let targetMonth = month;
        let targetYear = year;

        if (month === 0) {
          targetMonth = 12; // December
          targetYear = year - 1; // Previous year
        }

        // Get all active KPI templates
        const templates = await KpiTemplateService.getKpiTemplates({
          page: 1,
          limit: 1000, // Get all templates
        });

        if (!templates.docs || templates.docs.length === 0) {
          logger.warn(
            'No active KPI templates found for monthly report generation'
          );
          return;
        }

        // Generate reports for each template
        for (const template of templates.docs) {
          try {
            await KpiEntryService.generateFinalReports(
              template._id.toString(),
              targetMonth,
              targetYear,
              'system'
            );
            logger.info(
              `Generated monthly reports for template: ${template.name}`
            );
          } catch (error) {
            logger.error(
              `Failed to generate reports for template ${template.name}:`,
              error
            );
            // Continue with other templates even if one fails
          }
        }

        logger.info('Monthly KPI reports generation completed');
      } catch (error) {
        logger.error(
          'Error in monthly KPI reports generation cron job:',
          error
        );
      }
    },
    {
      timezone: 'Asia/Kolkata', // Indian Standard Time
    }
  );

  // Optional: Daily health check cron job
  cron.schedule(
    '0 6 * * *',
    () => {
      logger.info('KPI system daily health check - cron jobs are running');
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  logger.info('KPI cron jobs initialized successfully');
}

/**
 * Stop all cron jobs
 */
export function stopCronJobs() {
  logger.info('Stopping KPI cron jobs...');
  const tasks = cron.getTasks();
  tasks.forEach((task: any) => task.stop());
  logger.info('KPI cron jobs stopped');
}

/**
 * Get status of all cron jobs
 */
export function getCronJobStatus() {
  try {
    const tasks = cron.getTasks();
    const status = Array.from(tasks.entries()).map(
      ([name, task]: [string, any]) => {
        try {
          return {
            name,
            running: task.running || false,
            nextRun: task.nextDate ? task.nextDate().toDate() : 'Unknown',
            expression: task.cronTime?.source || 'Unknown',
          };
        } catch (error) {
          return {
            name,
            running: false,
            nextRun: 'Error',
            expression: 'Unknown',
            error: 'Failed to get task details',
          };
        }
      }
    );

    return status;
  } catch (error) {
    logger.error('Error getting cron job status:', error);
    return [];
  }
}
