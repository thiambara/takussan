'use client';

import { useTranslations } from 'next-intl';

import { StatusBadge as ConsoleStatusBadge, type StatusTone } from '@/components/console';
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import { propertyStatusValues } from '@/lib/schemas/property';

/**
 * `statut du bien → ton du DS` — **l'unique table du produit pour ce vocabulaire** (TCK-472).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE REMPLACE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le statut d'un bien était colorié à **trois** endroits, par trois décisions différentes que
 * personne n'avait prises ensemble :
 *
 * | fichier | `available` | `sold` | `unavailable` |
 * |---|---|---|---|
 * | ce fichier, avant | `variant="default"` (terracotta plein) | `variant="secondary"` | ambre |
 * | `PropertyList.tsx:544`, avant | `bg-success/10` | `bg-success/**15**` | rouge |
 * | `admin/super/SuperAdminPropertiesTable.tsx` | ton `success` | ton `info` | ton `attention` |
 *
 * Trois lectures du même champ, trois couleurs — dont un `sold` vert *d'une autre façon* que
 * `available` (`/15` contre `/10`), écart que rien ne voulait et que personne ne pouvait voir : il
 * fallait ouvrir deux fichiers côte à côte.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE CRITÈRE D'ARBITRAGE — repris tel quel de `kyc/kyc-components.tsx`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   `attention` = une décision est attendue d'un opérateur.
 *   `info`      = c'est décidé, ça suit son cours, il n'y a rien à faire.
 *   `neutral`   = le bien existe, rien n'est attendu.
 *   `success`   = l'état que le produit cherche à atteindre.
 *   `danger`    = un refus, pas un simple empêchement.
 *
 * Deux valeurs changent de couleur par rapport à `PropertyList`, et sur le SENS, pas sur
 * l'ancienneté :
 *
 *  · **`sold` passe de vert à `info`.** Vendu n'est pas « disponible » : c'est un dénouement, il
 *    n'y a plus rien à faire. C'est déjà la lecture de `SuperAdminPropertiesTable`, et l'écart
 *    entre les deux écrans disparaît sans qu'aucun des deux n'ait à changer d'avis deux fois.
 *  · **`unavailable` passe de `danger` à `attention`.** Un bien indisponible n'est pas un refus —
 *    c'est un état qui appelle un geste. Le rouge le disait faux, et le disait sous AA (cf. le
 *    docblock de `TONE_CLASSES`).
 *
 * ⚠ La table est ouverte aux trois états de MODÉRATION (`published`, `pending_review`, `rejected`)
 * qui ne sont pas des valeurs de `propertyStatusValues` : l'API les sert quand même sur ce champ.
 * Un statut absent de la table retombe sur `neutral` — jamais sur une absence de pastille.
 */
export const PROPERTY_STATUS_TONE: Readonly<Record<string, StatusTone>> = {
  draft: 'neutral',
  archived: 'neutral',
  available: 'success',
  published: 'success',
  sold: 'info',
  rented: 'info',
  pending: 'attention',
  pending_review: 'attention',
  under_maintenance: 'attention',
  unavailable: 'attention',
  rejected: 'danger',
};

/**
 * Les statuts que `property.status` sait nommer : les valeurs de l'enum backend, plus les trois
 * états de modération qui n'en font pas partie.
 *
 * Ce Set garantit le repli d'origine (`?? status`) pour un statut inconnu. Sans lui, `t(status)`
 * rendrait le chemin de la clé au lieu de la valeur brute reçue de l'API.
 */
const STATUTS_NOMMES = new Set<string>([
  ...propertyStatusValues,
  'published',
  'pending_review',
  'rejected',
]);

interface Props {
  readonly status: string | null;
  readonly statusLabel?: string | null;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * La pastille de statut d'un bien — **la seule**, détail comme liste.
 *
 * ⚠ **Composant CLIENT depuis TCK-472, et c'en était un composant SERVEUR (`async` +
 * `getTranslations`).** La bascule n'est pas cosmétique : `PropertyList.tsx` est `'use client'`,
 * et un module qui importe `next-intl/server` ne peut pas être importé depuis un composant
 * client — c'est ce mur qui avait fait naître le second badge. Tant que ce fichier était serveur,
 * la liste ne POUVAIT pas s'en servir ; elle a donc recopié la décision.
 *
 * Le seul appelant serveur, `app/(dashboard)/app/properties/[id]/page.tsx`, ne passe que des props
 * sérialisables (`status`, `statusLabel`, `className`) : un composant client s'y rend sans rien
 * changer au site d'appel. Et `property` est déjà dans le dictionnaire client de la frontière
 * `(dashboard)/app` (`src/i18n/namespaces.json`), donc `useTranslations` y trouve ses clés — la
 * bascule n'ajoute pas un octet au provider.
 *
 * Elle ne décide AUCUNE couleur : elle traduit un statut en ton et délègue le rendu. C'est la
 * forme qu'impose `scripts/check-status-badge-unique.mjs`.
 */
export function PropertyStatusBadge({
  status,
  statusLabel,
  className,
  'data-testid': dataTestId,
}: Props) {
  const t = useTranslations(PROPERTY_ENUM_NAMESPACES.status);
  if (!status) return null;
  const label = statusLabel ?? (STATUTS_NOMMES.has(status) ? t(status) : status);
  return (
    <ConsoleStatusBadge
      label={label}
      tone={PROPERTY_STATUS_TONE[status] ?? 'neutral'}
      className={className}
      data-testid={dataTestId}
    />
  );
}
