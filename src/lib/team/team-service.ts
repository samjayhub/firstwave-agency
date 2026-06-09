// Team management service — an agency admin invites teammates, changes their
// roles, and removes them. All operations are tenant-scoped through the
// TenantContext and guard the one safety invariant that role management can
// violate: an agency must always keep at least one agency_admin, or it would
// lock itself out of every admin-only action (including team management itself).
//
// This is a rule-based feature (no LLM), so it is AUDIT-EXEMPT. Hashing is
// injectable so tests run without the (deliberately slow) scrypt KDF.
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { withDbErrors } from "@/lib/db/errors";
import { assertAgencyId, type TenantContext } from "@/lib/db/tenancy";
import { hashPassword } from "@/lib/auth/password";
import type { Role } from "@/lib/auth/roles";
import type { TeamStore, TeamUser } from "./types";

export interface PublicTeamUser {
  id: string;
  agencyId: string;
  email: string;
  role: Role;
  createdAt: Date;
}

export interface InviteInput {
  email: string;
  role: Role;
  password: string;
}

export interface TeamServiceDeps {
  store: TeamStore;
  hash?: (password: string) => Promise<string>;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function toPublic(user: TeamUser): PublicTeamUser {
  return {
    id: user.id,
    agencyId: user.agencyId,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export class TeamService {
  private readonly hash: (password: string) => Promise<string>;

  constructor(private readonly deps: TeamServiceDeps) {
    this.hash = deps.hash ?? hashPassword;
  }

  /** Roster of the calling agency. */
  async list(ctx: TenantContext): Promise<PublicTeamUser[]> {
    const agencyId = assertAgencyId(ctx.agencyId);
    const rows = await withDbErrors(() => this.deps.store.listByAgency(agencyId), "User");
    return rows.map(toPublic);
  }

  /** Add a teammate with an initial password. A duplicate email maps to 409. */
  async invite(ctx: TenantContext, input: InviteInput): Promise<PublicTeamUser> {
    const agencyId = assertAgencyId(ctx.agencyId);
    const email = normalizeEmail(input.email);
    const passwordHash = await this.hash(input.password);
    const user = await withDbErrors(
      () => this.deps.store.create({ agencyId, email, role: input.role, passwordHash }),
      "User",
    );
    return toPublic(user);
  }

  /** Change a teammate's role. Refuses to demote the agency's last admin. */
  async updateRole(
    ctx: TenantContext,
    targetUserId: string,
    role: Role,
  ): Promise<PublicTeamUser> {
    const agencyId = assertAgencyId(ctx.agencyId);
    const target = await withDbErrors(
      () => this.deps.store.findInAgency(agencyId, targetUserId),
      "User",
    );
    if (!target) throw new NotFoundError("User not found");
    if (target.role === role) return toPublic(target); // no-op, nothing to guard
    // Demoting the only admin would lock the agency out of every admin action.
    if (target.role === "agency_admin") await this.assertNotLastAdmin(agencyId);

    const updated = await withDbErrors(
      () => this.deps.store.setRole(agencyId, targetUserId, role),
      "User",
    );
    if (!updated) throw new NotFoundError("User not found");
    return toPublic(updated);
  }

  /** Remove a teammate. You cannot remove yourself or the agency's last admin. */
  async remove(
    ctx: TenantContext,
    actingUserId: string,
    targetUserId: string,
  ): Promise<void> {
    const agencyId = assertAgencyId(ctx.agencyId);
    // Self-removal would orphan the caller's session and risks the last-admin
    // lockout via a different door — disallow it outright; demote-then-remove
    // (by another admin) is the intended path.
    if (actingUserId === targetUserId) {
      throw new ValidationError("You cannot remove your own account");
    }
    const target = await withDbErrors(
      () => this.deps.store.findInAgency(agencyId, targetUserId),
      "User",
    );
    if (!target) throw new NotFoundError("User not found");
    if (target.role === "agency_admin") await this.assertNotLastAdmin(agencyId);

    const removed = await withDbErrors(
      () => this.deps.store.remove(agencyId, targetUserId),
      "User",
    );
    if (!removed) throw new NotFoundError("User not found");
  }

  /**
   * The last-admin invariant. Enforced at the app layer with an admin count;
   * the narrow concurrent-demotion race (two admins demoted at once) is a known
   * gap to be hardened later by a DB-level partial constraint / advisory lock.
   */
  private async assertNotLastAdmin(agencyId: string): Promise<void> {
    const admins = await withDbErrors(() => this.deps.store.countAdmins(agencyId), "User");
    if (admins <= 1) {
      throw new ConflictError("An agency must keep at least one admin");
    }
  }
}
