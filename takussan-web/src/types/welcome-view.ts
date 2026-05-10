/**
 * TCK-251 — Welcome modale tracking shapes.
 *
 * `key` is an opaque short identifier owned by each consumer modale
 * (e.g. `customer-welcome`, `host-welcome`, `tenant-welcome`).
 */

export type WelcomeSeenListResponse = {
  data: string[];
};

export type WelcomeView = {
  id: number;
  user_id: number;
  key: string;
  seen_at: string;
};

export type WelcomeSeenStoreResponse = {
  data: WelcomeView;
};
