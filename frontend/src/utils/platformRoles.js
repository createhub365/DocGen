/** Platform org roles — single source for UI admin gating. */

export const ORG_ADMIN_ROLE = 'org_admin'
export const STAFF_ROLE = 'staff'

/**
 * True when the value is the org admin role string.
 * Accepts the top-level `role` from PlatformAuthContext / GET /me,
 * or an object with `.role` (e.g. currentUser).
 */
export function isOrgAdmin(roleOrUser) {
  if (roleOrUser == null) return false
  if (typeof roleOrUser === 'string') return roleOrUser === ORG_ADMIN_ROLE
  if (typeof roleOrUser === 'object') {
    const role = roleOrUser.role ?? roleOrUser.membership?.role
    return role === ORG_ADMIN_ROLE
  }
  return false
}
