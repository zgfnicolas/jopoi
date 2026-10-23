import { createHash } from "node:crypto";
import { canonicalJson } from "../../domain/canonical-json";
import { createConfigReader, type Environment } from "../config/environment";

export interface HcsTarget {
  readonly network: "testnet";
  readonly operatorId: string;
  readonly topicId: string;
  readonly generation: string;
}

/** CPU only: missing signing credentials never block a valid SQL command. */
export function configuredTarget(environment: Environment): HcsTarget | null {
  const result = createConfigReader(environment).hederaTarget();
  if (result.status !== "configured") return null;
  const { network, operatorId, topicId, generationLabel } = result.config;
  const generation = createHash("sha256").update(canonicalJson({
    version: 1, network, operatorId, topicId, generationLabel,
  }), "utf8").digest("hex");
  return { network, operatorId, topicId, generation };
}
