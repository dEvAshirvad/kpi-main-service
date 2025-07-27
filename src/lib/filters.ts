import { Member } from '@/modules/members/members.model';

/**
 * Filter out excluded members (nodalOfficer roles and collector-office department)
 * @param members Array of member objects
 * @returns Filtered array excluding nodalOfficer roles and collector-office
 */
export function filterExcludedMembers(members: Member[]): Member[] {
  return members.filter(
    (member) =>
      !member.role.startsWith('nodalOfficer-') &&
      member.departmentSlug !== 'collector-office'
  );
}

/**
 * Check if a member has multiple KPI references
 * @param member Member object
 * @returns boolean indicating if member has multiple KPI references
 */
export function hasMultipleKpiRefs(member: Member): boolean {
  if (!member.metadata) return false;

  const metadata = member.metadata as any;

  // Use kpirefs field if available
  if (Array.isArray(metadata.kpirefs)) {
    return metadata.kpirefs.length > 1;
  }

  // Fallback to role-specific fields
  switch (member.role) {
    case 'RI':
      return (
        Array.isArray(metadata['ri-circle']) && metadata['ri-circle'].length > 1
      );
    case 'tehsildar':
      return Array.isArray(metadata['courts']) && metadata['courts'].length > 1;
    case 'patwari':
      return Array.isArray(metadata['halka']) && metadata['halka'].length > 1;
    default:
      return false;
  }
}

/**
 * Get KPI references for a member based on their role
 * @param member Member object
 * @returns Array of KPI reference identifiers
 */
export function getMemberKpiRefs(member: Member): string[] {
  if (!member.metadata) return [];

  const metadata = member.metadata as any;

  // Use kpirefs field if available
  if (Array.isArray(metadata.kpirefs)) {
    return metadata.kpirefs;
  }

  // Fallback to role-specific fields
  switch (member.role) {
    case 'RI':
      return Array.isArray(metadata['ri-circle']) ? metadata['ri-circle'] : [];
    case 'tehsildar':
      return Array.isArray(metadata['courts']) ? metadata['courts'] : [];
    case 'patwari':
      return Array.isArray(metadata['halka']) ? metadata['halka'] : [];
    default:
      return [];
  }
}

/**
 * Get jurisdictions for a member based on their role (legacy function)
 * @param member Member object
 * @returns Array of jurisdiction identifiers
 */
export function getMemberJurisdictions(member: Member): string[] {
  return getMemberKpiRefs(member);
}
