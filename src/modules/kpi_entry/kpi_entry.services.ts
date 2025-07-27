import { FilterQuery } from 'mongoose';
import { KpiEntry, KpiEntryModel } from './kpi_entry.model';
import { KpiEntryCreate } from './kpi_entry.model';
import { KpiTemplateService } from '../kpi_template/kpi_template.services';
import logger from '@/configs/logger';
import { MemberService } from '../members/members.service';
import APIError from '@/lib/errors/APIError';
import { KpiAuditLogService } from '../kpi_audt_logs/kpi_audit_logs.services';
import { format } from 'date-fns';
import { filterExcludedMembers } from '../../lib/filters';
import { DepartmentService } from '../departments/department.services';
import { HttpErrorStatusCode } from '@/types/errors/errors.types';

interface ScoringRule {
  min?: number;
  max?: number;
  value?: number | string;
  score: number;
}

interface TemplateItem {
  name: string;
  description?: string;
  maxMarks: number;
  kpiType: 'quantitative' | 'percentage' | 'binary' | 'qualitative' | 'score';
  kpiUnit?: string;
  isDynamic: boolean;
  scoringRules: ScoringRule[];
}

export class KpiEntryService {
  /**
   * Generate default KPI entries with "created" status for all members
   * This creates reference entries that can be updated with scores during the month
   */
  static async generateDefaultKpiEntries(
    templateId: string,
    month: number,
    year: number,
    generatedBy: string = 'system'
  ) {
    try {
      logger.info(
        `Generating default KPI entries for template ${templateId}, month ${month}, year ${year}`
      );

      // Get the KPI template
      const template = await KpiTemplateService.getKpiTemplate(templateId);
      if (!template) {
        throw new APIError({
          STATUS: 404,
          TITLE: 'KPI Template Not Found',
          MESSAGE: `KPI template not found: ${templateId}`,
        });
      }

      // Get all members for the template role using departmentSlug directly
      const allMembers = await MemberService.getMembers({
        department: template.departmentSlug,
        role: template.role,
        page: 1,
        limit: 10000, // Get all members
      });

      const filteredMembers = filterExcludedMembers(allMembers.docs);

      // Check if entries already exist for this month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const existingEntries = await KpiEntryModel.find({
        kpiTemplateId: templateId,
        month,
        year,
        createdFor: { $in: filteredMembers.map((m: any) => m.userId) },
        createdAt: { $gte: startDate, $lte: endDate },
      });

      if (existingEntries.length > 0) {
        throw new APIError({
          STATUS: 409,
          TITLE: 'Entries Already Exist',
          MESSAGE: `KPI entries for template ${templateId} already exist for ${month}/${year}`,
        });
      }

      // Create default entries for each member
      const entriesToCreate: any[] = [];

      for (const member of filteredMembers) {
        // Get KPI references for this member
        const kpirefs = member.metadata?.kpirefs || [];

        if (kpirefs.length === 0) {
          // Single KPI entry for users without KPI references
          entriesToCreate.push({
            kpiTemplateId: templateId,
            createdFor: member.userId,
            values: [], // Empty values initially
            totalScore: 0,
            status: 'created',
            createdBy: generatedBy,
            month,
            year,
            // No jurisdiction field for users without KPI references
            jurisdiction: member.metadata.jurisdiction || [],
          });
        } else {
          // Single KPI entry with jurisdiction array for users with KPI references
          kpirefs.forEach((kpiref: string) => {
            entriesToCreate.push({
              kpiTemplateId: templateId,
              createdFor: member.userId,
              values: [], // Empty values initially
              totalScore: 0,
              status: 'created',
              createdBy: generatedBy,
              month,
              year,
              kpirefs: kpiref,
              jurisdiction: member.metadata.jurisdiction || [], // Array of KPI references for this entry
            });
          });
        }
      }

      const createdEntries = await KpiEntryModel.insertMany(entriesToCreate);

      logger.info(
        `Generated ${createdEntries.length} default KPI entries for template ${templateId}`
      );

      // Log the generation
      KpiAuditLogService.create({
        type: 'entry',
        userId: generatedBy,
        action: 'create',
        changes: [
          {
            field: 'default_entries_generated',
            oldValue: null,
            newValue: {
              templateId,
              month,
              year,
              entriesCount: createdEntries.length,
              membersCount: filteredMembers.length,
            },
          },
        ],
      });

