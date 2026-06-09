// Public API keys (P4-08). Per-agency bearer tokens that authenticate the public
// /api/v1 surface. The raw token is shown ONCE at creation; only its SHA-256 hash
// is stored, so a leaked database never yields a usable key. Format:
//   fw_<prefix>_<secret>   (prefix is public, shown in listings)
//
// AUDIT-EXEMPT: rule-based credential management; the ApiKey rows are the trail.
import { createHash, randomBytes } from "node:crypto";
import type { TenantContext } from "@/lib/db/tenancy";
import { NotFoundError } from "@/lib/errors/app-error";

export interface ApiKeyRow {
  id: string;
  agencyId: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  revoked: boolean;
  createdAt: Date;
}

/** Public view of a key — never includes the secret/hash. */
export type ApiKeySummary = Omit<ApiKeyRow, "agencyId">;

/** Returned once at mint time. `token` is unrecoverable afterwards. */
export interface MintedKey extends ApiKeySummary {
  token: string;
}

export interface ApiKeyStore {
  create(
    agencyId: string,
    data: { name: string; prefix: string; hashedKey: string },
  ): Promise<ApiKeyRow>;
  /** Resolve a non-revoked key by its hash; null otherwise. */
  findByHash(hashedKey: string): Promise<{ id: string; agencyId: string } | null>;
  touch(id: string): Promise<void>;
  list(agencyId: string): Promise<ApiKeyRow[]>;
  revoke(agencyId: string, id: string): Promise<boolean>;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const TOKEN_PREFIX = "fw_";

export interface ApiKeyServiceDeps {
  store: ApiKeyStore;
  /** Random hex generator (injected for deterministic tests). */
  randomHex?: (bytes: number) => string;
}

function toSummary(row: ApiKeyRow): ApiKeySummary {
  const { agencyId: _agencyId, ...rest } = row;
  return rest;
}

export class ApiKeyService {
  private readonly randomHex: (bytes: number) => string;

  constructor(private readonly deps: ApiKeyServiceDeps) {
    this.randomHex = deps.randomHex ?? ((bytes) => randomBytes(bytes).toString("hex"));
  }

  /** Mint a new key; the raw token is returned ONCE and never stored. */
  async mint(ctx: TenantContext, name: string): Promise<MintedKey> {
    const prefix = this.randomHex(4);
    const secret = this.randomHex(24);
    const token = `${TOKEN_PREFIX}${prefix}_${secret}`;
    const row = await this.deps.store.create(ctx.agencyId, {
      name,
      prefix,
      hashedKey: sha256Hex(token),
    });
    return { ...toSummary(row), token };
  }

  /** Resolve a raw bearer token to its agency context, or null. Touches lastUsedAt. */
  async authenticate(rawToken: string | undefined | null): Promise<TenantContext | null> {
    if (!rawToken || !rawToken.startsWith(TOKEN_PREFIX)) return null;
    const match = await this.deps.store.findByHash(sha256Hex(rawToken));
    if (!match) return null;
    await this.deps.store.touch(match.id);
    return { agencyId: match.agencyId };
  }

  async list(ctx: TenantContext): Promise<ApiKeySummary[]> {
    const rows = await this.deps.store.list(ctx.agencyId);
    return rows.map(toSummary);
  }

  async revoke(ctx: TenantContext, id: string): Promise<void> {
    const ok = await this.deps.store.revoke(ctx.agencyId, id);
    if (!ok) throw new NotFoundError("API key not found");
  }
}
