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
  //
  // ────────────────────────────────────────────────────────────────────────────────────────────
  // TCK-444 — L'ENCRE N'EST PLUS LA COULEUR DE SON PROPRE APLAT
  // ────────────────────────────────────────────────────────────────────────────────────────────
  //
  // La recette était `bg-chart-N/20 text-chart-N` : du texte posé sur un aplat à 20 % de SA PROPRE
  // couleur. **12 couples sur 20** (5 types × 2 thèmes × 2 surfaces) tombaient sous le seuil AA de
  // 4,5:1 — jusqu'à 2,17:1 pour `agent` en thème clair.
  //
  // ⚠ **Ce n'était pas une ligne de la table, c'était le MOTIF**, et la démonstration tient en une
  // ligne : l'aplat vit ENTRE la surface et `--chart-N`, donc le contraste de `text-chart-N`
  // dessus est *borné par* celui de `--chart-N` sur la surface nue. Or `--chart-3` y rend 3,55:1
  // (sa valeur corrigée par TCK-404, pour le seuil de 3:1 des objets graphiques). **Aucune valeur
  // d'alpha ne peut donc sauver `agent` :** corriger la seule ligne fautive aurait corrigé un
  // cinquième du défaut et laissé le mécanisme intact.
  //
  // La recette retenue garde l'aplat — c'est lui qui porte la CATÉGORIE, acquis de TCK-381 — et
  // change l'encre pour `--foreground`, qui s'inverse avec le thème. Mesuré (composition alpha en
  // espace gamma, puis WCAG 2.x) ; le pire des 20 couples vaut **8,10:1**, contre 2,17:1 avant :
  //
  //                       clair --card   clair --bg   sombre --card   sombre --bg
  //     agency_admin         13,32         12,71          11,27          12,45
  //     owner                13,40         12,79          11,45          12,75
  //     agent                14,16         13,54           9,85          10,88
  //     broker               13,32         12,74          10,24          11,41
  //     service_provider     11,50         10,97           8,10           8,99
  //
  // ⚠ Ces chiffres sont ceux de la GARDE, qui arrondit l'aplat composé à l'entier comme le fait
  // le navigateur. Le harnais de test (`src/test/couples-de-contraste.ts`) ne l'arrondit pas et
  // rend jusqu'à 0,03 de plus. Les deux sont justes sous leur convention ; ne pas « corriger »
  // l'un vers l'autre — c'est la même remarque que TCK-458 fait sur 4,20 contre 4,22.
  //
  // Gardé par `scripts/check-profile-badge-contrast.mjs`, qui relit CETTE table et `globals.css` :
  // remettre un seul type sur `text-chart-N` fait rougir la CI en nommant le type, le thème et la
  // surface. `check-chart-contrast.mjs` ne le voyait pas, et le disait — elle mesure le jeton NU
  // au seuil de 3:1, ce qui est son périmètre annoncé, pas un défaut.
  agency_admin: 'bg-chart-1/20 text-foreground',
  owner: 'bg-chart-2/20 text-foreground',
  agent: 'bg-chart-3/20 text-foreground',
  broker: 'bg-chart-4/20 text-foreground',
  service_provider: 'bg-chart-5/20 text-foreground',
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
