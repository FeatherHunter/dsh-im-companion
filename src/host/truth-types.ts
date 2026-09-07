export interface SessionTruth { open: boolean; kind: string; approval: boolean; title: string; }

export const TRUTH_MAX_BYTES = 5 * 1024 * 1024;
export const TRUTH_MAX_FILES = 30;
export const TRUTH_BUDGET_MS = 250;
