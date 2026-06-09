// Team management — the persistence boundary for an agency's user roster.
// Mirrors the AuthStore split: the service holds the role/invariant logic and
// depends on this narrow store (not Prisma) so it is testable against a fake.
import type { Role } from "@/lib/auth/roles";

/** Public projection of a User — never carries the passwordHash. */
export interface TeamUser {
  id: string;
  agencyId: string;
  email: string;
  role: Role;
  createdAt: Date;
}

export interface TeamCreateInput {
  agencyId: string;
  email: string;
  role: Role;
  passwordHash: string;
}

/** The subset of persistence operations the TeamService needs. */
export interface TeamStore {
  /** All users in the agency, newest first. */
  listByAgency(agencyId: string): Promise<TeamUser[]>;
  /** A single user, but only if it belongs to the agency (tenant scope). */
  findInAgency(agencyId: string, userId: string): Promise<TeamUser | null>;
  /** How many agency_admins the agency currently has (last-admin guard). */
  countAdmins(agencyId: string): Promise<number>;
  /** Insert a user; throws a Prisma P2002 on a duplicate email. */
  create(input: TeamCreateInput): Promise<TeamUser>;
  /**
   * Scoped write: change role only if BOTH id AND agencyId match. Returns the
   * updated record, or null if nothing matched (not found / wrong tenant).
   */
  setRole(agencyId: string, userId: string, role: Role): Promise<TeamUser | null>;
  /** Scoped delete: returns true if a row in this agency was removed. */
  remove(agencyId: string, userId: string): Promise<boolean>;
}
