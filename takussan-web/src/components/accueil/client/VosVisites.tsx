'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

import { Disque, LienTonal, TitreBloc, TitreColonne } from '../pieces';

/** Une visite à venir telle que `GET /api/dashboard/me` la sert (`visits_upcoming`, TCK-595). */
export interface VisiteAVenir {
  readonly id: number;
  readonly scheduled_at: string | null;
  readonly status: string | null;
  readonly property: { readonly id: number; readonly title: string } | null;
}

/** Les visites montrées en cartes ; « Toutes vos visites » au-delà. */
export const VISITES_DE_L_ACCUEIL = 2;

/**
 * TCK-2625 (maquette `app-accueil` a, écran « Client ») — « Vos démarches » : les visites à venir que
 * le tableau de bord sert déjà (`visits_upcoming`, cinq au plus, `scheduled` ou `confirmed`), sans
 * requête de plus. Une carte par visite, deux au plus : la date et l'heure, le bien, l'état, et
 * « Voir la visite ».
 *
 * Écarts de donnée à la maquette (rien d'inventé) : la photo du bien, l'agent, l'adresse, « Déplacer »
 * et « Itinéraire » — `visits_upcoming` ne porte que la date, l'état et le titre du bien.
 */
export function VosVisites({ visites, bureau = false }: { readonly visites: readonly VisiteAVenir[]; readonly bureau?: boolean }) {
  const t = useTranslations('accueil.client.visites');
  if (visites.length === 0) return null;
  const montrees = visites.slice(0, VISITES_DE_L_ACCUEIL);
  return (
    <section aria-labelledby={bureau ? 'client-visites-bureau' : 'client-visites'} className="space-y-2" data-slot="vos-visites">
      <div className="flex items-baseline justify-between max-md:pr-4">
        {bureau ? <TitreColonne id="client-visites-bureau">{t('titre')}</TitreColonne> : <TitreBloc id="client-visites">{t('titre')}</TitreBloc>}
        {visites.length > montrees.length ? (
          <Link href="/app/visits" className="rounded text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
            {t('toutes')}
          </Link>
        ) : null}
      </div>
      <ul className="space-y-3 max-md:px-4">
        {montrees.map((v) => (
          <li key={v.id}>
            <CarteDeVisite visite={v} bureau={bureau} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CarteDeVisite({ visite, bureau }: { readonly visite: VisiteAVenir; readonly bureau: boolean }) {
  const t = useTranslations('accueil.client.visites');
  const f = useFormatteurs();
  const confirmee = visite.status === 'confirmed';
  const quand = visite.scheduled_at
    ? t('quand', { date: f.date(visite.scheduled_at, { dateStyle: undefined, weekday: 'short', day: 'numeric', month: 'short' }), heure: f.heure(visite.scheduled_at) })
    : t('sansDate');
  return (
    <article className="rounded-2xl border border-border bg-card p-4" data-slot="carte-de-visite-client">
      <div className="flex items-start gap-3">
        <Disque icone={CalendarDays} />
        <div className="min-w-0 flex-1">
          <p className="text-corps font-semibold first-letter:uppercase">{quand}</p>
          {visite.property ? <p className="mt-0.5 truncate text-sm text-muted-foreground">{visite.property.title}</p> : null}
          <StatusBadge className="mt-1.5" tone={confirmee ? 'success' : 'attention'} label={confirmee ? t('confirmee') : t('aConfirmer')} />
        </div>
      </div>
      <div className={cn('mt-3.5', bureau && 'max-w-sm')}>
        <LienTonal href={`/app/visits/${visite.id}`} className="h-11 w-full">
          {t('voir')}
        </LienTonal>
      </div>
    </article>
  );
}
