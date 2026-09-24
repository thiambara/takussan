import type { AgencyUpgradeRequestFormFields } from '@/types/agency-upgrade';

/**
 * TCK-566 — le brouillon du formulaire « Passer en agence professionnelle »
 * (`agency-upgrade-{agency_id}`), lu dans la forme EXACTE du formulaire.
 *
 * Module pur, sans `'use client'` : le formulaire (`UpgradeRequestForm`) et la
 * table de reprise du tableau de bord (`lib/wizard-drafts.ts`, importée aussi
 * par un route handler) jugent le MÊME « vide ».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL FAUT RELIRE, ET NON FUSIONNER
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le serveur ne rend pas ce que le client a envoyé : le middleware global
 * `ConvertEmptyStringsToNull` de l'API enregistre chaque `''` en `null`
 * (mesuré : PUT `{ rc: '' … }` sur `/api/me/wizard-drafts/agency-upgrade-1`,
 * puis GET → `{ rc: null … }`). Un brouillon réhydraté par simple fusion
 * (`{ ...EMPTY_FORM, ...draft.data }`) gardait donc ses `null` et ne valait plus
 * jamais le formulaire vide :
 *
 * - le brouillon VIDE que l'ancien autosave écrivait à la seule ouverture — la
 *   carte « Reprenez là où vous vous étiez arrêté — Passage en pro » du testeur
 *   du 2026-09-23 — était RÉÉCRIT à chaque ouverture au lieu d'être supprimé ;
 * - un brouillon réel repris, puis entièrement effacé, n'était plus supprimé.
 */

export const FORMULAIRE_UPGRADE_VIERGE: AgencyUpgradeRequestFormFields = {
  rc: '',
  ninea: '',
  rib_pro: '',
  company_legal_name: '',
  address_fiscale: '',
  planned_agents_count: null,
};

const CHAMPS_TEXTE = ['rc', 'ninea', 'rib_pro', 'company_legal_name', 'address_fiscale'] as const;

/**
 * Ne garde que les clés du formulaire, chacune dans son type : une chaîne pour
 * les champs texte, un nombre fini ou `null` pour le nombre d'agents. Tout le
 * reste (`null`, clé disparue du formulaire, type inattendu) redevient la valeur
 * vierge.
 */
export function formulaireUpgradeDepuisBrouillon(donnees: unknown): AgencyUpgradeRequestFormFields {
  if (donnees === null || typeof donnees !== 'object' || Array.isArray(donnees)) {
    return FORMULAIRE_UPGRADE_VIERGE;
  }
  const brut = donnees as Record<string, unknown>;
  const texte = Object.fromEntries(
    CHAMPS_TEXTE.map((cle) => [cle, typeof brut[cle] === 'string' ? brut[cle] : '']),
  ) as Pick<AgencyUpgradeRequestFormFields, (typeof CHAMPS_TEXTE)[number]>;
  const agents = brut.planned_agents_count;

  return {
    ...texte,
    planned_agents_count: typeof agents === 'number' && Number.isFinite(agents) ? agents : null,
  };
}

/**
 * Un brouillon d'upgrade qui, relu, ne contient AUCUNE saisie. Ce n'est pas une
 * démarche : le tableau de bord ne le propose pas à la reprise, et le formulaire
 * le supprime à l'ouverture.
 */
export function brouillonUpgradeEstVierge(donnees: unknown): boolean {
  const formulaire = formulaireUpgradeDepuisBrouillon(donnees);
  return (
    CHAMPS_TEXTE.every((cle) => formulaire[cle] === '') && formulaire.planned_agents_count === null
  );
}
