import { DEFAULT_DEADLINE_POLICY, type DeadlinePolicy } from "../deadlines";

/** Production deadline policy; test harness may override via tsconfig.api.json path mapping. */
export const getDeadlinePolicy = (): Readonly<DeadlinePolicy> => DEFAULT_DEADLINE_POLICY;
