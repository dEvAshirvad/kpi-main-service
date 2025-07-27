import { MemberCreate, MemberModel } from './members.model';
import { db } from '@/configs/db/mongodb';
import { ObjectId } from 'mongodb';
import logger from '@/configs/logger';

export class MemberService {
  static async createMember(member: MemberCreate) {
    const newMember = await MemberModel.create(member);
    return newMember;
  }

  static async getMemberByUserId(id: string) {
    const member = await MemberModel.findOne({ userId: id }).lean();
    const user = await db.collection('user').findOne({ _id: new ObjectId(id) });

    return {
      ...member,
      user,
    };
  }

  static async updateMember(
    id: string,
    member: Partial<MemberCreate> & {
      name?: string;
      email?: string;
    }
  ) {
    const user = await db.collection('user').findOne({ _id: new ObjectId(id) });
    if (!user) {
      throw new Error('User not found');
    }

    // Only update user fields if they are provided and not empty
    const userUpdate: any = {};
    if (member.name !== undefined && member.name !== '')
      userUpdate.name = member.name;
    if (member.email !== undefined && member.email !== '')
      userUpdate.email = member.email;

    let updatedUser = null;
    if (Object.keys(userUpdate).length > 0) {
      updatedUser = await db
        .collection('user')
        .findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: userUpdate },
          { returnDocument: 'after' }
        );
    }

    // Only update member fields if they are provided and not empty
    const memberUpdate: any = {};
    if (member.departmentSlug !== undefined && member.departmentSlug !== '')
      memberUpdate.departmentSlug = member.departmentSlug;
    if (member.role !== undefined && member.role !== '')
      memberUpdate.role = member.role;

    // Handle role-specific metadata
    if (member.metadata !== undefined) {
      memberUpdate.metadata = this.validateAndAdaptMetadata(
        member.role || '',
        member.metadata
      );
    }

    const updatedMember = await MemberModel.findOneAndUpdate(
      { userId: id },
      { $set: memberUpdate },
      { returnDocument: 'after' }
    ).lean();

    logger.debug(`Updated user: ${JSON.stringify(updatedUser)}`);
    logger.debug(`Updated member: ${JSON.stringify(updatedMember)}`);

    return { member: updatedMember, user: updatedUser };
  }

  /**
   * Validate and adapt metadata based on role
   */
  private static validateAndAdaptMetadata(role: string, metadata: any): any {
    const adaptedMetadata: any = {
      kpirefs: [],
      isMultipleKPIRef: false,
    };

    switch (role) {
      case 'ri':
        // RI specific metadata
        if (metadata.tehsil) adaptedMetadata.tehsil = metadata.tehsil;
        if (metadata['ri-circle'] && Array.isArray(metadata['ri-circle'])) {
          adaptedMetadata['ri-circle'] = metadata['ri-circle'];
          adaptedMetadata.kpirefs = metadata['ri-circle'];
          adaptedMetadata.isMultipleKPIRef = metadata['ri-circle'].length > 1;
        }
        // Build jurisdiction array
        if (adaptedMetadata.tehsil && adaptedMetadata.kpirefs.length > 0) {
          adaptedMetadata.jurisdiction = [
            adaptedMetadata.tehsil,
            ...adaptedMetadata.kpirefs,
          ];
        } else if (adaptedMetadata.kpirefs.length > 0) {
          adaptedMetadata.jurisdiction = [...adaptedMetadata.kpirefs];
        }
        break;

      case 'tehsildar':
        // Tehsildar specific metadata
        if (metadata.courts && Array.isArray(metadata.courts)) {
          adaptedMetadata.courts = metadata.courts;
          adaptedMetadata.kpirefs = metadata.courts;
          adaptedMetadata.isMultipleKPIRef = metadata.courts.length > 1;
        }
        // Build jurisdiction array (tehsildar doesn't include tehsil in jurisdiction)
        if (adaptedMetadata.kpirefs.length > 0) {
          adaptedMetadata.jurisdiction = [...adaptedMetadata.kpirefs];
        }
        break;

      case 'patwari':
        // Patwari specific metadata
        if (metadata.tehsil) adaptedMetadata.tehsil = metadata.tehsil;
        if (metadata.halka && Array.isArray(metadata.halka)) {
          adaptedMetadata.halka = metadata.halka;
          adaptedMetadata.kpirefs = metadata.halka;
          adaptedMetadata.isMultipleKPIRef = metadata.halka.length > 1;
        }
        // Build jurisdiction array
        if (adaptedMetadata.tehsil && adaptedMetadata.kpirefs.length > 0) {
          adaptedMetadata.jurisdiction = [
            adaptedMetadata.tehsil,
            ...adaptedMetadata.kpirefs,
          ];
        } else if (adaptedMetadata.kpirefs.length > 0) {
          adaptedMetadata.jurisdiction = [...adaptedMetadata.kpirefs];
        }
        break;

      case 'sdm':
        // SDM has no specific KPI references
        adaptedMetadata.kpirefs = [];
        adaptedMetadata.isMultipleKPIRef = false;
        break;

      case 'nodalOfficer-sdm':
      case 'nodalOfficer-tehsildar':
      case 'nodalOfficer-patwari':
      case 'nodalOfficer-ri':
        // Nodal officers and collector have no KPI references
        adaptedMetadata.kpirefs = [];
        adaptedMetadata.isMultipleKPIRef = false;
        break;

      default:
        // For unknown roles, preserve existing metadata
        adaptedMetadata.kpirefs = metadata.kpirefs || [];
        adaptedMetadata.isMultipleKPIRef = metadata.isMultipleKPIRef || false;
        if (metadata.jurisdiction)
          adaptedMetadata.jurisdiction = metadata.jurisdiction;
        break;
    }

    return adaptedMetadata;
  }

  /**
   * Validate role-specific metadata
   */
  static validateRoleMetadata(
    role: string,
    metadata: any
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    switch (role) {
      case 'ri':
        if (metadata['ri-circle'] && !Array.isArray(metadata['ri-circle'])) {
          errors.push('ri-circle must be an array');
        }
        if (metadata['ri-circle'] && metadata['ri-circle'].length === 0) {
          errors.push('ri-circle cannot be empty for ri role');
        }
        break;

      case 'tehsildar':
        if (metadata.courts && !Array.isArray(metadata.courts)) {
          errors.push('courts must be an array');
        }
        if (metadata.courts && metadata.courts.length === 0) {
          errors.push('courts cannot be empty for tehsildar role');
        }
        break;

      case 'patwari':
        if (metadata.halka && !Array.isArray(metadata.halka)) {
          errors.push('halka must be an array');
        }
        if (metadata.halka && metadata.halka.length === 0) {
          errors.push('halka cannot be empty for patwari role');
        }
        break;

      case 'sdm':
      case 'nodalOfficer-sdm':
      case 'nodalOfficer-tehsildar':
      case 'nodalOfficer-patwari':
      case 'nodalOfficer-ri':
      case 'collector-raipur':
        // These roles don't require specific metadata validation
        break;

      default:
        errors.push(`Unknown role: ${role}`);
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static async deleteMember(id: string) {
    const deletedMember = await MemberModel.findByIdAndDelete(id);
    return deletedMember;
  }

  static async getMembers(
    filters: {
      department?: string;
      role?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const { department, role, page = 1, limit = 10 } = filters;

    // Build query
    const query: any = {};
    if (department) query.departmentSlug = department;
    if (role) query.role = role;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get members with pagination
    const [members, total] = await Promise.all([
      MemberModel.find(query).skip(skip).limit(limit).lean(),
      MemberModel.countDocuments(query),
    ]);

    // Get user details for each member
    const membersWithUsers = await Promise.all(
      members.map(async (member) => {
        try {
          const user = await db.collection('user').findOne({
            _id: new ObjectId(member.userId),
          });
          return {
            ...member,
            user,
          };
        } catch (error) {
          logger.warn(
            `Failed to fetch user for member ${member.userId}:`,
            error
          );
          return {
            ...member,
            user: null,
          };
        }
      })
    );

    return {
      docs: membersWithUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPreviousPage: page > 1,
    };
  }
}
