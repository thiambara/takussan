'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Profile, ProfileType } from '@/types/profile';

/** Traducteur du sous-arbre `profile.types`, tel que le rend `useTranslations`. */
export type TraducteurTypeProfil = (cle: string) => string;

/**
 * Les deux tables ci-dessous (`TYPE_LABEL_KEY`, `TYPE_COLOR`) sont des
 * `Record<ProfileType, …>` COMPLETS, et c'est délibéré : ajouter un type à
 * `PROFILE_TYPES` casse la compilation ici tant qu'il n'a ni clé ni couleur
 * (TCK-329, AC5).
 *
 * ⚠ `agency_admin` a manqué à ces deux tables sans que `tsc` ne dise rien —
 * non pas parce que l'exhaustivité était mal vérifiée, mais parce que l'union
 * elle-même était incomplète. La garde de compilation ne vaut donc que
 * couplée au test de parité (`src/types/__tests__/profile-types.parity.test.ts`).
 */

/**
 * Record COMPLET de ProfileType → CLÉ du dictionnaire (`profile.types.*`).
 *
 * L'exhaustivité est la garde de compilation de TCK-329 AC5 : ajouter un type à
 * `PROFILE_TYPES` sans lui donner de clé ici casse `tsc --noEmit`. Ce que TCK-292
 * change, c'est UNIQUEMENT d'où vient le texte — les cinq libellés étaient codés
 * en dur en français (dette D-24), ils vivent désormais dans les trois
 * dictionnaires. Les libellés rendus sont identiques au caractère près.
 *
 * ⚠ « Administrateur » reste le mot retenu pour `agency_admin`, et le choix
 * reste SOURCÉ : c'est celui du dictionnaire pour cette valeur de fil.
 */
const TYPE_LABEL_KEY: Record<ProfileType, string> = {
  agency_admin: 'agency_admin',
  owner: 'owner',
  agent: 'agent',
  broker: 'broker',
  service_provider: 'service_provider',
};

const TYPE_COLOR: Record<ProfileType, string> = {
  // ⚠ TCK-381 — les JETONS DE SÉRIE, pas les jetons d'état, et le test de ce fichier a tranché.
  //
  // La substitution mécanique avait envoyé ces cinq types sur succès / avertissement / danger /
  // information — ce qui donnait la même couleur à `agent` et `broker` (deux fois `--info`) et
  // faisait dire « erreur » au badge d'un administrateur d'agence. `ProfileBadge.test.tsx` exige
  // une couleur DISTINCTE par type déclaré : il a rougi sur les cinq, et il avait raison.
  //
  // Un type de profil n'est pas un état : c'est une CATÉGORIE, et le DS publie exactement cela
  // depuis TCK-129 — `--chart-1..5`, cinq teintes de la famille Lin, distinguables et sans
  // sémantique de gravité.
  agency_admin: 'bg-chart-1/20 text-chart-1',
  owner: 'bg-chart-2/20 text-chart-2',
  agent: 'bg-chart-3/20 text-chart-3',
  broker: 'bg-chart-4/20 text-chart-4',
  service_provider: 'bg-chart-5/20 text-chart-5',
};

/**
 * Repli de dernier recours — la troisième garde, celle qui tient en PRODUCTION.
 *
 * `profile.type` est typé `ProfileType`, mais ce typage décrit un espoir sur des
 * octets reçus du réseau : rien à l'exécution n'empêche le back d'émettre un
 * alias que ce fichier ne connaît pas. Le pire cas doit alors rester lisible et
 * diagnosticable (le jeton brut, ex. `notaire`) plutôt que de devenir la chaîne
 * `undefined` interpolée dans un gabarit — c'est exactement ce qui a été affiché
 * aux admins d'agence, et personne ne pouvait en déduire la cause.
 */
const FALLBACK_COLOR = 'bg-muted text-foreground';

export function profileTypeLabel(type: ProfileType, t: TraducteurTypeProfil): string {
  const cle = TYPE_LABEL_KEY[type];
  return cle ? t(cle) : String(type);
}

function profileTypeColor(type: ProfileType): string {
  return TYPE_COLOR[type] ?? FALLBACK_COLOR;
}

export function profileShortLabel(profile: Profile, t: TraducteurTypeProfil): string {
  // La garde portait sur `profile.agency?.name` et JAMAIS sur le libellé : c'est
  // la ligne qui produisait « undefined · Agence Teranga ».
  const type = profileTypeLabel(profile.type, t);
  if (profile.agency?.name) return `${type} · ${profile.agency.name}`;
  return type;
}

interface ProfileBadgeProps {
  profile: Profile;
  variant?: 'pill' | 'dot';
  className?: string;
}

export function ProfileBadge({ profile, variant = 'pill', className }: ProfileBadgeProps) {
  const t = useTranslations('profile.types');
  if (variant === 'dot') {
    return (
      <span
        aria-hidden="true"
        className={cn('inline-block size-2 rounded-full', profileTypeColor(profile.type), className)}
      />
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        profileTypeColor(profile.type),
        className,
      )}
    >
      {profileTypeLabel(profile.type, t)}
    </span>
  );
}
