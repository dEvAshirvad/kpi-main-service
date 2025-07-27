import { Request, Response } from 'express';
import { MemberService } from './members.service';
import Respond from '@/lib/respond';
import logger from '@/configs/logger';

export class MemberHandler {
  static async getMembers(req: Request, res: Response) {
    const { department, role, page, limit } = req.query;

    const filters = {
      department: department as string,
      role: role as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 10,
    };

    const result = await MemberService.getMembers(filters);
    Respond(
      res,
      {
        ...result,
        message: 'Members fetched successfully',
      },
      200
    );
  }

  static async getMyMember(req: Request, res: Response) {
    const member = await MemberService.getMemberByUserId(
      req.user?.id as string
    );
    Respond(res, { member, message: 'Member fetched successfully' }, 200);
  }

  static async updateMember(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        email,
        department: departmentSlug,
        role,
        metadata,
      } = req.body;

      // Validate required fields
      if (!id) {
        return Respond(res, { message: 'Member ID is required' }, 400);
      }

      // Validate role-specific metadata
      if (role && metadata) {
        const validationResult = MemberService.validateRoleMetadata(
          role,
          metadata
        );
        if (!validationResult.isValid) {
          return Respond(
            res,
            {
              message: 'Invalid metadata for role',
              errors: validationResult.errors,
            },
            400
          );
        }
      }

      const member = await MemberService.updateMember(id, {
        userId: id,
        name,
        email,
        departmentSlug,
        role,
        metadata,
      });

      Respond(res, { member, message: 'Member updated successfully' }, 200);
    } catch (error) {
      logger.error('Error updating member:', error);
      Respond(
        res,
        { message: 'Failed to update member', error: (error as Error).message },
        500
      );
    }
  }
}
