'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Navigation } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ProposerUnCreneau } from '@/components/visits/dialogues-de-la-visite';
import { Vignette } from '@/components/visits/planification/PiecesDeLaPlanification';
import { useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { visitsQueryKeys } from '@/lib/queries/visits';
import { cn } from '@/lib/utils';
import type { ApiResponse } from '@/types/api';
import type { PropertyVisit } from '@/types/visit';

import { LienTonal, TitreBloc, TitreColonne } from '../pieces';

/**
 * Une visite à venir telle que `GET /api/dashboard/me` la sert (`visits_upcoming`, TCK-595). TCK-2851 y
 * ajoute la photo et le lieu du bien, ses coordonnées (clé ABSENTE hors visite confirmée), le nom de
 * l'agent et `can_reschedule` — facultatifs ici : `CeQuiMAttend` lit la même liste, et une réponse plus
 * ancienne reste lisible.
 */
export interface VisiteAVenir {
  readonly id: number;
  readonly scheduled_at: string | null;
  readonly status: string | null;
  readonly property: {
    readonly id: number;
    readonly title: string;
    readonly cover_url?: string | null;
    readonly address_line?: string | null;
    readonly coordinates?: { readonly lat: number; readonly lng: number } | null;
  } | null;
  readonly agent?: { readonly name: string | null } | null;
  readonly can_reschedule?: boolean;
}

/** Les visites montrées en cartes ; « Toutes vos visites » au-delà. */
export const VISITES_DE_L_ACCUEIL = 2;

/** « Itinéraire » : la carte de l'appareil sur les coordonnées du bien (la forme des Visites par le temps). */
export function lienItineraireDeLaVisite(visite: Pick<VisiteAVenir, 'status' | 'property'>): string | null {
  const c = visite.property?.coordinates;
  if (visite.status !== 'confirmed' || !c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
}

/**
 * TCK-2625 → TCK-2853 (maquette `app-accueil` a, écran « Client », `CarteVisiteClient`) — « Vos
 * démarches » : les visites à venir que le tableau de bord sert déjà (`visits_upcoming`, cinq au plus,
 * `scheduled` ou `confirmed`), sans requête de plus. Une carte par visite, deux au plus : la photo du
 * bien (56 px), « Visite jeu. 12 nov. · 10:00 », « bien · agent », l'état, puis deux boutons de 44 px —
 * « Déplacer » (contour, si `can_reschedule`) et « Itinéraire » (tonal, si les coordonnées sont servies,
 * c.-à-d. la visite confirmée).
 *
 * Quand l'un des deux manque, « Voir la visite » prend sa place : la carte garde toujours un chemin vers
 * la visite (la maquette, qui dessine une visite confirmée et reportable, ne le montre pas).
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

function CarteDeVisite({ visite: servie, bureau }: { readonly visite: VisiteAVenir; readonly bureau: boolean }) {
  const t = useTranslations('accueil.client.visites');
  const f = useFormatteurs();
  const router = useRouter();
  // Après « Déplacer », la visite telle que l'API l'a rendue : nouvelle heure, de nouveau en attente —
  // donc sans « Itinéraire » (les coordonnées ne valent que pour une visite confirmée).
  const [reportee, setReportee] = useState<{ readonly scheduled_at: string | null; readonly status: string | null } | null>(null);
  const visite: VisiteAVenir = reportee ? { ...servie, ...reportee } : servie;
  const confirmee = visite.status === 'confirmed';
  const quand = visite.scheduled_at
    ? t('quand', { date: f.date(visite.scheduled_at, { dateStyle: undefined, weekday: 'short', day: 'numeric', month: 'short' }), heure: f.heure(visite.scheduled_at) })
    : t('sansDate');
  const agent = visite.agent?.name?.trim() || null;
  const detail = [visite.property?.title, agent].filter(Boolean).join(' · ');
  const itineraire = lienItineraireDeLaVisite(visite);
  const deplacable = visite.can_reschedule === true;
  const gestes = [deplacable, itineraire !== null].filter(Boolean).length;

  return (
    <article className="rounded-2xl border border-border bg-card p-4" data-slot="carte-de-visite-client">
      <div className="flex items-start gap-3">
        <Vignette src={visite.property?.cover_url ?? null} className="size-14 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-corps font-semibold first-letter:uppercase">{quand}</p>
          {detail ? <p className="mt-0.5 truncate text-sm text-muted-foreground">{detail}</p> : null}
          <StatusBadge className="mt-1.5" tone={confirmee ? 'success' : 'attention'} label={confirmee ? t('confirmee') : t('aConfirmer')} />
        </div>
      </div>
      <div className={cn('mt-3.5 grid grid-cols-2 gap-2 [&>*]:h-11 [&>*]:w-full', bureau && 'max-w-sm')}>
        {deplacable ? (
          <DeplacerLaVisite
            visitId={visite.id}
            onDeplacee={(apres) => {
              setReportee({ scheduled_at: apres.scheduled_at ?? null, status: apres.status ?? null });
              // Les autres lectures de la page (« Ce qui m'attend ») suivent.
              router.refresh();
            }}
          />
        ) : null}
        {itineraire ? (
          <a href={itineraire} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'px-3.5 font-semibold')} data-slot="geste-itineraire">
            <Navigation className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {t('itineraire')}
          </a>
        ) : null}
        {gestes < 2 ? (
          <LienTonal href={`/app/visits/${visite.id}`} className={cn(gestes === 0 && 'col-span-2')}>
            {t('voir')}
          </LienTonal>
        ) : null}
      </div>
    </article>
  );
}

/**
 * « Déplacer » : le choix d'un créneau de « Mes visites » (`ProposerUnCreneau`, la grille que le serveur
 * rend pour le bien), qui poste `POST /api/property-visits/{id}/reschedule`. La grille se lit par le
 * `slug` du bien, que `visits_upcoming` ne sert pas : la visite est lue au clic (`GET
 * /api/property-visits/{id}`, qui n'accepte ni `fields` ni `include` : il charge le bien lui-même).
 */
function DeplacerLaVisite({ visitId, onDeplacee }: { readonly visitId: number; readonly onDeplacee: (apres: { scheduled_at?: string | null; status?: string | null }) => void }) {
  const t = useTranslations('accueil.client.visites');
  const toast = useToast();
  const [slug, setSlug] = useState<string | null>(null);
  const lue = useApiQuery<ApiResponse<PropertyVisit>>([...visitsQueryKeys.detail(visitId), 'accueil-client'] as const, cheminApi`/api/property-visits/${visitId}`, {
    enabled: false,
  });

  async function ouvrir() {
    const lu = await lue.refetch();
    const trouve = lu.data?.data.property?.slug ?? null;
    if (trouve) setSlug(trouve);
    else toast.add({ title: t('deplacerImpossible'), type: 'error' });
  }

  return (
    <>
      <Button type="button" variant="outline" size="lg" className="px-3.5" disabled={lue.isFetching} onClick={() => void ouvrir()}>
        {t('deplacer')}
      </Button>
      {slug ? <ProposerUnCreneau visitId={visitId} slug={slug} onClose={() => setSlug(null)} onPropose={onDeplacee} /> : null}
    </>
  );
}