      return {
        message: `Successfully generated ${createdEntries.length} default KPI entries`,
        entriesCount: createdEntries.length,
        membersCount: filteredMembers.length,
        templateId,
        month,
        year,
        entries: createdEntries,
      };
    } catch (error) {
      logger.error('Error generating default KPI entries:', error);
      throw error;
    }
  }

  /**
   * Update KPI entry values for a specific jurisdiction
   * Only nodal officers can update entries for their assigned roles
   */
  static async updateKpiEntryValues(
    entryId: string,
    values: Array<{
      name: string;
      value: number | string | boolean;
      comments?: string;
      isByPassed?: boolean;
    }>,
    updatedBy: string
  ) {
    try {
      const entry = await KpiEntryModel.findById(entryId);
      if (!entry) {
        throw new APIError({
          STATUS: 404,
          TITLE: 'KPI Entry Not Found',
          MESSAGE: `KPI entry not found: ${entryId}`,
        });
      }

      // Check if entry can be updated (status must be 'created' or 'initiated')
      if (entry.status === 'generated') {
        throw new APIError({
          STATUS: 400,
          TITLE: 'Entry Already Generated',
          MESSAGE:
            'Cannot update KPI entry that has already been generated. The entry has been finalized.',
        });
      }

      // Check if we're still within the same month
      const currentDate = new Date();
      const entryMonth = entry.month;
      const entryYear = entry.year;

      if (
        currentDate.getMonth() + 1 !== entryMonth ||
        currentDate.getFullYear() !== entryYear
      ) {
        throw new APIError({
          STATUS: 400,
          TITLE: 'Update Period Expired',
          MESSAGE: 'KPI entries can only be updated within the same month',
        });
      }

      const existingNodalOfficer =
        await MemberService.getMemberByUserId(updatedBy);
      const userRole = existingNodalOfficer?.role;
      const userDepartment = existingNodalOfficer?.departmentSlug;

      // Validate nodal officer permissions
      if (userRole && userDepartment) {
        const hasPermission = await this.validateNodalOfficerPermission(
          userRole,
          userDepartment,
          entry
        );

        if (!hasPermission) {
          throw new APIError({
            STATUS: HttpErrorStatusCode.FORBIDDEN,
            TITLE: 'Permission Denied',
            MESSAGE:
              'Only nodal officers can update KPI entries for their assigned roles',
          });
        }
      }

      // Get the KPI template for validation
      const template = await KpiTemplateService.getKpiTemplate(
        entry.kpiTemplateId
      );
      if (!template) {
        throw new APIError({
          STATUS: 404,
          TITLE: 'KPI Template Not Found',
          MESSAGE: `KPI template not found: ${entry.kpiTemplateId}`,
        });
      }

      // Validate and calculate scores
      const validatedValues = this.validateAndCalculateScores(
        values,
        template.template
      );

      // Calculate total score
      const totalScore = validatedValues.reduce(
        (sum, value) => sum + value.score,
        0
      );

      // Update the entry
      const updatedEntry = await KpiEntryModel.findByIdAndUpdate(
        entryId,
        {
          values: validatedValues,
          totalScore,
          status: 'initiated', // Mark as initiated when values are added
        },
        { new: true }
      );

      logger.info(
        `Updated KPI entry ${entryId} with values by ${updatedBy} (${userRole})`
      );
      return updatedEntry;
    } catch (error) {
      logger.error('Error updating KPI entry values:', error);
      throw error;
    }
  }

  /**
   * Validate if a nodal officer has permission to update a specific entry
   */
  static async validateNodalOfficerPermission(
    userRole: string,
    userDepartment: string,
    entry: any
  ): Promise<boolean> {
    if (userDepartment === 'collector-office') {
      return true;
    }
    // Only nodal officers can update entries
    if (!userRole.startsWith('nodalOfficer-')) {
      return false;
    }

    // Get the target role from the nodal officer role
    const targetRole = userRole.replace('nodalOfficer-', '');

    // Get the member for the entry to check their role
    try {
      const member = await MemberService.getMemberByUserId(entry.createdFor);
      if (!member) return false;

      // Check if the member's role matches the nodal officer's target role
      return member.role === targetRole;
    } catch (error) {
      logger.error('Error validating nodal officer permission:', error);
      return false;
    }
  }

  /**
   * Get KPI entries for a user with jurisdiction support
   */
  static async getKpiEntriesByUser(
    userId?: string,
    month?: number,
    year?: number,
    templateId?: string,
    jurisdiction?: string,
    status?: string,
    page: number = 1,
    limit: number = 10
  ) {
    try {
      const filter: FilterQuery<KpiEntry> = {};

      if (status) filter.status = status;
      if (userId) filter.createdFor = userId;
      if (jurisdiction) filter.jurisdiction = jurisdiction;
      if (month) filter.month = month;
      if (year) filter.year = year;
      if (templateId) filter.kpiTemplateId = templateId;

      // Calculate pagination
      const skip = (page - 1) * limit;

      const [entries, total] = await Promise.all([
        KpiEntryModel.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 }) // Sort by newest first
          .lean(),
        KpiEntryModel.countDocuments(filter),
      ]);

      return {
        docs: entries,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      };
    } catch (error) {
      logger.error('Error getting KPI entries by user:', error);
      throw error;
    }
  }

  /**
   * Get KPI entries by jurisdiction for multiple KPI reference users
   */
  static async getKpiEntriesByJurisdiction(
    userId: string,
    jurisdiction: string,
    month?: number,
    year?: number,
    templateId?: string
  ) {
    try {
      const filter: any = {
        createdFor: userId,
        jurisdiction: { $in: [jurisdiction] }, // Check if jurisdiction exists in the array
      };

      if (month) filter.month = month;
      if (year) filter.year = year;
      if (templateId) filter.kpiTemplateId = templateId;

      const entry = await KpiEntryModel.findOne(filter).lean();
      return entry;
    } catch (error) {
      logger.error('Error getting KPI entry by jurisdiction:', error);
      throw error;
    }
  }

  /**
   * Validate and calculate scores for KPI values
   */
  static validateAndCalculateScores(
    values: Array<{
      name: string;
      value: number | string | boolean;
      score?: number;
      comments?: string;
      isByPassed?: boolean;
    }>,
    templateItems: TemplateItem[]
  ): Array<{
    name: string;
    value: number | string | boolean;
    score: number;
    comments?: string;
    isByPassed?: boolean;
  }> {
    // First validate that all required non-dynamic KPIs are provided
    this.validateRequiredValues(values, templateItems);

    const validatedValues = [];

    for (const value of values) {
      const templateItem = templateItems.find(
        (item) => item.name === value.name
      );

      if (!templateItem) {
        logger.warn(`Template item not found for KPI: ${value.name}`);
        continue;
      }

      let score = 0;

      // For bypassed items, use the provided score field as final score
      if (value.isByPassed) {
        if (value.score === undefined) {
          throw new APIError({
            STATUS: 400,
            TITLE: 'Missing score field',
            MESSAGE: `Bypassed KPI ${value.name} must have a score field`,
          });
        }
        score = value.score;
      } else {
        // For non-bypassed items, ignore any provided score and calculate automatically
        if (value.score !== undefined) {
          logger.warn(
            `Score field ignored for non-bypassed KPI: ${value.name}. Score will be calculated automatically.`
          );
        }

        // Validate value type
        if (
          templateItem.kpiType === 'quantitative' ||
          templateItem.kpiType === 'percentage' ||
          templateItem.kpiType === 'score'
        ) {
          if (typeof value.value !== 'number') {
            throw new APIError({
              STATUS: 400,
              TITLE: 'Invalid value type',
              MESSAGE: `KPI ${value.name} expects numeric value, got ${typeof value.value}`,
            });
          }
        } else if (templateItem.kpiType === 'binary') {
          if (typeof value.value !== 'boolean') {
            throw new APIError({
              STATUS: 400,
              TITLE: 'Invalid value type',
              MESSAGE: `KPI ${value.name} expects boolean value, got ${typeof value.value}`,
            });
          }
        }

        // Calculate score based on scoring rules
        score = this.calculateScore(
          value.value,
          templateItem.scoringRules,
          templateItem.kpiType,
          value.name
        );
      }

      validatedValues.push({
        ...value,
        score,
      });
    }

    return validatedValues;
  }

  /**
   * Validate that all non-dynamic KPI items are provided in the entry
   */
  static validateRequiredValues(
    values: Array<{
      name: string;
      value: number | string | boolean;
      score?: number;
      comments?: string;
      isByPassed?: boolean;
    }>,
    templateItems: TemplateItem[]
  ): void {
    const providedKpiNames = values.map((v) => v.name);
    const missingNonDynamicKpis = templateItems
      .filter(
        (item) => !item.isDynamic && !providedKpiNames.includes(item.name)
      )
      .map((item) => item.name);

    if (missingNonDynamicKpis.length > 0) {
      throw new APIError({
        STATUS: 400,
        TITLE: 'Missing required values',
        MESSAGE:
          `Missing required values for non-dynamic KPIs: ${missingNonDynamicKpis.join(', ')}. ` +
          `All KPI items with isDynamic: false must be provided in the entry.`,
      });
    }
  }

  /**
   * Calculate score based on value and scoring rules
   */
  static calculateScore(
    value: number | string | boolean,
    scoringRules: ScoringRule[],
    kpiType?: string,
    kpiName?: string
  ): number {
    logger.debug(
      `Calculating score for KPI "${kpiName}" (${kpiType}): value=${value}, rules=${JSON.stringify(scoringRules)}`
    );

    // For score type, the value IS the score (direct score entry)
    if (kpiType === 'score' && typeof value === 'number') {
      logger.debug(`Direct score entry: ${value}`);
      return value;
    }

    // For percentage type, find the highest scoring rule where value >= rule.value
    if (kpiType === 'percentage' && typeof value === 'number') {
      // Sort rules by value in descending order to find the highest applicable score
      const sortedRules = [...scoringRules]
        .filter((rule) => rule.value !== undefined)
        .sort((a, b) => (b.value as number) - (a.value as number));

      for (const rule of sortedRules) {
        if (value >= (rule.value as number)) {
          logger.debug(
            `Percentage score calculated: ${rule.score} (${value}% >= ${rule.value}%)`
          );
          return rule.score;
        }
      }

      logger.warn(
        `No percentage rule matched for KPI "${kpiName}" with value ${value}%. Available rules: ${JSON.stringify(scoringRules)}`
      );
      return 0;
    }

    // For other types, use existing rule-based logic
    for (const rule of scoringRules) {
      // For range-based rules (min/max)
      if (rule.min !== undefined && rule.max !== undefined) {
        if (
          typeof value === 'number' &&
          value >= rule.min &&
          value <= rule.max
        ) {
          logger.debug(
            `Score calculated: ${rule.score} (range: ${rule.min}-${rule.max})`
          );
          return rule.score;
        }
      }
      // For exact value rules
      else if (rule.value !== undefined && value === rule.value) {
        logger.debug(
          `Score calculated: ${rule.score} (exact match: ${rule.value})`
        );
        return rule.score;
      }
    }

    logger.warn(
      `No scoring rule matched for KPI "${kpiName}" with value ${value}. Available rules: ${JSON.stringify(scoringRules)}`
    );
    return 0; // Default score if no rule matches
  }

  // Additional CRUD methods
  async getKpiEntry(id: string) {
    const kpiEntry = await KpiEntryModel.findById(id).lean();
    return kpiEntry;
  }

  async getKpiEntries(
    filter: FilterQuery<KpiEntry> = {},
    page: number = 1,
    limit: number = 10
  ) {
    const [kpiEntries, total] = await Promise.all([
      KpiEntryModel.find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      KpiEntryModel.countDocuments(filter),
    ]);

    return {
      docs: kpiEntries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPreviousPage: page > 1,
    };
  }

  async updateKpiEntry(id: string, kpiEntry: KpiEntryCreate) {
    const updatedKpiEntry = await KpiEntryModel.findByIdAndUpdate(
      id,
      kpiEntry,
      {
        new: true,
      }
    ).lean();
    return updatedKpiEntry;
  }

  async deleteKpiEntry(id: string) {
    const deletedKpiEntry = await KpiEntryModel.findByIdAndDelete(id);
    return deletedKpiEntry;
  }

  /**
   * Generate final KPI reports - sets status to 'generated' and locks entries
   * This should be called at the end of the month to finalize all entries
   */
  static async generateFinalReports(
    templateId: string,
    month: number,
    year: number,
    generatedBy: string
  ) {
    try {
      logger.info(
        `Generating final KPI reports for template ${templateId}, month ${month}, year ${year}`
      );

      // Get all entries for the specified month that are not already generated
      const entries = await KpiEntryModel.find({
        kpiTemplateId: templateId,
        month,
        year,
        status: { $in: ['created', 'initiated'] },
      });

      if (entries.length === 0) {
        throw new APIError({
          STATUS: HttpErrorStatusCode.NOT_FOUND,
          TITLE: 'No Entries Found',
          MESSAGE: `No KPI entries found for template ${templateId} in ${month}/${year}`,
        });
      }

      // Update all entries to 'generated' status
      const updatePromises = entries.map((entry) =>
        KpiEntryModel.findByIdAndUpdate(entry._id, {
          status: 'generated',
        })
      );

      await Promise.all(updatePromises);

      logger.info(
        `Generated ${entries.length} final KPI reports for template ${templateId}`
      );

      // Log the report generation
      KpiAuditLogService.create({
        type: 'entry',
        userId: generatedBy,
        action: 'generate_report',
        changes: [
          {
            field: 'final_reports_generated',
            oldValue: null,
            newValue: {
              templateId,
              month,
              year,
              entriesCount: entries.length,
            },
          },
        ],
      });

      return {
        message: `Successfully generated ${entries.length} final KPI reports`,
        entriesCount: entries.length,
        templateId,
        month,
        year,
      };
    } catch (error) {
      logger.error('Error generating final KPI reports:', error);
      throw error;
    }
  }

  /**
   * Get KPI entries statistics by department and role with month and year
   * Adapted for new flow with kpirefs field
   */
  static async getKpiEntriesStatisticsByDepartmentAndRoleWithMonthAndYear(
    page: string,
    limit: string,
    templateId?: string,
    department?: string,
    role?: string,
    month?: string,
    year?: string
  ) {
    try {
      const pageNum = Number(page) || 1;
      const limitNum = Number(limit) || 100;

      // Handle month and year calculation properly
      let monthNum: number;
      let yearNum: number;
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1; // 1-12
      const currentYear = currentDate.getFullYear();

      if (month) {
        const monthValue = Number(month);
        if (monthValue < 0) {
          // Handle negative months (previous months)
          const monthsToSubtract = Math.abs(monthValue);
          const totalMonths = currentMonth - monthsToSubtract;
          if (totalMonths <= 0) {
            // Need to go back to previous year(s)
            const yearsToSubtract = Math.ceil(Math.abs(totalMonths) / 12);
            yearNum = currentYear - yearsToSubtract;
            monthNum = 12 + (totalMonths % 12);
            if (monthNum === 0) monthNum = 12;
          } else {
            yearNum = currentYear;
            monthNum = totalMonths;
          }
        } else {
          // Positive month value
          monthNum = monthValue;
          yearNum = year ? Number(year) : currentYear;
        }
      } else {
        monthNum = currentMonth;
        yearNum = year ? Number(year) : currentYear;
      }

      // Handle year calculation if provided
      if (year) {
        const yearValue = Number(year);
        if (yearValue < 0) {
          // Handle negative years (previous years)
          yearNum = currentYear + yearValue; // yearValue is negative, so this subtracts
        } else {
          yearNum = yearValue;
        }
      }

      // Build member query based on provided parameters
      const memberQuery: any = {};
      if (department) memberQuery.department = department; // MemberService expects 'department'
      if (role) memberQuery.role = role;

      // Get All members (filtered by department/role if provided, or all if not provided)
      // For statistics, we want ALL members, not paginated
      const members = await MemberService.getMembers({
        ...memberQuery,
        page: 1,
        limit: 10000, // Get all members for statistics
      });

      // Filter out nodalOfficer roles and collector-office department
      const filteredMembers = {
        ...members,
        docs: filterExcludedMembers(members.docs),
      };

      // Debug logging for members
      logger.info('Members debug:', {
        totalMembers: members.total,
        filteredMembersCount: filteredMembers.docs.length,
        memberQuery,
      });

      // Build KPI entries query
      const kpiEntriesQuery: any = {
        month: monthNum,
        year: yearNum,
      };

      // Add template filter only if templateId is provided
      if (templateId) {
        kpiEntriesQuery.kpiTemplateId = templateId;
      }

      // Get All KPI entries for the month
      const kpiEntries = await KpiEntryModel.find(kpiEntriesQuery).lean();

      // Debug logging
      logger.info('Statistics query debug:', {
        kpiEntriesQuery,
        monthNum,
        yearNum,
        templateId,
        department,
        role,
        kpiEntriesCount: kpiEntries.length,
        membersCount: filteredMembers.docs.length,
      });

      // Check if there are any entries for the specified month
      if (kpiEntries.length === 0) {
        throw new APIError({
          STATUS: 404,
          TITLE: 'No KPI Entries Found',
          MESSAGE: `No KPI entries found for ${format(new Date(yearNum, monthNum - 1, 1), 'MMMM yyyy')}. Please ensure monthly entries are generated first.`,
        });
      }

      // For previous months, only show generated entries
      if (month && Number(month) < 0) {
        const generatedEntries = kpiEntries.filter(
          (entry) => entry.status === 'generated'
        );
        if (generatedEntries.length === 0) {
          throw new APIError({
            STATUS: 404,
            TITLE: 'No Generated Reports Found',
            MESSAGE: `No generated KPI reports found for ${format(new Date(yearNum, monthNum - 1, 1), 'MMMM yyyy')}. Please generate reports first before viewing statistics.`,
          });
        }
      }

      // Create a map of existing entries by member ID and kpiref
      const entriesMap = new Map();
      kpiEntries.forEach((entry) => {
        const memberId = entry.createdFor;
        const kpiref = entry.kpirefs; // Each entry has a specific kpiref

        if (!entriesMap.has(memberId)) {
          entriesMap.set(memberId, new Map());
        }
        entriesMap.get(memberId).set(kpiref, entry);
      });

      // Create rankings array - one entry per kpiref per member
      const rankings: {
        memberId: string;
        memberName: string;
        memberEmail: string;
        memberDepartment: string;
        memberRole: string;
        ranking: number;
        totalScore: number;
        hasEntry: boolean;
        entryId?: string;
        status: string;
        kpiref: string;
        jurisdiction?: string[];
      }[] = [];

      // Process all members - create one ranking entry per kpiref
      filteredMembers.docs.forEach((member: any) => {
        const memberKpirefs = member.metadata?.kpirefs || [];
        const memberEntriesMap = entriesMap.get(member.userId) || new Map();

        // If member has no kpirefs, check if they have any KPI entries
        if (memberKpirefs.length === 0) {
          // Check if member has any KPI entries (for members without kpirefs)
          const memberEntries = kpiEntries.filter(
            (entry) => entry.createdFor === member.userId
          );
          const entry = memberEntries.length > 0 ? memberEntries[0] : null;

          let totalScore = 0;
          let hasEntry = false;
          let status = 'no-entry';
          let entryId = undefined;
          let jurisdiction: string[] = [];

          if (entry) {
            status = entry.status;
            entryId = entry._id.toString();
            jurisdiction = entry.jurisdiction || [];

            // hasEntry is true only for initiated or generated status
            if (entry.status === 'initiated' || entry.status === 'generated') {
              hasEntry = true;
              totalScore = entry.totalScore || 0;
            }
          }

          rankings.push({
            memberId: member.userId,
            memberName: member.user?.name || 'Unknown',
            memberEmail: member.user?.email || 'Unknown',
            memberDepartment: member.departmentSlug,
            memberRole: member.role,
            ranking: 0,
            totalScore,
            hasEntry,
            entryId,
            status,
            kpiref: 'no-kpiref',
            jurisdiction,
          });
          return;
        }

        // Create one ranking entry for each kpiref
        memberKpirefs.forEach((kpiref: string) => {
          const entry = memberEntriesMap.get(kpiref);

          let totalScore = 0;
          let hasEntry = false;
          let status = 'no-entry';
          let entryId = undefined;
          let jurisdiction: string[] = [];

          if (entry) {
            status = entry.status;
            entryId = entry._id;
            jurisdiction = entry.jurisdiction || [];

            // hasEntry is true only for initiated or generated status
            if (entry.status === 'initiated' || entry.status === 'generated') {
              hasEntry = true;
              totalScore = entry.totalScore || 0;
            }
            // For 'created' status, hasEntry remains false and totalScore remains 0
          }

          rankings.push({
            memberId: member.userId,
            memberName: member.user?.name || 'Unknown',
            memberEmail: member.user?.email || 'Unknown',
            memberDepartment: member.departmentSlug,
            memberRole: member.role,
            ranking: 0, // Will be calculated after sorting
            totalScore,
            hasEntry,
            entryId,
            status,
            kpiref,
            jurisdiction,
          });
        });
      });

      // For current month: show all entries but rank only generated ones
      // For previous months: rank only generated entries
      const isCurrentMonth =
        monthNum === currentMonth && yearNum === currentYear;

      if (isCurrentMonth) {
        // Current month: show all entries, rank only generated
        rankings.sort((a, b) => {
          // First, sort by status priority: generated > initiated > created > no-entry
          const statusPriority: Record<string, number> = {
            generated: 4,
            initiated: 3,
            created: 2,
            'no-entry': 1,
          };
          const aPriority = statusPriority[a.status] || 0;
          const bPriority = statusPriority[b.status] || 0;
          if (aPriority !== bPriority) {
            return bPriority - aPriority; // Higher priority first
          }
          // If same status, sort by total score (highest to lowest)
          return b.totalScore - a.totalScore;
        });

        // Assign rankings only to generated entries, others get 0
        let rankingCounter = 1;
        rankings.forEach((ranking) => {
          if (ranking.status === 'generated') {
            ranking.ranking = rankingCounter++;
          } else {
            ranking.ranking = 0; // No ranking for non-generated entries in current month
          }
        });
      } else {
        // Previous months: rank only generated entries
        const generatedRankings = rankings.filter(
          (r) => r.status === 'generated'
        );
        generatedRankings.sort((a, b) => b.totalScore - a.totalScore);

        // Assign rankings only to generated entries
        generatedRankings.forEach((ranking, index) => {
          ranking.ranking = index + 1;
        });

        // Set ranking to 0 for non-generated entries
        rankings.forEach((ranking) => {
          if (ranking.status !== 'generated') {
            ranking.ranking = 0;
          }
        });
      }

      // Calculate statistics
      const totalRankings = rankings.length;
      const rankingsWithEntries = rankings.filter((r) => r.hasEntry).length;
      const rankingsWithoutEntries = totalRankings - rankingsWithEntries;
      const averageScore =
        rankingsWithEntries > 0
          ? rankings
              .filter((r) => r.hasEntry)
              .reduce((sum, r) => sum + r.totalScore, 0) / rankingsWithEntries
          : 0;
      const highestScore = rankings.length > 0 ? rankings[0].totalScore : 0;
      const lowestScore =
        rankingsWithEntries > 0
          ? rankings.filter((r) => r.hasEntry).slice(-1)[0]?.totalScore || 0
          : 0;

      // Get all departments and roles (excluding collector-office)
      const allMembers = await MemberService.getMembers({
        page: 1,
        limit: 10000, // Get all members to extract departments and roles
      });

      // Filter out collector-office and nodalOfficer roles
      const filteredAllMembers = filterExcludedMembers(allMembers.docs);

      // Extract unique departments and roles
      const departments = [
        ...new Set(
          filteredAllMembers.map((member: any) => member.departmentSlug)
        ),
      ];
      const roles = [
        ...new Set(filteredAllMembers.map((member: any) => member.role)),
      ];

      return {
        rankings,
        statistics: {
          totalRankings,
          rankingsWithEntries,
          rankingsWithoutEntries,
          averageScore: Math.round(averageScore * 100) / 100,
          highestScore,
          lowestScore,
          completionRate: Math.round(
            (rankingsWithEntries / totalRankings) * 100
          ),
        },
        department: department || 'All Departments',
        role: role || 'All Roles',
        templateId: templateId || 'All Templates',
        month: format(new Date(yearNum, monthNum - 1, 1), 'MMMM'),
        year: format(new Date(yearNum, monthNum - 1, 1), 'yyyy'),
        availableFilters: {
          departments: departments.sort(),
          roles: roles.sort(),
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalRankings,
          totalPages: Math.ceil(totalRankings / limitNum),
          hasNextPage: pageNum < Math.ceil(totalRankings / limitNum),
          hasPreviousPage: pageNum > 1,
        },
      };
    } catch (error) {
      throw error;
    }
  }
}
