import { describe, it, expect, vi } from "vitest";
import { runMediaRetentionJob } from "./media-retention-job";

describe("runMediaRetentionJob", () => {
  it("delegates to the library's system-wide sweep with the configured windows", async () => {
    const media = {
      runRetentionSweep: vi.fn().mockResolvedValue({
        clients: 3,
        archived: 5,
        purged: 2,
        blobsDeleted: 1,
      }),
    };
    const result = await runMediaRetentionJob(
      // Only runRetentionSweep is exercised by the handler.
      { media: media as never, retentionDays: 90, purgeDays: 30 },
      { trigger: "cron" },
    );
    expect(media.runRetentionSweep).toHaveBeenCalledWith(90, 30);
    expect(result).toMatchObject({ archived: 5, purged: 2 });
  });
});
