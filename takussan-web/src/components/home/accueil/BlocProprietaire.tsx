'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';

import { LienLocalise } from '@/components/shared/LienLocalise';
import type { OffreDeLaVille } from '@/lib/queries/raccourcis-de-l-accueil';

/**
 * TCK-2495 — le bloc propriétaire, en fin de page : du contenu chiffré, pas une bannière.
 *
 * ⚠ **Le chiffre est celui de l'OFFRE, et c'est délibéré.** La maquette disait « 1 240 personnes ont
 * cherché à Dakar cette semaine » : aucun endpoint public ne compte les recherches (le journal
 * d'ADR-0088 est réservé à l'administration), et un chiffre de demande inventé est exactement ce que
 * l'audit interdit. Les comptes de locations et de ventes en ligne dans la ville sont publics et
 * exacts (`/public/properties/cities`). Sans eux (`offre` nulle), le bloc parle sans chiffre.
 *
 * « Publier » mène à `/publish`, qui résout où envoyer chacun (TCK-254), connecté ou non.
 */
export function BlocProprietaire({ offre }: { readonly offre: OffreDeLaVille | null }) {
  const t = useTranslations('homepage.proprietaire');
  const idTitre = useId();
  const gras = (morceau: ReactNode) => <strong className="font-semibold tabular-nums text-foreground">{morceau}</strong>;

  return (
    <section
      aria-labelledby={idTitre}
      className="flex flex-col gap-4 rounded-2xl bg-secondary p-5 md:flex-row md:items-center md:justify-between md:gap-10 md:px-10 md:py-9"
    >
      <div className="max-w-xl">
        <h2 id={idTitre} className="font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[28px]">
          {t('title')}
        </h2>
        <p className="mt-1.5 text-[15px] text-muted-foreground md:mt-2 md:text-[17px]">
          {offre
            ? t.rich('offre', { location: offre.location, vente: offre.vente, ville: offre.ville, b: gras })
            : t('sansChiffre')}
        </p>
      </div>
      <LienLocalise
        href="/publish"
        className="inline-flex min-h-11 w-fit shrink-0 items-center gap-2 rounded-xl bg-foreground px-5 text-[15px] font-semibold text-background transition-[background-color,scale] hover:bg-primary active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-12 md:px-6"
      >
        {t('cta')}
        <ChevronRight className="size-4" aria-hidden="true" />
      </LienLocalise>
    </section>
  );
}
