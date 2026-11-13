'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';

import { LienTonal, RangeeAFaire } from '@/components/accueil/pieces';
import { ConfirmerALHeure } from '@/components/visits/par-le-temps/cartes';
import { nomDuVisiteur, useHeuresProposees, type HeureProposee } from '@/components/visits/par-le-temps/pieces';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { estUnRefus, titreEtQuartier } from '@/lib/accueil/a-faire';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import { jourADakar } from '@/lib/journee/journee';
import { useConfirmerDepuisLAccueil } from '@/lib/queries/accueil';
import { cn } from '@/lib/utils';
import { jourEnClair } from '@/lib/visites/planification';
import type { PropertyVisit } from '@/types/visit';

/**
 * TCK-2624 — une visite à confirmer, en rangée du bureau : « Mer. 11 nov. · 09:30 — Villa
 * contemporaine, Almadies », le visiteur et l'agent, puis « Autre créneau » et « Confirmer ».
 *
 * Le geste est celui de la liste des visites (TCK-2587) : une visite à heure fixée se confirme à son
 * heure ; une TRANCHE se confirme à une heure libre de son agent (`ConfirmerALHeure`), et « Autre
 * créneau » ouvre la fiche sur le choix de l'heure. Un refus de l'API (403) retire le geste : la
 * rangée mène à la visite. Tout autre échec (créneau pris) se dit, la rangée reste.
 */
export function LigneDeVisite({ v, refusee, onRefus }: { readonly v: PropertyVisit; readonly refusee: boolean; readonly onRefus: () => void }) {
  const t = useTranslations('accueil.admin.visites');
  const tTemps = useTranslations('visits.parLeTemps');
  const tVisits = useTranslations('visits');
  const tPlanning = useTranslations('visitPlanning');
  const f = useFormatteurs();
  const toast = useToast();
  const confirmer = useConfirmerDepuisLAccueil();
  const tranche = v.status === 'scheduled' ? (v.preferred_window ?? null) : null;
  const proposees = useHeuresProposees(v, (iso) => f.heure(iso), !refusee && tranche !== null);

  const jour = v.scheduled_at ? jourEnClair(jourADakar(new Date(v.scheduled_at)), f.locale) : null;
  const quand = tranche ? tTemps(`tranches.${tranche}`) : f.heure(v.scheduled_at);
  const bien = titreEtQuartier(v.property?.title, v.property?.address?.neighborhood, tVisits('fallbackTitle', { id: String(v.id) }));
  const visiteur = nomDuVisiteur(v) ?? tTemps('visiteur');
  const agent = v.agent ? nomAffichable(v.agent) : null;

  const onConfirmer = (_: PropertyVisit, heure: HeureProposee) =>
    confirmer.mutate(
      { id: v.id, ...(heure.start ? { scheduled_at: heure.start } : {}) },
      {
        onSuccess: (r) => {
          toast.add({ title: t('confirmee', { quand: `${jour ?? ''} ${heure.label}`.trim() }), type: 'success' });
          if (r.sms_sent === false) toast.add({ title: tPlanning('smsWithheld.title'), description: tPlanning('smsWithheld.description'), type: 'warning' });
        },
        onError: (e) => {
          if (estUnRefus(e)) {
            onRefus();
            toast.add({ title: t('refusee'), type: 'error' });
            return;
          }
          toast.add({ title: (e instanceof ApiError && e.displayMessage) || tTemps('erreurGeste'), type: 'error' });
        },
      },
    );

  const voir = (libelle: string, href: string) => (
    <Link href={href} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2')}>
      {libelle}
    </Link>
  );

  return (
    <RangeeAFaire
      icone={CalendarClock}
      titre={t('titre', { jour: jour ?? '', quand, bien })}
      detail={agent ? t('detailAvecAgent', { visiteur, agent }) : visiteur}
      gestes={
        refusee ? (
          // Le seul geste qui reste prend la place du bouton tonal (maquette : « Voir » d'une rangée).
          <LienTonal href={`/app/visits/${v.id}`} className="h-8 px-3 text-ui font-semibold">
            {t('voir')}
          </LienTonal>
        ) : (
          <>
            {voir(t('autreCreneau'), `/app/visits/${v.id}?heure=autre`)}
            {tranche ? (
              <ConfirmerALHeure v={v} proposees={proposees.heures} etat={proposees.etat} enCours={confirmer.isPending} onConfirmer={onConfirmer} taille="table" />
            ) : (
              <Button
                variant="secondary"
                className="h-8 px-3 text-ui font-semibold"
                disabled={confirmer.isPending || !v.scheduled_at}
                onClick={() => onConfirmer(v, { start: null, label: f.heure(v.scheduled_at) })}
              >
                {t('confirmer')}
              </Button>
            )}
          </>
        )
      }
    />
  );
}
