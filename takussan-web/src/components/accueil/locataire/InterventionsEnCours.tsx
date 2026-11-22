'use client';

import Link from 'next/link';
import { ChevronRight, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { maintenanceStatusBadgeClass } from '@/components/maintenance/labels';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { repartirDemandes } from '@/lib/maintenance/mes-demandes';
import { useDemandesDuLocataire } from '@/lib/queries/maintenance-signalement';
import { cn } from '@/lib/utils';
import type { InterventionEnFile } from '@/lib/maintenance/files';

import { ErreurDeBloc } from '../EtatsDeBloc';

/** Au-delà, la page Interventions. */
const MONTREES = 3;

/**
 * TCK-2852 (maquette `app-accueil` a, écran « Locataire », bureau, colonne de droite) — « Interventions
 * en cours » : les demandes du locataire qui ne sont ni closes ni annulées, chacune avec son statut ;
 * sans aucune, « Aucune intervention en cours dans votre logement. ». « Signaler un problème » mène au
 * signalement (TCK-2654).
 *
 * La lecture est celle de la page Interventions du locataire (`useDemandesDuLocataire` : la portée
 * `visibleTo` de l'API, sans colonne de coût) et son partage (`repartirDemandes`) : « en cours » =
 * terminées à confirmer + en cours. Même requête, même cache que la page.
 */
export function InterventionsEnCours({ className }: { readonly className?: string }) {
  const t = useTranslations('accueil.locataire.interventions');
  const lues = useDemandesDuLocataire();

  if (lues.isPending) {
    return <div data-slot="interventions-en-cours" data-etat="chargement" aria-hidden="true" className={cn('h-32 animate-pulse rounded-xl bg-muted', className)} />;
  }
  if (lues.isError) {
    return <ErreurDeBloc quoi={t('quoi')} onReessayer={() => void lues.refetch()} className={className} />;
  }
  const { aConfirmer, enCours } = repartirDemandes(lues.data?.data ?? []);
  const ouvertes = [...aConfirmer, ...enCours];

  return (
    <section aria-labelledby="interventions-en-cours" data-slot="interventions-en-cours" className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      {/* La colonne est étroite (≈ 313 px à 1280) : le titre passe à la ligne plutôt que d'être coupé par l'action. */}
      <div className="flex min-h-11 items-center gap-2 border-b border-border px-4 py-2">
        <h2 id="interventions-en-cours" className="min-w-0 text-sm font-semibold">
          {t('titre')}
        </h2>
        <Link
          href="/app/maintenance/new"
          className="ml-auto inline-flex flex-none items-center gap-0.5 rounded text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('signaler')}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {ouvertes.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground" data-slot="aucune-intervention">
          {t('vide')}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {ouvertes.slice(0, MONTREES).map((d) => (
            <RangeeDIntervention key={d.id} demande={d} />
          ))}
          {ouvertes.length > MONTREES ? (
            <li>
              <Link href="/app/maintenance" className="flex h-10 items-center bg-muted/30 px-4 text-ui font-medium text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring">
                {t('toutes', { n: ouvertes.length })}
                <ChevronRight className="ml-1 size-3.5 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

function RangeeDIntervention({ demande }: { readonly demande: InterventionEnFile }) {
  const tStatut = useTranslations('maintenance.status');
  const f = useFormatteurs();
  return (
    <li data-slot="intervention" data-id={demande.id}>
      <Link
        href={`/app/maintenance/${demande.id}`}
        className="flex min-h-14 items-center gap-3 px-4 py-2.5 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Wrench className="size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium">{demande.title}</span>
          {demande.created_at ? <span className="block text-xs text-muted-foreground">{f.jourMois(demande.created_at)}</span> : null}
        </span>
        <span className={cn('inline-flex flex-none items-center rounded-full px-2 py-0.5 text-legende font-medium', maintenanceStatusBadgeClass(demande.status))} data-slot="statut">
          {tStatut(demande.status)}
        </span>
      </Link>
    </li>
  );
}
