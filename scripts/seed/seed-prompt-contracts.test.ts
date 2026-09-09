import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertExactPromptContract, type StoredPromptContract } from "./seed-prompt-contracts";

const prompt = {
  prompt_id: "company-underwrite",
  version: "1.0.0",
  role: "Company analyst",
  schema_version: "company-model-v1",
  prompt_body: "Expected prompt body.",
  status: "active",
  description: "Expected description.",
  metadata: { source: "north-star-seed", nested: { enabled: true, count: 2 } },
} as const;

const stored: StoredPromptContract = {
  ...prompt,
  content_sha256: createHash("sha256").update(prompt.prompt_body).digest("hex"),
};

describe("underwriting seed prompt contracts", () => {
  it("accepts an exact complete immutable tuple with semantically equal JSON metadata", () => {
    const metadataWithDifferentKeyOrder = {
      nested: { count: 2, enabled: true },
      source: "north-star-seed",
    };

    expect(() => assertExactPromptContract({ ...stored, metadata: metadataWithDifferentKeyOrder }, prompt)).not.toThrow();
  });

  it.each([
    ["role", { role: "Unexpected analyst" }],
    ["schema_version", { schema_version: "unexpected-schema-v9" }],
    ["status", { status: "retired" }],
    ["description", { description: "Unexpected description." }],
    ["metadata", { metadata: { source: "unexpected-seed" } }],
    ["prompt_body", { prompt_body: "Unexpected prompt body." }],
    ["content_sha256", { content_sha256: "0".repeat(64) }],
  ] as const)("fails closed when stored immutable %s differs", (_field, mutation) => {
    expect(() => assertExactPromptContract({ ...stored, ...mutation }, prompt)).toThrow(
      "Existing prompt version does not match expected immutable contract: company-underwrite@1.0.0",
    );
  });
});
