// In-memory TeamStore for TeamService tests. Emulates the unique-email
// constraint by throwing a Prisma P2002 (so withDbErrors maps it to a
// ConflictError exactly as the real DB path would), and enforces agency
// scoping on every read/write so tenant-isolation tests are meaningful.
import { Prisma } from "@prisma/client";
import type { Role } from "@/lib/auth/roles";
import type { TeamCreateInput, TeamStore, TeamUser } from "@/lib/team/types";

export class FakeTeamStore implements TeamStore {
  readonly users: TeamUser[] = [];
  private seq = 0;
  private clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  /** Seed a user directly (e.g. the agency's founding admin). */
  seed(user: { agencyId: string; email: string; role: Role; id?: string }): TeamUser {
    const row: TeamUser = {
      id: user.id ?? `user_${++this.seq}`,
      agencyId: user.agencyId,
      email: user.email,
      role: user.role,
      createdAt: this.clock(),
    };
    this.users.push(row);
    return { ...row };
  }

  async listByAgency(agencyId: string): Promise<TeamUser[]> {
    return this.users
      .filter((u) => u.agencyId === agencyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((u) => ({ ...u }));
  }

  async findInAgency(agencyId: string, userId: string): Promise<TeamUser | null> {
    const row = this.users.find((u) => u.id === userId && u.agencyId === agencyId);
    return row ? { ...row } : null;
  }

  async countAdmins(agencyId: string): Promise<number> {
    return this.users.filter((u) => u.agencyId === agencyId && u.role === "agency_admin")
      .length;
  }

  async create(input: TeamCreateInput): Promise<TeamUser> {
    if (this.users.some((u) => u.email === input.email)) {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      });
    }
    const row: TeamUser = {
      id: `user_${++this.seq}`,
      agencyId: input.agencyId,
      email: input.email,
      role: input.role,
      createdAt: this.clock(),
    };
    this.users.push(row);
    return { ...row };
  }

  async setRole(agencyId: string, userId: string, role: Role): Promise<TeamUser | null> {
    const row = this.users.find((u) => u.id === userId && u.agencyId === agencyId);
    if (!row) return null;
    row.role = role;
    return { ...row };
  }

  async remove(agencyId: string, userId: string): Promise<boolean> {
    const idx = this.users.findIndex((u) => u.id === userId && u.agencyId === agencyId);
    if (idx === -1) return false;
    this.users.splice(idx, 1);
    return true;
  }
}
