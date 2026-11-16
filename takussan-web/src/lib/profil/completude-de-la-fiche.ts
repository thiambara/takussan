import { MAX_QUARTIERS } from '@/lib/annuaire-agent';

/**
 * TCK-2862 — la complétude de la fiche publique de l'agent : UNE seule fonction de calcul, lue par la
 * rangée du sommaire (« 60 % complète »), l'encart « Compléter votre fiche » et la jauge de la page
 * (maquette `JaugeFiche`). Cinq critères de 20 % chacun : la photo, la présentation, au moins une
 * langue, cinq quartiers, le téléphone vérifié. Un critère à moitié rempli ne compte pas : deux
 * quartiers sur cinq laissent le critère des quartiers manquant (« 3 quartiers »).
 */
export interface FaitsDeLaFiche {
  readonly photo: boolean;
  readonly presentation: boolean;
  readonly langues: number;
  readonly quartiers: number;
  readonly telephoneVerifie: boolean;
}

export type CritereManquant =
  | { readonly id: 'photo' }
  | { readonly id: 'presentation' }
  | { readonly id: 'langue' }
  | { readonly id: 'quartiers'; readonly restant: number }
  | { readonly id: 'telephone' };

export interface CompletudeDeLaFiche {
  /** 0, 20, 40, 60, 80 ou 100. */
  readonly pourcentage: number;
  /** Dans l'ordre où « Il vous reste » les nomme ; vide à 100 %. */
  readonly manquants: readonly CritereManquant[];
}

export const QUARTIERS_D_UNE_FICHE_COMPLETE = MAX_QUARTIERS;

const POIDS_D_UN_CRITERE = 20;

export function completudeDeLaFiche(faits: FaitsDeLaFiche): CompletudeDeLaFiche {
  const manquants: CritereManquant[] = [];
  const restant = Math.max(0, QUARTIERS_D_UNE_FICHE_COMPLETE - faits.quartiers);
  if (restant > 0) manquants.push({ id: 'quartiers', restant });
  if (!faits.telephoneVerifie) manquants.push({ id: 'telephone' });
  if (faits.langues === 0) manquants.push({ id: 'langue' });
  if (!faits.photo) manquants.push({ id: 'photo' });
  if (!faits.presentation) manquants.push({ id: 'presentation' });
  return { pourcentage: 100 - manquants.length * POIDS_D_UN_CRITERE, manquants };
}

/** Les faits du compte et de son profil d'agent, tels que l'API les rend (`/api/auth/me`, `/api/me/profiles`). */
export function faitsDeLaFiche(
  user: { readonly avatar_url?: string | null; readonly bio?: string | null; readonly phone?: string | null; readonly phone_verified_at?: string | null },
  agent: { readonly languages?: readonly unknown[]; readonly neighborhood_ids?: readonly unknown[] } | null,
): FaitsDeLaFiche {
  return {
    photo: Boolean(user.avatar_url),
    presentation: Boolean(user.bio?.trim()),
    langues: agent?.languages?.length ?? 0,
    quartiers: agent?.neighborhood_ids?.length ?? 0,
    telephoneVerifie: Boolean(user.phone && user.phone_verified_at),
  };
}

type Traduire = (cle: string, valeurs?: Record<string, string | number>) => string;

/**
 * « 3 quartiers et votre numéro vérifié » : les critères manquants, joints à la manière de la langue.
 * `t` est le traducteur de `profile.completude.manque`.
 */
export function ceQuIlReste(manquants: readonly CritereManquant[], t: Traduire, locale: string): string {
  const morceaux = manquants.map((m) => (m.id === 'quartiers' ? t('quartiers', { count: m.restant }) : t(m.id)));
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(morceaux);
}
