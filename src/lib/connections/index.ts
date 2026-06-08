// Connected-account service: builds the OAuth authorize URL and completes the
// callback by exchanging the code and storing ENCRYPTED tokens. Tokens are never
// returned to the caller or logged.
import type { TenantContext } from "@/lib/db/tenancy";
import type { Platform, Publisher } from "@/lib/publishers/types";
import { encryptToken } from "@/lib/crypto/tokens";

export interface ConnectedAccountRecord {
  id: string;
  clientId: string;
  platform: Platform;
  externalId: string;
  handle: string | null;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: Date | null;
}

export interface NewConnectedAccount {
  clientId: string;
  platform: Platform;
  externalId: string;
  handle?: string;
  accessTokenEnc: string;
  refreshTokenEnc?: string;
  expiresAt?: Date;
}

export interface ConnectedAccountSummary {
  id: string;
  platform: Platform;
  handle: string | null;
  externalId: string;
}

export interface ConnectedAccountRepository {
  /** Scoped create — verifies the client belongs to the agency. */
  create(agencyId: string, input: NewConnectedAccount): Promise<{ id: string }>;
  getForAgency(agencyId: string, accountId: string): Promise<ConnectedAccountRecord | null>;
  listForClient(agencyId: string, clientId: string): Promise<ConnectedAccountSummary[]>;
}

export interface ConnectionServiceDeps {
  accounts: ConnectedAccountRepository;
  resolvePublisher: (platform: Platform) => Publisher;
  encrypt?: (s: string) => string;
}

export class ConnectionService {
  private readonly encrypt: (s: string) => string;
  constructor(private readonly deps: ConnectionServiceDeps) {
    this.encrypt = deps.encrypt ?? encryptToken;
  }

  authorizeUrl(platform: Platform, redirectUri: string, state: string): string {
    return this.deps.resolvePublisher(platform).authorizeUrl({ redirectUri, state });
  }

  async completeConnection(
    ctx: TenantContext,
    platform: Platform,
    clientId: string,
    code: string,
    redirectUri: string,
  ): Promise<{ accountId: string }> {
    const conn = await this.deps.resolvePublisher(platform).exchangeCode(code, redirectUri);
    const { id } = await this.deps.accounts.create(ctx.agencyId, {
      clientId,
      platform,
      externalId: conn.externalId,
      ...(conn.handle ? { handle: conn.handle } : {}),
      accessTokenEnc: this.encrypt(conn.accessToken),
      ...(conn.refreshToken ? { refreshTokenEnc: this.encrypt(conn.refreshToken) } : {}),
      ...(conn.expiresAt ? { expiresAt: conn.expiresAt } : {}),
    });
    return { accountId: id };
  }
}
