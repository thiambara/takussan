'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, Navigation, Phone } from 'lucide-react';

import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { useCreneauxDeVisite } from '@/lib/queries/visits';
import { DELAI_DE_PREVENANCE_MINUTES } from '@/lib/visites/planification';
import { heuresLibresDeLaTranche, jourADakar } from '@/lib/visites/par-le-temps';
import { nomAffichable } from '@/lib/identite';
import { cn } from '@/lib/utils';
import type { PropertyVisit } from '@/types/visit';

/**
 * TCK-2587 — les pièces des Visites « par le temps » (maquette `app-visites-a-mobile.tsx`, retouche
 * du 2026-11-10) : l'heure d'abord, l'adresse juste dessous avec son épingle, une seule couleur forte
 * par écran (« Itinéraire » de la prochaine visite) ; les gestes répétés d'une liste en teinte douce.
 */

export const CARTE = 'rounded-2xl border border-border bg-card';

/* ───────────────────────────── lectures de la visite ───────────────────────────── */

/** Le nom du visiteur tel que la carte le montre : la fiche, le compte, le nom saisi (TCK-2585). */
export function nomDuVisiteur(v: PropertyVisit): string | null {
  if (v.visitor_display?.name) return v.visitor_display.name;
  if (v.customer) return nomAffichable(v.customer, v.visitor_name);
  if (v.visitor) return nomAffichable(v.visitor, v.visitor_name);
  return v.visitor_name?.trim() || null;
}

/** Le numéro joignable du visiteur (E.164), sinon `null` : ni `tel:` ni WhatsApp voués à l'échec. */
export function telephoneDuVisiteur(v: PropertyVisit): string | null {
  const brut = v.visitor_display?.phone ?? v.customer?.phone ?? v.visitor?.phone ?? v.visitor_phone ?? null;
  return isReachable(brut) ? brut : null;
}

/** « Local commercial · Dakar-Plateau » : le titre du bien et son quartier. */
export function bienEtQuartier(v: PropertyVisit, repli: string): string {
  const titre = v.property?.title?.trim() || repli;
  const quartier = v.property?.address?.neighborhood?.trim();
  return quartier ? `${titre} · ${quartier}` : titre;
}

