import { randomUUID } from "node:crypto";
import type { Artifact } from "../docs/office-contracts.js";

// In-memory artifact store. Phase 0 has no DB — Phase 1 swaps this for Postgres/Prisma.
const artifacts = new Map<string, Artifact>();

export const saveArtifact = <T extends Artifact>(artifact: Omit<T, "id">): T => {
  const withId = { ...artifact, id: randomUUID() } as T;
  artifacts.set(withId.id, withId);
  return withId;
};

export const getArtifact = <T extends Artifact>(id: string): T => {
  const artifact = artifacts.get(id);
  if (!artifact) throw new Error(`No artifact found for id "${id}"`);
  return artifact as T;
};
