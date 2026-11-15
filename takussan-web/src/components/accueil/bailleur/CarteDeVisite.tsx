'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';

import { CarteAFaire } from '@/components/accueil/pieces';
import { ConfirmerALHeure } from '@/components/visits/par-le-temps/cartes';
import { useHeuresProposees, type HeureProposee } from '@/components/visits/par-le-temps/pieces';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { estUnRefus, titreEtQuartier } from '@/lib/accueil/a-faire';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import { useConfirmerDepuisLAccueil } from '@/lib/queries/accueil';
import type { PropertyVisit } from '@/types/visit';

/**
 * TCK-2624 (lot 2, maquette `app-accueil` a, écran « Bailleur », téléphone) — une visite à confirmer,
 * en carte : « Visite à confirmer · sam. 14 nov. · 11:00 », « Maison familiale avec jardin, Ouakam ·
 * proposée par Sokhna Sène », puis « Autre créneau » et « Confirmer ».
 *
 * Le geste est celui de la rangée du bureau (`LigneDeVisite`) : l'heure fixée, ou une heure libre de
 * la tranche (`ConfirmerALHeure`). Sans le geste (`geste = false` : le bailleur d'un bien d'agence,
 * que `PropertyVisitPolicy::agitPourLeBien` refuse — décision 7 ; ou un 403 de l'API), la carte porte
 * « Voir » seul, vers la visite.
 */
export function CarteDeVisite({ v, geste, onRefus }: { readonly v: PropertyVisit; readonly geste: boolean; readonly onRefus: () => void }) {
  const t = useTranslations('accueil.bailleur.visite');
  const tAdmin = useTranslations('accueil.admin.visites');
  const tTemps = useTranslations('visits.parLeTemps');
  const tVisits = useTranslations('visits');
  const tPlanning = useTranslations('visitPlanning');
  const f = useFormatteurs();
  const toast = useToast();
  const confirmer = useConfirmerDepuisLAccueil();
  const tranche = v.status === 'scheduled' ? (v.preferred_window ?? null) : null;
  const proposees = useHeuresProposees(v, (iso) => f.heure(iso), geste && tranche !== null);

  const jour = v.scheduled_at ? f.date(v.scheduled_at, { weekday: 'short', day: 'numeric', month: 'short' }) : null;
  const heure = tranche ? tTemps(`tranches.${tranche}`) : v.scheduled_at ? f.heure(v.scheduled_at) : null;
  const bien = titreEtQuartier(v.property?.title, v.property?.address?.neighborhood, tVisits('fallbackTitle', { id: String(v.id) }));
  const agent = v.agent ? nomAffichable(v.agent) : null;

  const onConfirmer = (_: PropertyVisit, h: HeureProposee) =>
    confirmer.mutate(
      { id: v.id, ...(h.start ? { scheduled_at: h.start } : {}) },
      {
        onSuccess: (r) => {
          toast.add({ title: tAdmin('confirmee', { quand: `${jour ?? ''} ${h.label}`.trim() }), type: 'success' });
          if (r.sms_sent === false) toast.add({ title: tPlanning('smsWithheld.title'), description: tPlanning('smsWithheld.description'), type: 'warning' });
        },
        onError: (e) => {
          if (estUnRefus(e)) {
            onRefus();
            toast.add({ title: tAdmin('refusee'), type: 'error' });
            return;
          }
          toast.add({ title: (e instanceof ApiError && e.displayMessage) || tTemps('erreurGeste'), type: 'error' });
        },
      },
    );

  const lien = (libelle: string, href: string) => (
    <Link href={href} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
      {libelle}
    </Link>
  );

  let primaire = null;
  if (geste && tranche) {
    primaire = <ConfirmerALHeure v={v} proposees={proposees.heures} etat={proposees.etat} enCours={confirmer.isPending} onConfirmer={onConfirmer} />;
  } else if (geste) {
    primaire = (
      <Button size="lg" className="font-semibold" disabled={confirmer.isPending || !v.scheduled_at} onClick={() => onConfirmer(v, { start: null, label: f.heure(v.scheduled_at) })}>
        {tAdmin('confirmer')}
      </Button>
    );
  }

  return (
    <CarteAFaire
      icone={CalendarClock}
      titre={t('titre')}
      quand={[jour, heure].filter(Boolean).join(' · ')}
      detail={agent ? t('detail', { bien, agent }) : bien}
      secondaire={geste ? lien(tAdmin('autreCreneau'), `/app/visits/${v.id}?heure=autre`) : lien(tAdmin('voir'), `/app/visits/${v.id}`)}
      primaire={primaire}
    />
  );
}
