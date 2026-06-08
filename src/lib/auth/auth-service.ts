// Auth service — signup (creates an Agency + its admin User) and login. Depends
// on narrow store interfaces (not Prisma) so it is testable with fakes. Hashing
// and token signing are injectable for the same reason.
import { ConflictError, UnauthorizedError } from "@/lib/errors/app-error";
import { hashPassword, verifyPassword } from "./password";
import { signSession, type SessionClaims } from "./jwt";
import type { Role } from "./roles";

export interface AgencyRecord {
  id: string;
  name: string;
}

export interface AuthUserRecord {
  id: string;
  agencyId: string;
  email: string;
  role: Role;
  passwordHash: string;
}

/** Public projection — never includes passwordHash. */
export interface PublicUser {
  id: string;
  agencyId: string;
  email: string;
  role: Role;
}

export interface AgencyStore {
  create(data: { name: string }): Promise<AgencyRecord>;
}

export interface UserStore {
  create(data: {
    agencyId: string;
    email: string;
    role: Role;
    passwordHash: string;
  }): Promise<AuthUserRecord>;
  findByEmail(email: string): Promise<AuthUserRecord | null>;
}

export interface SignupInput {
  agencyName: string;
  email: string;
  password: string;
}
export interface LoginInput {
  email: string;
  password: string;
}
export interface AuthResult {
  token: string;
  user: PublicUser;
}

export interface AuthServiceDeps {
  agencies: AgencyStore;
  users: UserStore;
  secret: string;
  hash?: (password: string) => Promise<string>;
  verify?: (password: string, stored: string) => Promise<boolean>;
  signToken?: (claims: SessionClaims, secret: string) => string;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function toPublic(user: AuthUserRecord): PublicUser {
  return { id: user.id, agencyId: user.agencyId, email: user.email, role: user.role };
}

export class AuthService {
  private readonly hash: (p: string) => Promise<string>;
  private readonly verify: (p: string, s: string) => Promise<boolean>;
  private readonly signToken: (c: SessionClaims, s: string) => string;

  constructor(private readonly deps: AuthServiceDeps) {
    this.hash = deps.hash ?? hashPassword;
    this.verify = deps.verify ?? verifyPassword;
    this.signToken = deps.signToken ?? signSession;
  }

  async signup(input: SignupInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const existing = await this.deps.users.findByEmail(email);
    if (existing) throw new ConflictError("An account with this email already exists");

    const passwordHash = await this.hash(input.password);
    const agency = await this.deps.agencies.create({ name: input.agencyName.trim() });
    const user = await this.deps.users.create({
      agencyId: agency.id,
      email,
      role: "agency_admin", // first user of a new agency is its admin
      passwordHash,
    });

    return { token: this.tokenFor(user), user: toPublic(user) };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const user = await this.deps.users.findByEmail(email);
    // Generic message + always run a verify-ish path to avoid user enumeration.
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }
    const ok = await this.verify(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedError("Invalid email or password");

    return { token: this.tokenFor(user), user: toPublic(user) };
  }

  private tokenFor(user: AuthUserRecord): string {
    return this.signToken(
      { sub: user.id, agencyId: user.agencyId, role: user.role },
      this.deps.secret,
    );
  }
}
