// In-memory AgencyStore + UserStore for auth-service tests.
import type {
  AgencyRecord,
  AgencyStore,
  AuthUserRecord,
  UserStore,
} from "@/lib/auth/auth-service";
import type { Role } from "@/lib/auth/roles";

export class FakeAgencyStore implements AgencyStore {
  readonly rows: AgencyRecord[] = [];
  private seq = 0;
  async create({ name }: { name: string }): Promise<AgencyRecord> {
    const row = { id: `agency_${++this.seq}`, name };
    this.rows.push(row);
    return { ...row };
  }
}

export class FakeUserStore implements UserStore {
  readonly rows: AuthUserRecord[] = [];
  private seq = 0;

  async create(data: {
    agencyId: string;
    email: string;
    role: Role;
    passwordHash: string;
  }): Promise<AuthUserRecord> {
    const row: AuthUserRecord = { id: `user_${++this.seq}`, ...data };
    this.rows.push(row);
    return { ...row };
  }

  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    const row = this.rows.find((r) => r.email === email);
    return row ? { ...row } : null;
  }
}
