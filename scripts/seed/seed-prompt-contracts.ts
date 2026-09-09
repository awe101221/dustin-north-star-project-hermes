import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export type SeedPromptContract = {
  prompt_id: string;
  version: string;
  role: string;
  schema_version: string;
  prompt_body: string;
  status: "draft" | "active" | "retired";
  description: string | null;
  metadata: unknown;
};

export type StoredPromptContract = SeedPromptContract & {
  content_sha256: string | null;
};

export function assertExactPromptContract(existing: StoredPromptContract, expected: SeedPromptContract) {
  const expectedHash = createHash("sha256").update(expected.prompt_body).digest("hex");
  const exactTuple =
    existing.prompt_id === expected.prompt_id
    && existing.version === expected.version
    && existing.role === expected.role
    && existing.schema_version === expected.schema_version
    && existing.prompt_body === expected.prompt_body
    && existing.content_sha256 === expectedHash
    && existing.status === expected.status
    && existing.description === expected.description
    && isDeepStrictEqual(existing.metadata, expected.metadata);

  if (!exactTuple) {
    throw new Error(
      `Existing prompt version does not match expected immutable contract: ${expected.prompt_id}@${expected.version}`,
    );
  }
}
