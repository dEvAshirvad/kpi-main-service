import { NextFunction, Request, Response } from 'express';
import { KpiEntryService } from './kpi_entry.services';
import { User } from '@/lib/api-client';
import Respond from '@/lib/respond';
import logger from '@/configs/logger';

export class KpiEntryHandler {
  /**
   * Generate default KPI entries for a template
   */
  static async generateDefaultEntries(
    request: Request,
    response: Response,
    next: NextFunction
  ) {
    try {
      const user = request.user as User;
      const { templateId, month, year } = request.body;

      if (!templateId || !month || !year) {
        return Respond(
          response,
          {
            message: 'templateId, month, and year are required',
          },
          400
        );
      }

      const result = await KpiEntryService.generateDefaultKpiEntries(
        templateId,
        month,
        year,
        user.id
      );

      return Respond(
        response,
        {
          message: 'Default KPI entries generated successfully',
          data: result,
        },
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update KPI entry values
   */
  static async updateEntryValues(
    request: Request,
    response: Response,
    next: NextFunction
  ) {
    try {
      const user = request.user as User;
      const { entryId } = request.params;

      if (!request.body || !Array.isArray(request.body)) {
        return Respond(
          response,
          {
            message: 'values array is required',
          },
          400
        );
      }

      const updatedEntry = await KpiEntryService.updateKpiEntryValues(
        entryId,
        request.body,
        user.id
      );

      return Respond(
        response,
        {
          message: 'KPI entry values updated successfully',
          data: updatedEntry,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  static async getEntriesByUser(
    request: Request,
    response: Response,
    next: NextFunction
  ) {
    try {
      const user = request.user as User;
      const {
        month,
        year,
        templateId,
        jurisdiction,
        createdFor,
        status,
        page,
        limit,
      } = request.query;

      const entries = await KpiEntryService.getKpiEntriesByUser(
        createdFor as string,
        month ? Number(month) : undefined,
        year ? Number(year) : undefined,
        templateId as string,
        jurisdiction as string,
        status as string,
        page ? Number(page) : 1,
        limit ? Number(limit) : 10
      );

      return Respond(
        response,
        {
          message: 'KPI entries fetched successfully',
          ...entries,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get KPI entries for current user
   */
  static async getMyEntries(
    request: Request,
    response: Response,
    next: NextFunction
  ) {
    try {
      const user = request.user as User;
      const { month, year, templateId, page, limit } = request.query;

      const entries = await KpiEntryService.getKpiEntriesByUser(
        user.id,
        month ? Number(month) : undefined,
        year ? Number(year) : undefined,
        templateId as string,
        undefined, // jurisdiction
        undefined, // status
        page ? Number(page) : 1,
        limit ? Number(limit) : 10
      );

      return Respond(
        response,
        {
          message: 'KPI entries fetched successfully',
          ...entries,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get KPI entry by jurisdiction
   */
  static async getEntryByJurisdiction(
    request: Request,
    response: Response,
    next: NextFunction
  ) {
    try {
      const user = request.user as User;
      const { jurisdiction } = request.params;
      const { month, year, templateId } = request.query;

      const entry = await KpiEntryService.getKpiEntriesByJurisdiction(
        user.id,
        jurisdiction,
        month ? Number(month) : undefined,
        year ? Number(year) : undefined,
        templateId as string
      );

      if (!entry) {
        return Respond(
          response,
          {
            message: 'KPI entry not found for this jurisdiction',
          },
          404
        );
      }

      return Respond(
        response,
        {
          message: 'KPI entry fetched successfully',
          data: entry,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate final KPI reports
   */
  static async generateFinalReports(
    request: Request,
    response: Response,
    next: NextFunction
  ) {
    try {
      const user = request.user as User;
      const { templateId, month, year } = request.body;

      if (!templateId || !month || !year) {
        return Respond(
          response,
          {
            message: 'templateId, month, and year are required',
          },
          400
        );
      }

      const result = await KpiEntryService.generateFinalReports(
        templateId,
        month,
        year,
        user.id
      );

      return Respond(
        response,
        {
          message: 'Final KPI reports generated successfully',
          data: result,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get KPI entries statistics by department and role with month and year
   */
  static async getKpiEntriesStatistics(
    request: Request,
    response: Response,
    next: NextFunction
  ) {
    try {
      const { page, limit, templateId, department, role, month, year } =
        request.query;

      const result =
        await KpiEntryService.getKpiEntriesStatisticsByDepartmentAndRoleWithMonthAndYear(
          page as string,
          limit as string,
          templateId as string,
          department as string,
          role as string,
          month as string,
          year as string
        );

      return Respond(
        response,
        {
          message: 'KPI entries statistics retrieved successfully',
          data: result,
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }
}
