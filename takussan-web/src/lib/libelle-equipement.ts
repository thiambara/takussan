import type { TagStatus } from '@/types/tag';

/**
 * TCK-633 — le libellé d'un équipement dans la langue de l'écran.
 *
 * « Les équipements du catalogue sont traduits par leur slug ; un équipement saisi par un
 * annonceur s'affiche tel quel. » Le catalogue est versionné côté API (`TagCatalog::EQUIPEMENTS`),
 * ses traductions vivent sous `property.amenityCatalog.<slug>` — `libelle-equipement.test.ts`
 * rougit sur un équipement du catalogue sans ses trois traductions.
 *
 * Un équipement PROPOSÉ (`pending`) s'affiche tel que saisi même si son slug était connu : c'est
 * le texte de son auteur, pas un équipement du catalogue. Un slug sans traduction — un équipement
 * proposé puis approuvé — retombe sur le nom en base.
 *
 * L'espace de traduction à passer : `useTranslations(ESPACE_DU_CATALOGUE)`.
 */
export const ESPACE_DU_CATALOGUE = 'property.amenityCatalog';

/**
 * TCK-922 (P30.06) — les étiquettes CRM du catalogue (`TagCatalog::CRM`) se traduisent de même,
 * par la même fonction, sous cet espace-ci. Une étiquette saisie par l'agence porte un slug suffixé
 * (`CustomerTagController::store`) : elle n'a pas de clé, et s'affiche telle quelle.
 */
export const ESPACE_DES_ETIQUETTES_CRM = 'crm.tagCatalog';

export interface EquipementAffichable {
  readonly name: string;
  readonly slug?: string | null;
  readonly status?: TagStatus | null;
}

/** La part de `useTranslations()` dont on a besoin — un traducteur de test s'y conforme aussi. */
export interface TraducteurDuCatalogue {
  (cle: string): string;
  has(cle: string): boolean;
}

export function libelleEquipement(tag: EquipementAffichable, t: TraducteurDuCatalogue): string {
  if (!tag.slug || tag.status === 'pending' || tag.status === 'rejected') return tag.name;
  return t.has(tag.slug) ? t(tag.slug) : tag.name;
}

/**
 * Le slug que l'API donne à un nom du catalogue — `Str::slug()` de Laravel, que
 * `TagCatalog::slugLibre` emploie : translittération ASCII, ponctuation retirée (`24/7` → `247`,
 * `d'eau` → `deau`), espaces et tirets fondus en un tiret, minuscules.
 */
export function slugDuCatalogue(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/@/g, '-at-')
    .replace(/[^-\p{L}\p{N}\s]+/gu, '')
    .toLowerCase()
    .replace(/[-\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
