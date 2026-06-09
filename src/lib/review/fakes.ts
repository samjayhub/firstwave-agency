// In-memory ReviewStore for offline tests. Mirrors the Prisma store's tenant
// scoping (shares via the owning client; reviewer ops keyed by clientId).
import type { ItemStatus } from "@/lib/approval/state-machine";
import type {
  ResolvedShare,
  ReviewComment,
  ReviewQueueItem,
  ReviewShareRecord,
  ReviewStore,
} from "./types";

interface SeedClient {
  clientId: string;
  agencyId: string;
  clientName: string;
}
interface SeedItem {
  id: string;
  clientId: string;
  status: ItemStatus;
  scheduledAt: Date | null;
  copy: unknown;
}

export class FakeReviewStore implements ReviewStore {
  shares: ReviewShareRecord[] = [];
  comments: Array<ReviewComment & { itemId: string }> = [];
  private seq = 0;

  constructor(
    public clients: SeedClient[] = [],
    public items: SeedItem[] = [],
  ) {}

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  async createShare(agencyId: string, clientId: string, token: string) {
    const owned = this.clients.find((c) => c.clientId === clientId && c.agencyId === agencyId);
    if (!owned) return null;
    const share: ReviewShareRecord = {
      id: this.id("share"),
      clientId,
      token,
      revoked: false,
      createdAt: new Date("2026-06-09T00:00:00Z"),
    };
    this.shares.push(share);
    return share;
  }

  async listShares(agencyId: string, clientId: string) {
    const owned = this.clients.some((c) => c.clientId === clientId && c.agencyId === agencyId);
    if (!owned) return [];
    return this.shares.filter((s) => s.clientId === clientId);
  }

  async revokeShare(agencyId: string, shareId: string) {
    const share = this.shares.find((s) => s.id === shareId);
    if (!share) return false;
    const owned = this.clients.some(
      (c) => c.clientId === share.clientId && c.agencyId === agencyId,
    );
    if (!owned || share.revoked) return false;
    share.revoked = true;
    return true;
  }

  async resolveShare(token: string): Promise<ResolvedShare | null> {
    const share = this.shares.find((s) => s.token === token && !s.revoked);
    if (!share) return null;
    const client = this.clients.find((c) => c.clientId === share.clientId);
    if (!client) return null;
    return { clientId: client.clientId, agencyId: client.agencyId, clientName: client.clientName };
  }

  async queueForClient(clientId: string): Promise<ReviewQueueItem[]> {
    return this.items
      .filter((i) => i.clientId === clientId && i.status === "in_review")
      .map((i) => this.toQueueItem(i));
  }

  async getItem(clientId: string, itemId: string): Promise<ReviewQueueItem | null> {
    const item = this.items.find((i) => i.id === itemId && i.clientId === clientId);
    return item ? this.toQueueItem(item) : null;
  }

  async transition(clientId: string, itemId: string, from: ItemStatus, to: ItemStatus) {
    const item = this.items.find(
      (i) => i.id === itemId && i.clientId === clientId && i.status === from,
    );
    if (!item) return false;
    item.status = to;
    return true;
  }

  async addComment(clientId: string, itemId: string, body: string, author: string) {
    const item = this.items.find((i) => i.id === itemId && i.clientId === clientId);
    if (!item) return null;
    const comment: ReviewComment = {
      id: this.id("comment"),
      body,
      author,
      createdAt: new Date("2026-06-09T00:00:00Z"),
    };
    this.comments.push({ ...comment, itemId });
    return comment;
  }

  private toQueueItem(i: SeedItem): ReviewQueueItem {
    return {
      id: i.id,
      status: i.status,
      scheduledAt: i.scheduledAt,
      copy: i.copy,
      comments: this.comments.filter((c) => c.itemId === i.id).map(({ itemId: _itemId, ...c }) => c),
    };
  }
}
