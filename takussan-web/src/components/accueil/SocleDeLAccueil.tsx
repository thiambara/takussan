import type { ReactNode } from 'react';

import { PageHeader } from '@/components/console';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import type { AgencyKind } from '@/types/agency';
import { BandeauMiseEnService } from './BandeauMiseEnService';

/**
 * TCK-2622 (ADR-0096) — le socle de l'accueil de `/app`, commun aux personas qui ne sont pas l'agent
 * (l'agent arrive sur sa journée, TCK-2596). De haut en bas (maquette `app-accueil` a) :
 *
 *  1. la mise en service de l'agence en UNE ligne (admin, tant qu'il reste une étape) — au téléphone
 *     au-dessus du salut, au bureau en bandeau de l'en-tête ;
 *  2. le salut « Bonjour Awa » (le seul H1 exposé à chaque largeur) et la ligne de 13 px « Mardi 10
 *     novembre », suivie d'un résumé quand un bloc en donne un ;
 *  3. les bandeaux existants (logo, brouillons, check-list d'entrée) ;
 *  4. l'emplacement des blocs du persona (TCK-2624, TCK-2625) ;
 *  5. « Ce mois ».
 *
 * Au bureau, deux colonnes dès `xl` (la maquette : « à 1024, une seule colonne ») : les blocs à
 * gauche, « Ce mois » à droite sur 360 px. Sans bloc du persona, une seule colonne.
 *
 * Composant serveur : aucun état, il pose les pièces.
 */

interface SocleDeLAccueilProps {
  readonly titre: string;
  /** « Mardi 10 novembre », ou « Mardi 10 novembre · 3 demandes, 12 visites à confirmer ». */
  readonly ligne: string;
  /** L'agence dont montrer la mise en service ; `null` hors admin d'agence. */
  readonly miseEnService: { readonly agencyId: number; readonly kind: AgencyKind | null } | null;
  /** Les bandeaux existants ; chacun ne rend rien quand il n'a rien à dire. */
  readonly bandeaux: ReactNode;
  /** Les blocs « À faire » du persona (TCK-2624, TCK-2625) ; absents, « Ce mois » prend la largeur. */
  readonly blocs?: ReactNode;
  /** L'état d'un accueil sans aucun chiffre (client, prestataire), en attendant leurs blocs. */
  readonly vide?: ReactNode;
  /** « Ce mois », ou `null` quand le persona n'a pas de chiffres. */
  readonly ceMois: ReactNode;
}

export function SocleDeLAccueil({ titre, ligne, miseEnService, bandeaux, blocs, vide, ceMois }: SocleDeLAccueilProps) {
  return (
    <PagePleineLargeur data-slot="accueil" className="max-md:pb-8">
      {/* ─── Le téléphone : la ligne de mise en service, puis le salut ─── */}
      <div className="md:hidden">
        {miseEnService ? <BandeauMiseEnService agencyId={miseEnService.agencyId} kind={miseEnService.kind} /> : null}
        <div className="px-4 pt-5">
          <h1 className="font-display text-2xl font-semibold tracking-titre text-foreground">{titre}</h1>
          <p className="mt-0.5 text-ui text-muted-foreground">{ligne}</p>
        </div>
      </div>

      {/* ─── Le bureau : l'en-tête de page, la mise en service en bandeau ─── */}
      <PageHeader
        className="max-md:hidden"
        title={titre}
        description={ligne}
        bandeau={miseEnService ? <BandeauMiseEnService large agencyId={miseEnService.agencyId} kind={miseEnService.kind} /> : undefined}
      />

      <div data-slot="bandeaux-de-l-accueil" className="space-y-3 empty:hidden max-md:px-4 max-md:pt-4 md:pt-6">
        {bandeaux}
      </div>

      {blocs ? (
        <div className="grid grid-cols-1 items-start gap-7 pt-6 md:gap-8 xl:grid-cols-[minmax(0,1fr)_min(calc(var(--spacing)*100),33%)]">
          <div className="min-w-0 space-y-5">{blocs}</div>
          <div className="min-w-0 space-y-5">{ceMois}</div>
        </div>
      ) : (
        <div className="space-y-7 pt-7 empty:hidden md:pt-6">
          {vide ? <div className="max-md:px-4">{vide}</div> : null}
          {ceMois}
        </div>
      )}
    </PagePleineLargeur>
  );
}