/** La destination de l'itinéraire : les coordonnées, à défaut l'adresse écrite. */
export function lienItineraire(v: PropertyVisit): string | null {
  const a = v.property?.address;
  if (!a) return null;
  if (a.latitude != null && a.longitude != null) return `https://www.google.com/maps/dir/?api=1&destination=${a.latitude},${a.longitude}`;
  const texte = [a.line, a.neighborhood, a.city].filter(Boolean).join(', ');
  return texte ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(texte)}` : null;
}

/** « 45 min », « 2 h 05 », « 1 h ». */
export function useDureeEnClair() {
  const t = useTranslations('visits.parLeTemps.duree');
  return (minutes: number) => {
    if (minutes < 60) return t('minutes', { n: minutes });
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? t('heuresRondes', { h }) : t('heures', { h, mm: String(m).padStart(2, '0') });
  };
}

/* ───────────────────────────── l'heure proposée d'une tranche ───────────────────────────── */

export interface HeureProposee {
  /** L'instant que « Confirmer » poste (`scheduled_at`) ; `null` pour une visite à heure fixée. */
  readonly start: string | null;
  readonly label: string;
}

/**
 * Les heures qu'une demande propose de confirmer. À heure fixée : son heure, rien à poster. Par
 * tranche (« l'après-midi ») : les créneaux LIBRES du jour (`GET /api/property-visits/slots`) qui
 * tombent dans la tranche, au-delà du délai de prévenance — la première est « Confirmer 15:00 ».
 */
export function useHeuresProposees(
  v: PropertyVisit,
  heureDe: (iso: string) => string,
  actif = true,
): { readonly etat: 'charge' | 'attente' | 'aucune'; readonly heures: readonly HeureProposee[] } {
  const tranche = v.status === 'scheduled' ? (v.preferred_window ?? null) : null;
  const jour = tranche && v.scheduled_at ? jourADakar(new Date(v.scheduled_at)) : null;
  // Les heures libres de l'agent de la visite (d1) : un admin ne propose pas les siennes.
  const creneaux = useCreneauxDeVisite(actif && tranche ? v.property_id : null, actif ? jour : null, v.agent_id ?? null);
  if (!tranche) {
    return v.scheduled_at ? { etat: 'charge', heures: [{ start: null, label: heureDe(v.scheduled_at) }] } : { etat: 'aucune', heures: [] };
  }
  if (!creneaux.data) return { etat: creneaux.isError ? 'aucune' : 'attente', heures: [] };
  // L'instant de la lecture des créneaux tient lieu de « maintenant » : un rendu reste pur.
  const auPlusTot = creneaux.dataUpdatedAt + DELAI_DE_PREVENANCE_MINUTES * 60_000;
  const heures = heuresLibresDeLaTranche(creneaux.data.data.slots, tranche, auPlusTot).map((c) => ({ start: c.start, label: c.label }));
  return { etat: heures.length > 0 ? 'charge' : 'aucune', heures };
}

/* ───────────────────────────── pièces d'affichage ───────────────────────────── */

/** Le titre d'un bloc de la liste : un vrai titre, son compte, et à droite une note ou un lien. */
export function TitreBloc({
  children,
  compte,
  note,
  action,
}: {
  readonly children: ReactNode;
  readonly compte?: number | null;
  readonly note?: ReactNode;
  readonly action?: { readonly libelle: string; readonly href: string };
}) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="font-display text-xl font-semibold tracking-titre text-foreground">{children}</h2>
      {compte != null ? <span className="text-corps font-medium tabular-nums text-muted-foreground">{compte}</span> : null}
      {note ? <span className="ml-auto text-sm text-muted-foreground">{note}</span> : null}
      {action ? (
        <Link href={action.href} scroll={false} className="-my-3 ml-auto inline-flex h-11 items-center rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring">
          {action.libelle}
        </Link>
      ) : null}
    </div>
  );
}

/** L'adresse, précédée de son épingle : « 12, rue Carnot · Dakar-Plateau ». */
export function Adresse({ v, className }: { readonly v: PropertyVisit; readonly className?: string }) {
  const a = v.property?.address;
  if (!a || !(a.line || a.neighborhood)) return null;
  return (
    <p className={cn('flex items-start gap-1.5 text-corps leading-snug text-encre-douce', className)}>
      <MapPin className="mt-0.5 size-4 flex-none text-primary" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0">
        {a.line}
        {a.line && a.neighborhood ? ' · ' : null}
        {a.neighborhood ? <span className="whitespace-nowrap">{a.neighborhood}</span> : null}
      </span>
    </p>
  );
}

/** La date en tuile : le jour en petites capitales, le quantième en chiffre de titre. */
export function TuileDate({ nom, quantieme }: { readonly nom: string; readonly quantieme: string }) {
  return (
    <span className="flex h-13 w-12 flex-none flex-col items-center justify-center rounded-xl bg-secondary/70 leading-none" aria-hidden="true">
      <span className="text-legende font-semibold uppercase tracking-surtitre text-primary-deep">{nom}</span>
      <span className="mt-1 font-display text-xl font-semibold text-foreground">{quantieme}</span>
    </span>
  );
}

/** Le temps libre entre deux visites : une respiration, pas une ligne de plus. */
export function Libre({ children }: { readonly children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 py-3.5 text-ui text-muted-foreground">
      <span className="h-px flex-1 border-t border-dashed border-foreground/20" aria-hidden="true" />
      {children}
      <span className="h-px flex-1 border-t border-dashed border-foreground/20" aria-hidden="true" />
    </p>
  );
}

const ROND = 'inline-flex size-11 flex-none items-center justify-center rounded-full border border-border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring';

/** Appeler et WhatsApp en disques clairs : dans une liste, le vert plein reviendrait à chaque ligne. */
export function GestesDuVisiteur({ v, nom, bien }: { readonly v: PropertyVisit; readonly nom: string; readonly bien: string }) {
  const t = useTranslations('visits.parLeTemps');
  const numero = telephoneDuVisiteur(v);
  if (!numero) return null;
  return (
    <>
      <a href={telHref(numero)} aria-label={t('appeler', { nom })} data-slot="geste-appeler" className={cn(ROND, 'text-foreground')}>
        <Phone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
      </a>
      <a
        href={whatsappHref(numero, t('messageWhatsApp', { nom, bien }))}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('whatsapp', { nom })}
        data-slot="geste-whatsapp"
        className={cn(ROND, 'text-success')}
      >
        <IconeWhatsApp className="size-5" />
      </a>
    </>
  );
}

/** « Itinéraire » : plein (`sombre`) sur la prochaine visite, en contour ailleurs. */
export function GesteItineraire({ v, plein, className }: { readonly v: PropertyVisit; readonly plein?: boolean; readonly className?: string }) {
  const t = useTranslations('visits.parLeTemps');
  const href = lienItineraire(v);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-slot="geste-itineraire"
      className={cn(
        'inline-flex h-11 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring',
        plein ? 'h-12 bg-foreground text-corps text-background' : 'border border-border bg-card text-foreground',
        className,
      )}
    >
      <Navigation className={plein ? 'size-icone' : 'size-4'} strokeWidth={1.75} aria-hidden="true" />
      {t('itineraire')}
    </a>
  );
}
