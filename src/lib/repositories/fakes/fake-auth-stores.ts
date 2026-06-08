// In-memory AuthStore for auth-service tests. Emulates the unique-email
// constraint by throwing a Prisma P2002 (so the service's withDbErrors maps it
// to a ConflictError, exactly as the real DB path would).
import { Prisma } from "@prisma/client";
import type {
  AgencyRecord,
  AuthStore,
  AuthUserRecord,
} from "@/lib/auth/auth-service";
import type { Role } from "@/lib/auth/roles";

export class FakeAuthStore implements AuthStore {
  readonly agencies: AgencyRecord[] = [];
  readonly users: AuthUserRecord[] = [];
  private aSeq = 0;
  private uSeq = 0;

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const row = this.users.find((u) => u.email === email);
    return row ? { ...row } : null;
  }

  async createAgencyWithAdmin(input: {
    agencyName: string;
    email: string;
    role: Role;
    passwordHash: string;
  }): Promise<{ agency: AgencyRecord; user: AuthUserRecord }> {
    if (this.users.some((u) => u.email === input.email)) {
      // Mirror the DB unique-constraint violation (rolls back atomically).
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      });
    }
    const agency: AgencyRecord = { id: `agency_${++this.aSeq}`, name: input.agencyName };
    const user: AuthUserRecord = {
      id: `user_${++this.uSeq}`,
      agencyId: agency.id,
      email: input.email,
      role: input.role,
      passwordHash: input.passwordHash,
    };
    this.agencies.push(agency);
    this.users.push(user);
    return { agency: { ...agency }, user: { ...user } };
  }
}
