/**
 * TCK-250 — Wizard draft envelope returned by the backend.
 *
 * `data` is intentionally generic — each consumer wizard provides its own
 * shape. Treat it as opaque at the framework level; cast or validate
 * inside the consumer.
 */
export type WizardDraft<TData = Record<string, unknown>> = {
  id: number;
  key: string;
  step: number;
  data: TData | null;
  updated_at: string | null;
};

export type WizardDraftListResponse = {
  data: WizardDraft[];
};

export type WizardDraftResponse<TData = Record<string, unknown>> = {
  data: WizardDraft<TData>;
};
