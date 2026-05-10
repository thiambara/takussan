import { apiRequest } from './api';
import type {
  WizardDraft,
  WizardDraftListResponse,
  WizardDraftResponse,
} from '@/types/wizard-draft';

/**
 * TCK-250 — Server-side helpers around `/api/me/wizard-drafts/*`.
 *
 * These are used by the SSR proxy routes under `/api/me/wizard-drafts/...`
 * which forward the auth cookie. Client components MUST go through those
 * proxies (via `useWizardDraft`) — never call the Laravel backend directly.
 */

export async function fetchMyWizardDrafts(token: string): Promise<WizardDraftListResponse> {
  return apiRequest<WizardDraftListResponse>('/api/me/wizard-drafts', { token });
}

export async function fetchWizardDraft<TData = Record<string, unknown>>(
  token: string,
  key: string,
): Promise<WizardDraftResponse<TData> | null> {
  try {
    return await apiRequest<WizardDraftResponse<TData>>(
      `/api/me/wizard-drafts/${encodeURIComponent(key)}`,
      { token },
    );
  } catch (err) {
    // 404 = no draft yet — semantically a "fresh start", not an error.
    if (err instanceof Error && 'status' in err && (err as { status: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

export async function upsertWizardDraft<TData = Record<string, unknown>>(
  token: string,
  key: string,
  payload: { step: number; data: TData },
): Promise<WizardDraftResponse<TData>> {
  return apiRequest<WizardDraftResponse<TData>>(
    `/api/me/wizard-drafts/${encodeURIComponent(key)}`,
    { method: 'PUT', token, body: payload },
  );
}

export async function deleteWizardDraft(token: string, key: string): Promise<void> {
  await apiRequest<void>(`/api/me/wizard-drafts/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * Shape used by the dashboard banner — projects each draft to a UX-ready
 * row with a deep-link. The `resumeHref` is computed from the key by the
 * caller (see `WIZARD_RESUME_HREFS` below).
 */
export type WizardDraftBannerEntry = {
  key: string;
  step: number;
  updatedAt: string | null;
  resumeHref: string | null;
  /** i18n key under `wizardDrafts.bannerTitles.{key}` if known; else null. */
  i18nKey: string | null;
};

/**
 * TCK-250 — Maps logical wizard keys to their resume URL. New wizards
 * register here so the dashboard banner can offer a deep-link without
 * each consumer having to wire its own banner.
 *
 * Conventions:
 * - The exact `key` (e.g. `host-individual-wizard`) wins when present.
 * - A prefix entry like `owner-onboarding-` matches `owner-onboarding-{id}`
 *   and the matching function builds the URL from the trailing segment.
 */
type WizardResumeRule =
  | { kind: 'exact'; key: string; href: string; i18nKey: string }
  | { kind: 'prefix'; prefix: string; build: (suffix: string) => string; i18nKey: string };

const WIZARD_RESUME_RULES: WizardResumeRule[] = [
  {
    kind: 'exact',
    key: 'host-individual-wizard',
    // TCK-255 — the wizard now lives at `/onboarding/host`. Resuming
    // brings the user back to step+data exactly as left.
    href: '/onboarding/host',
    i18nKey: 'host-individual-wizard',
  },
  {
    kind: 'exact',
    key: 'customer-onboarding',
    href: '/app/profile/customer/onboarding',
    i18nKey: 'customer-onboarding',
  },
  {
    kind: 'exact',
    key: 'owner-kyc',
    href: '/app/profile/owner/kyc',
    i18nKey: 'owner-kyc',
  },
  {
    kind: 'exact',
    key: 'agent-kyc',
    href: '/app/profile/agent/kyc',
    i18nKey: 'agent-kyc',
  },
  {
    kind: 'prefix',
    prefix: 'owner-onboarding-',
    build: (suffix) => `/app/profile/owner/onboarding?invitation=${encodeURIComponent(suffix)}`,
    i18nKey: 'owner-onboarding',
  },
  {
    kind: 'prefix',
    prefix: 'agent-onboarding-',
    build: (suffix) => `/app/profile/agent/onboarding?invitation=${encodeURIComponent(suffix)}`,
    i18nKey: 'agent-onboarding',
  },
];

export function resolveWizardResume(key: string): { href: string | null; i18nKey: string | null } {
  for (const rule of WIZARD_RESUME_RULES) {
    if (rule.kind === 'exact' && key === rule.key) {
      return { href: rule.href, i18nKey: rule.i18nKey };
    }
    if (rule.kind === 'prefix' && key.startsWith(rule.prefix)) {
      const suffix = key.slice(rule.prefix.length);
      return { href: rule.build(suffix), i18nKey: rule.i18nKey };
    }
  }
  return { href: null, i18nKey: null };
}

export function projectDraftForBanner(draft: WizardDraft): WizardDraftBannerEntry {
  const { href, i18nKey } = resolveWizardResume(draft.key);
  return {
    key: draft.key,
    step: draft.step,
    updatedAt: draft.updated_at,
    resumeHref: href,
    i18nKey,
  };
}
