// Copy Engine — LLM writes captions/hooks/hashtags/descriptions in the
// extracted brand voice, per platform. See docs/02 §3 (module 7). Phase 0: stub.

export interface CopyInput {
  contentItemId: string;
  platform: string;
  // brand voice + plan context loaded inside.
}

export async function writeCopy(_input: CopyInput): Promise<unknown> {
  // TODO(phase-1): generate platform-specific copy grounded in BrandProfile.voice.
  throw new Error("not implemented");
}
