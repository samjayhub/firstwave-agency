// Auth service — signup (creates an Agency + its admin User atomically) and
// login. Depends on a narrow AuthStore (not Prisma) so it is testable with a
// fake. Hashing and token signing are injectable for the same reason. Store
// calls go through withDbErrors so a unique-constraint race maps to 409, not 500.
import { ConflictError, UnauthorizedError } from "@/lib/errors/app-error";
import { withDbErrors } from "@/lib/db/errors";
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

/** Cohesive persistence boundary for auth. createAgencyWithAdmin MUST be atomic. */
export interface AuthStore {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  createAgencyWithAdmin(input: {
    agencyName: string;
    email: string;
    role: Role;
    passwordHash: string;
  }): Promise<{ agency: AgencyRecord; user: AuthUserRecord }>;
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
  store: AuthStore;
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
  private dummyHash?: Promise<string>;

  constructor(private readonly deps: AuthServiceDeps) {
    this.hash = deps.hash ?? hashPassword;
    this.verify = deps.verify ?? verifyPassword;
    this.signToken = deps.signToken ?? signSession;
  }

  /** A valid hash to verify against when no user exists, so login does equal
   *  work on both branches (defeats user-enumeration via timing). Computed once;
   *  a rejected attempt is not cached. */
  private getDummyHash(): Promise<string> {
    if (!this.dummyHash) {
      this.dummyHash = this.hash("timing-equalizer-placeholder").catch((err) => {
        this.dummyHash = undefined;
        throw err;
      });
    }
    return this.dummyHash;
  }

  async signup(input: SignupInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const existing = await withDbErrors(
      () => this.deps.store.findUserByEmail(email),
      "User",
    );
    if (existing) throw new ConflictError("An account with this email already exists");

    const passwordHash = await this.hash(input.password);
    // Atomic: a failed user insert rolls back the agency (no orphan); a unique
    // race surfaces as P2002 -> ConflictError (409) via withDbErrors.
    const { user } = await withDbErrors(
      () =>
        this.deps.store.createAgencyWithAdmin({
          agencyName: input.agencyName.trim(),
          email,
          role: "agency_admin", // first user of a new agency is its admin
          passwordHash,
        }),
      "User",
    );

    return { token: this.tokenFor(user), user: toPublic(user) };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const user = await withDbErrors(
      () => this.deps.store.findUserByEmail(email),
      "User",
    );
    // Generic message AND equal work on both branches: when no user exists, still
    // run a verify against a dummy hash so response time can't reveal whether the
    // email is registered.
    if (!user) {
      await this.verify(input.password, await this.getDummyHash());
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
