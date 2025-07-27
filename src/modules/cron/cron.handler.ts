import { Request, Response } from 'express';
import {
  getCronJobStatus,
  stopCronJobs,
  initializeCronJobs,
} from '@/configs/cron';
import { KpiEntryService } from '@/modules/kpi_entry/kpi_entry.services';
import { KpiTemplateService } from '@/modules/kpi_template/kpi_template.services';
import Respond from '@/lib/respond';
import APIError from '@/lib/errors/APIError';
import logger from '@/configs/logger';

export class CronHandler {
  /**
   * Get status of all cron jobs
   */
  static async getCronJobStatus(req: Request, res: Response) {
    try {
      const status = getCronJobStatus();
      Respond(
        res,
        {
          status,
          message: 'Cron job status retrieved successfully',
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Manually trigger monthly KPI entries generation
   */
  static async triggerMonthlyEntries(req: Request, res: Response) {
    try {
      const { templateId, month, year } = req.body;

      if (
        !templateId ||
        month === undefined ||
        month === null ||
        year === undefined ||
        year === null
      ) {
        throw new APIError({
          STATUS: 400,
          TITLE: 'Missing Required Fields',
          MESSAGE: `Template ID, month, and year are required. Received: templateId=${templateId}, month=${month}, year=${year}`,
        });
      }

      // Validate month and year ranges
      const monthNum = Number(month);
      const yearNum = Number(year);

      if (monthNum < 1 || monthNum > 12) {
        throw new APIError({
          STATUS: 400,
          TITLE: 'Invalid Month',
          MESSAGE: `Month must be between 1 and 12. Received: ${monthNum}`,
        });
      }

      if (yearNum < 2020 || yearNum > 2030) {
        throw new APIError({
          STATUS: 400,
          TITLE: 'Invalid Year',
          MESSAGE: `Year must be between 2020 and 2030. Received: ${yearNum}`,
        });
      }

      const result = await KpiEntryService.generateMonthlyKpiEntries(
        templateId,
        monthNum,
        yearNum
      );

      logger.info(
        `Manually triggered monthly entries generation for template ${templateId}`
      );

      Respond(
        res,
        {
          result,
          message: 'Monthly KPI entries generation triggered successfully',
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Manually trigger monthly reports generation
   */
  static async triggerMonthlyReports(req: Request, res: Response) {
    try {
      const { templateId, month, year } = req.body;

      if (
        !templateId ||
        month === undefined ||
        month === null ||
        year === undefined ||
        year === null
      ) {
        throw new APIError({
          STATUS: 400,
          TITLE: 'Missing Required Fields',
          MESSAGE: `Template ID, month, and year are required. Received: templateId=${templateId}, month=${month}, year=${year}`,
        });
      }

      // Validate month and year ranges
      const monthNum = Number(month);
      const yearNum = Number(year);

      if (monthNum < 1 || monthNum > 12) {
        throw new APIError({
          STATUS: 400,
          TITLE: 'Invalid Month',
          MESSAGE: `Month must be between 1 and 12. Received: ${monthNum}`,
        });
      }

      if (yearNum < 2020 || yearNum > 2030) {
        throw new APIError({
          STATUS: 400,
          TITLE: 'Invalid Year',
          MESSAGE: `Year must be between 2020 and 2030. Received: ${yearNum}`,
        });
      }

      // Validate template exists
      const template = await KpiTemplateService.getKpiTemplate(templateId);
      if (!template) {
        throw new APIError({
          STATUS: 404,
          TITLE: 'Template Not Found',
          MESSAGE: `KPI template not found: ${templateId}`,
        });
      }

      const result = await KpiEntryService.generateMonthlyReports(
        templateId,
        monthNum,
        yearNum
      );

      logger.info(
        `Manually triggered monthly reports generation for template ${templateId}`
      );

      Respond(
        res,
        {
          result,
          message: 'Monthly reports generation triggered successfully',
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Restart all cron jobs
   */
  static async restartCronJobs(req: Request, res: Response) {
    try {
      stopCronJobs();
      initializeCronJobs();

      Respond(
        res,
        {
          message: 'Cron jobs restarted successfully',
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }
}
