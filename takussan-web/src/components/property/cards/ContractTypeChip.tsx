import { useTranslations } from 'next-intl';

import type { ContractType } from '@/types/property';

interface ContractTypeChipProps {
  readonly type: ContractType;
  readonly compact?: boolean;
  readonly className?: string;
}

/**
 * Pastille « En vente / En location » unifiée — TCK-129.
 * Une seule source de vérité visuelle utilisée par toutes les variantes
 * de carte pour garantir cohérence couleur + typo + radius.
 *
 * ⚠ **`bg-foreground/85` n'est PAS un voile, et ne doit pas devenir `bg-scrim/85`.**
 * La liste de conversion de TCK-440 comptait six sites ; la dérivation faite à l'intégration
 * (2026-08-28) en a rendu dix, et le tri a retiré celui-ci. Un voile assombrit un média et reste
 * sombre dans les deux thèmes ; cette pastille est une SURFACE qui s'inverse avec son texte —
 * `bg-foreground/85 text-background` forme une paire, et la paire est ce qui la rend lisible :
 *
 *     clair  : fond #1f1812 à 85 %  ·  texte #fcf9f3   → lisible
 *     sombre : fond #fcf9f3 à 85 %  ·  texte #1f1812   → lisible
 *
 * `--scrim` ne s'inverse pas (déclaré une seule fois, jamais sous `.dark`). La convertir donnerait
 * en thème sombre un fond noir sous un texte #1f1812 — **illisible**. *Une liste de sites énumérée
 * à la main range ensemble ce qui se ressemble à l'œil, pas ce qui se comporte pareil.*
 *
 * Corroboré indépendamment par TCK-458, ouvert le même jour sur ce fichier : la paire mesure
 * **10,5 à 12,4:1** selon le fond, très au-dessus du seuil AA. C'est l'AUTRE variante — la
 * location — qui était en défaut. Deux raisonnements partis d'endroits opposés désignent la même
 * ligne : celle-ci n'est pas à toucher.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA VARIANTE *LOCATION* A PERDU SON ALPHA — TCK-458
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle valait `bg-accent/90 text-accent-foreground`, et ce `/90` la faisait passer SOUS le seuil
 * AA. Le mot « Location » est du TEXTE (10-11 px semi-gras), donc gouverné par 4,5:1 (WCAG 2.1
 * §1.4.3) et non par les 3:1 du non textuel — confondre les deux est exactement l'erreur qui avait
 * laissé passer le défaut. Mesuré, alpha composé avant le calcul :
 *
 *     bg-accent/90   clair 4,22:1 (--card)  4,26 (--background)   sombre 4,29 / 4,24     ✗
 *     bg-accent      clair 5,25:1                                 sombre 4,93:1          ✓
 *
 * ⚠ **Retirer l'alpha ne fait pas que remonter le ratio : il ferme la question.** Un fond
 * semi-transparent posé SUR UNE PHOTO n'a pas de contraste garanti par construction — les 10 %
 * restants laissaient passer un pixel quelconque, et le pire cas (pixel BLANC en thème clair,
 * pixel NOIR en thème sombre — les deux extrémités opposées pour le même couple) valait 4,22:1 et
 * 4,10:1. Une plaque OPAQUE ne dépend plus de l'image : le 5,25:1 vaut sur toutes les photos.
 * `backdrop-blur-md` reste, pour la variante *vente* qui, elle, garde son `/85` — et qui le peut,
 * son pire cas valant 10,56:1.
 *
 * Le pire fond se DÉRIVE (balayage des 256 gris, `pireFondSurMedia`), il ne se choisit pas : la
 * règle « blanc si l'encre est claire » est vraie ici et fausse en général — cf. le contre-exemple
 * mesuré dans `src/test/contraste-wcag.ts`.
 */
export function ContractTypeChip({ type, compact = false, className }: ContractTypeChipProps) {
  const t = useTranslations('property.contractTypes');
  const isSale = type === 'sale';
  const sizing = compact
    ? 'px-2 py-0.5 text-[10px] gap-1'
    : 'px-2.5 py-1 text-[11px] gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold backdrop-blur-md ${sizing} ${
        isSale
          ? 'bg-foreground/85 text-background'
          : 'bg-accent text-accent-foreground'
      } ${className || ''}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {compact
        ? t(isSale ? 'sale' : 'rent')
        : t(isSale ? 'saleLong' : 'rentLong')}
    </span>
  );
}
