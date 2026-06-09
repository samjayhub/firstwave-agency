// In-memory ReportStore + a recording sender for offline tests.
import type {
  DigestTarget,
  ReportSender,
  ReportSnapshotRow,
  ReportStore,
} from "./types";

export class FakeReportStore implements ReportStore {
  constructor(
    public rowsByClient: Record<string, ReportSnapshotRow[]> = {},
    public targets: DigestTarget[] = [],
  ) {}

  async snapshotsForClient(
    _agencyId: string,
    clientId: string,
    _since: Date,
  ): Promise<ReportSnapshotRow[]> {
    return this.rowsByClient[clientId] ?? [];
  }

  async digestTargets(): Promise<DigestTarget[]> {
    return this.targets;
  }
}

export function recordingSender(): ReportSender & { sent: Array<{ to: string; subject: string; html: string }> } {
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const fn = (async (msg) => {
    sent.push(msg);
  }) as ReportSender & { sent: typeof sent };
  fn.sent = sent;
  return fn;
}
