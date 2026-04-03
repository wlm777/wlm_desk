import type { UserRole } from "./types";

/** Global: can manage user accounts (create/edit/deactivate) */
export function canManageUsers(role: UserRole): boolean {
  return role === "admin";
}

/** Global: can create new projects */
export function canCreateProject(role: UserRole): boolean {
  return role === "admin" || role === "manager";
}

/** Global: can edit user roles */
export function canEditRoles(role: UserRole): boolean {
  return role === "admin";
}

/**
 * Project-aware: can edit project settings (name, description, members).
 * Admin always can. Manager only if they are a project member.
 */
export function canEditProject(role: UserRole, isProjectMember = true): boolean {
  if (role === "admin") return true;
  if (role === "manager" && isProjectMember) return true;
  return false;
}

/**
 * Project-aware: can create/edit/archive lists in a project.
 * Admin always can. Manager only if they are a project member.
 */
export function canManageLists(role: UserRole, isProjectMember = true): boolean {
  if (role === "admin") return true;
  if (role === "manager" && isProjectMember) return true;
  return false;
}

/**
 * Project-aware: can manage project members (add/remove).
 * Admin always can. Manager only if they are a project member.
 */
export function canManageMembers(role: UserRole, isProjectMember = true): boolean {
  if (role === "admin") return true;
  if (role === "manager" && isProjectMember) return true;
  return false;
}

/** All roles can create tasks in projects where they are members */
export function canCreateTasks(_role: UserRole): boolean {
  return true;
}
