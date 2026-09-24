import { apiRequest } from './api';
import { brouillonUpgradeEstVierge } from './agency-upgrade-brouillon';
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
/**
 * `estVierge` (TCK-566, facultatif) : dit si un brouillon de cette règle, relu,
 * ne contient AUCUNE saisie — auquel cas ce n'est pas une démarche à reprendre.
 * Seul un parcours dont l'état vierge ne dépend pas de l'utilisateur peut le
 * fournir : l'état vierge des assistants d'onboarding porte des champs
 * pré-remplis depuis le compte, que cette table ne connaît pas.
 */
type WizardResumeRule =
  | {
      kind: 'exact';
      key: string;
      href: string;
      i18nKey: string;
      estVierge?: (draft: WizardDraft) => boolean;
    }
  | {
      kind: 'prefix';
      prefix: string;
      build: (suffix: string) => string;
      i18nKey: string;
      estVierge?: (draft: WizardDraft) => boolean;
    };

const WIZARD_RESUME_RULES: WizardResumeRule[] = [
  {
    kind: 'exact',
    key: 'host-individual-wizard',
    // TCK-255 — the wizard now lives at `/onboarding/host`. Resuming
    // brings the user back to step+data exactly as left.
    href: '/onboarding/host',
    i18nKey: 'host-individual-wizard',
  },
  // TCK-419 — trois règles ont été RETIRÉES ici : `customer-onboarding`
  // (`/app/profile/customer/onboarding`), `owner-kyc` (`/app/profile/owner/kyc`) et `agent-kyc`
  // (`/app/profile/agent/kyc`). Aucune des trois routes n'existe sous `app/(dashboard)/app`, et
  // aucun code du dépôt n'écrit ces trois clés : les seuls `storageKey` réellement persistés sont
  // `host-individual-wizard`, `owner-onboarding-{id}`, `agent-onboarding-{id}`,
  // `sp-onboarding-{id}` et `agency-upgrade-{id}` — tous couverts par les règles ci-dessous. Ces
  // trois entrées enregistraient donc un lien de reprise vers un 404, pour un brouillon que rien
  // ne peut créer. *Une table de correspondance dont on n'exerce jamais une branche ne signale
  // pas son erreur : elle l'attend.* Les libellés `wizardDrafts.bannerTitles.{customer-onboarding,
  // owner-kyc,agent-kyc}` des trois dictionnaires sont laissés en place — ils ne coûtent rien et
  // `src/messages/` est tenu par un autre lot.
  {
    // TCK-257 — `owner-onboarding-{owner_profile_id}`. Resuming brings
    // the owner back to the dedicated wizard page mounted at
    // `/onboarding/owner` (mirror of the SP wizard path).
    kind: 'prefix',
    prefix: 'owner-onboarding-',
    build: (suffix) => `/onboarding/owner?owner=${encodeURIComponent(suffix)}`,
    i18nKey: 'owner-onboarding',
  },
  {
    // TCK-259 — `agent-onboarding-{agent_profile_id}`. Resuming brings
    // the agent back to the dedicated wizard page mounted at
    // `/onboarding/agent` (mirror of the Owner / SP wizard paths).
    kind: 'prefix',
    prefix: 'agent-onboarding-',
    build: (suffix) => `/onboarding/agent?agent=${encodeURIComponent(suffix)}`,
    i18nKey: 'agent-onboarding',
  },
  {
    // TCK-261 — `sp-onboarding-{sp_profile_id}`. Resuming brings the SP
    // back to the dedicated wizard page.
    kind: 'prefix',
    prefix: 'sp-onboarding-',
    build: (suffix) => `/onboarding/service-provider?sp=${encodeURIComponent(suffix)}`,
    i18nKey: 'sp-onboarding',
  },
  {
    // TCK-267 — `agency-upgrade-{agency_id}`. Resuming brings the
    // agency_admin back to the upgrade form so a half-typed RC / NINEA /
    // RIB pro is not lost between sessions. The uploaded statuts file
    // is intentionally NOT persisted in the draft (binary blobs don't
    // belong in the wizard-drafts table — the user re-attaches it).
    kind: 'prefix',
    prefix: 'agency-upgrade-',
    build: (suffix) => `/app/settings/agency/upgrade?agency=${encodeURIComponent(suffix)}`,
    i18nKey: 'agency-upgrade',
    // TCK-566 — retour testeur du 2026-09-23 : « J'ai seulement cliqué sur la
    // notification (passer en pro) ; je n'ai pas renseigné une seule ligne et on
    // me dit "reprendre là où j'en étais". » L'ancien autosave écrivait le
    // formulaire VIDE à la seule ouverture ; ces brouillons existent encore en
    // base (champs à `null`), et le formulaire ne les supprime qu'à sa prochaine
    // ouverture. Le tableau de bord ne les propose donc plus d'ici là.
    estVierge: (draft) => brouillonUpgradeEstVierge(draft.data),
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

/**
 * TCK-566 — un brouillon est-il une démarche à proposer à la reprise ? Faux pour
 * un brouillon qu'aucune règle ne sait reprendre, et pour un brouillon que sa
 * règle juge vierge (aucune saisie).
 */
export function estDemarcheAReprendre(draft: WizardDraft): boolean {
  const regle = WIZARD_RESUME_RULES.find((rule) =>
    rule.kind === 'exact' ? draft.key === rule.key : draft.key.startsWith(rule.prefix),
  );
  if (!regle) return false;
  return !(regle.estVierge?.(draft) ?? false);
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
