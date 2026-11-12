'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClock, Check, ChevronRight, MapPin, Phone } from 'lucide-react';

import { PageHeader, StatusBadge } from '@/components/console';
import { telHref, whatsappHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { Vignette } from '@/components/visits/planification/PiecesDeLaPlanification';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initiales } from '@/lib/fiche-publique';
import { nomAffichable } from '@/lib/identite';
import { useCancelVisit, useVisitesDuClient } from '@/lib/queries/visits';
import { avisDonne, avisOuvert } from '@/lib/visites/fenetre-d-avis';
import { cn } from '@/lib/utils';
import type { PropertyVisit } from '@/types/visit';

import { ProposerUnCreneau, VisitActionDialog } from '../dialogues-de-la-visite';
import { debutDeLaMinute } from '../onglet-des-visites';
import { bienEtQuartier, CARTE, GesteItineraire, useDureeEnClair } from '../par-le-temps/pieces';
import { VISIT_STATUS_LABEL_KEY, VISIT_STATUS_TONE } from '../visit-status';
import { AvisDuClient, Etoiles } from './AvisDuClient';

/**
 * TCK-2587 (lot C) — « Mes visites », la vue du CLIENT (maquette a-7 « Côté client »).
 *
 * Les mêmes données que la console, sans aucun geste du personnel : la prochaine visite confirmée en
 * carte (adresse — servie au visiteur une fois la visite confirmée —, agent, Itinéraire, Proposer un
 * autre créneau, Annuler), l'avis de 1 à 5 dans les 24 h, les demandes en attente, puis les visites
 * passées. Le client ouvrait sur l'onglet « Demandées 0 » ; une section vide ne s'affiche plus, si
 * bien qu'un client sans visite à venir ouvre sur ses visites passées (AC6).
 *
 * Chaque section est un `filter[...]` du serveur (`useVisitesDuClient`), jamais un tri côté client
 * d'une liste déjà reçue — sauf la carte d'avis, qui retient parmi les visites terminées celles dont
 * la fenêtre est ouverte et la note absente (une règle de temps que l'API n'expose pas en filtre).
 *
 * ⚠ « Passées » est la borne `scheduled_at <= maintenant` (celle de `counts.past`). Une visite close
 * AVANT son heure (annulée la veille, terminée en avance) n'y entre pas, et n'est ni « à venir » ni
 * « en attente » : elle est relue à part (`statusClos`, à venir) et rangée en tête des passées.
 */
const STATUTS_CLOS = 'completed,cancelled,no_show';

export function MesVisites({ titre }: { readonly titre: string }) {
  const t = useTranslations('visits.client');
  const tCommon = useTranslations('common');
  const maintenant = useMinuteCourante();
  // Les bornes sont figées au montage (la clé de cache en dépend) ; l'horloge, elle, avance.
  const [borne] = useState(() => debutDeLaMinute(new Date()));
  const [page, setPage] = useState(1);

  const confirmees = useVisitesDuClient({ status: 'confirmed', scheduled_at_min: borne }, 'scheduled_at', 1, 30);
  const demandees = useVisitesDuClient({ status: 'scheduled', scheduled_at_min: borne }, 'scheduled_at', 1, 30);
  const terminees = useVisitesDuClient({ status: 'completed' }, '-scheduled_at', 1, 10);
  const closesAVenir = useVisitesDuClient({ status: STATUTS_CLOS, scheduled_at_min: borne }, '-scheduled_at', 1, 30);
  const passees = useVisitesDuClient({ scheduled_at_max: borne }, '-scheduled_at', page, 20, { garderLaPage: true });
  const lectures = [confirmees, demandees, terminees, closesAVenir, passees];

  if (lectures.some((q) => q.isError)) {
    return (
      <Cadre titre={titre}>
        <ErrorState message={t('erreur')} onRetry={() => lectures.forEach((q) => void q.refetch())} retryLabel={tCommon('actions.retry')} />
      </Cadre>
    );
  }
  if (lectures.some((q) => q.isLoading || !q.data)) {
    return (
      <Cadre titre={titre}>
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      </Cadre>
    );
  }

  const aVenir = confirmees.data?.data ?? [];
  const enAttente = demandees.data?.data ?? [];
  const aNoter = (terminees.data?.data ?? []).filter((v) => avisOuvert(v, maintenant.getTime()) && !avisDonne(v));
  const closes = page === 1 ? (closesAVenir.data?.data ?? []) : [];
  const passeesDeLaPage = passees.data?.data ?? [];
  // La visite à noter est dans « Votre avis », pas en double dans « Passées » (maquette : « Passées 2 »
  // sous la carte d'avis). Terminée, elle est forcément dans l'une des deux lectures de « Passées » :
  // son compte se retire du total, sa ligne de la page.
  const aNoterIds = new Set(aNoter.map((v) => v.id));
  const lignesPassees = [...closes, ...passeesDeLaPage].filter((v) => !aNoterIds.has(v.id));
  const totalPassees = (passees.data?.meta?.total ?? passeesDeLaPage.length) + (closesAVenir.data?.meta?.total ?? 0) - aNoter.length;
  const [prochaine, ...ensuite] = aVenir;

  const nConfirmees = confirmees.data?.meta?.total ?? aVenir.length;
  const nEnAttente = demandees.data?.meta?.total ?? enAttente.length;
  const sousTitre = [
    nConfirmees > 0 ? t('sousTitre.confirmees', { n: nConfirmees }) : null,
    nEnAttente > 0 ? t('sousTitre.enAttente', { n: nEnAttente }) : null,
    aNoter.length > 0 ? t('sousTitre.avis', { n: aNoter.length }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!prochaine && enAttente.length === 0 && aNoter.length === 0 && totalPassees === 0) {
    return (
      <Cadre titre={titre}>
        <EmptyState icon={<CalendarClock className="size-8" aria-hidden="true" />} title={t('vide.titre')} description={t('vide.description')} />
      </Cadre>
    );
  }

  const blocProchaine = prochaine ? (
    <section aria-labelledby="mes-visites-prochaine">
      <Etiquette id="mes-visites-prochaine">{t('sections.prochaine')}</Etiquette>
      <div className="mt-3">
        <ProchaineVisite v={prochaine} />
      </div>
    </section>
  ) : null;
  const blocAvis =
    aNoter.length > 0 ? (
      <section aria-labelledby="mes-visites-avis">
        <Etiquette id="mes-visites-avis">{t('sections.avis')}</Etiquette>
        <div className="mt-3 space-y-3">
          {aNoter.map((v) => (
            <AvisDuClient key={v.id} v={v} maintenant={maintenant} />
          ))}
        </div>
      </section>
    ) : null;

  return (
    <Cadre titre={titre} sousTitre={sousTitre || null}>
      {blocProchaine && blocAvis ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*83.5)]">
          {blocProchaine}
          {blocAvis}
        </div>
      ) : (
        (blocProchaine ?? blocAvis)
      )}

      {enAttente.length > 0 ? (
        <section aria-labelledby="mes-visites-en-attente" className="mt-7 first:mt-0">
          <Etiquette id="mes-visites-en-attente">{t('sections.enAttente')}</Etiquette>
          <ul className="mt-3 space-y-3">
            {enAttente.map((v) => (
              <LigneEnAttente key={v.id} v={v} />
            ))}
          </ul>
        </section>
      ) : null}

      {ensuite.length > 0 ? (
        <section aria-labelledby="mes-visites-ensuite" className="mt-7 first:mt-0">
          <Etiquette id="mes-visites-ensuite">{t('sections.ensuite')}</Etiquette>
          <ul className="mt-3 space-y-3">
            {ensuite.map((v) => (
              <LigneEnAttente key={v.id} v={v} />
            ))}
          </ul>
        </section>
      ) : null}

      {totalPassees > 0 ? (
        <section aria-labelledby="mes-visites-passees" data-slot="mes-visites-passees" className="mt-7 first:mt-0">
          <Etiquette id="mes-visites-passees" compte={totalPassees}>
            {t('sections.passees')}
          </Etiquette>
          <ul className="mt-1 divide-y divide-border">
            {lignesPassees.map((v) => (
              <LignePassee key={v.id} v={v} />
            ))}
          </ul>
          {passees.data?.meta ? (
            <Pagination page={passees.data.meta.current_page} lastPage={passees.data.meta.last_page} onChange={setPage} className="mt-3" />
          ) : null}
        </section>
      ) : null}
    </Cadre>
  );
}

/**
 * La page de 720 px centrée du bureau (`calc(var(--spacing)*200)` : 720 px sous la densité ×0,9) ;
 * au téléphone, le titre est porté par l'en-tête de la coque (déclaré par `PageHeader`).
 */
function Cadre({ titre, sousTitre, children }: { readonly titre: string; readonly sousTitre?: string | null; readonly children: ReactNode }) {
  return (
    <PagePleineLargeur data-slot="mes-visites">
      <div className="mx-auto w-full max-w-[calc(var(--spacing)*200)] px-4 pt-5 pb-8 md:px-0 md:pt-0">
        <div className="max-md:hidden">
          <PageHeader title={titre} description={sousTitre ?? undefined} />
        </div>
        <div className="md:mt-6">{children}</div>
      </div>
    </PagePleineLargeur>
  );
}

function Etiquette({ id, compte, children }: { readonly id: string; readonly compte?: number; readonly children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h2 id={id} className="text-xs font-semibold tracking-surtitre text-muted-foreground uppercase">
        {children}
      </h2>
      {compte !== undefined ? (
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {compte}
        </span>
      ) : null}
    </div>
  );
}

/** « Jeudi 12 nov. · 10:00 », « Sam. 14 nov. » : le jour à Dakar, la majuscule en tête. */
function useJour() {
  const f = useFormatteurs();
  return (iso: string, jourLong = false) => {
    const jour = f.date(iso, { weekday: jourLong ? 'long' : 'short', day: 'numeric', month: 'short' });
    return jour.charAt(0).toLocaleUpperCase(f.locale) + jour.slice(1);
  };
}

/** La prochaine visite confirmée : photo, l'heure en grand, le lieu, l'agent, et trois gestes. */
function ProchaineVisite({ v }: { readonly v: PropertyVisit }) {
  const t = useTranslations('visits.client');
  const tVisits = useTranslations('visits');
  const tDetail = useTranslations('visits.detail');
  const f = useFormatteurs();
  const jour = useJour();
  const duree = useDureeEnClair();
  const toast = useToast();
  const annulation = useCancelVisit(v.id);
  const [dialogue, setDialogue] = useState<'cancel' | null>(null);
  const [proposer, setProposer] = useState(false);

  const titre = v.property?.title?.trim() || tVisits('fallbackTitle', { id: String(v.id) });
  const adresse = v.property?.address?.line?.trim() || null;
  const lieu = [adresse, t('dureeEtType', { duree: duree(v.duration_minutes ?? 30), type: tVisits(`type.${v.type ?? 'in_person'}`).toLocaleLowerCase(f.locale) })]
    .filter(Boolean)
    .join(' · ');
  const agent = v.agent ? nomAffichable(v.agent, '') : '';
  const slug = v.property?.slug ?? null;

  async function annuler(motif: string) {
    await annulation.mutateAsync({ reason: motif });
    toast.add({ title: tDetail('toasts.cancelled.title'), description: tDetail('toasts.cancelled.description'), type: 'success' });
    setDialogue(null);
  }

  return (
    <article data-slot="prochaine-visite-client" className={cn(CARTE, 'overflow-hidden')}>
      <Link href={`/app/visits/${v.id}`} aria-label={titre} className={cn('relative block h-40 outline-none focus-visible:ring-3 focus-visible:ring-ring md:h-56', !v.property?.cover_url && 'bg-muted')}>
        {v.property?.cover_url ? <Image src={v.property.cover_url} alt="" fill sizes="(width >= 48rem) 40rem, 100vw" className="object-cover" /> : null}
        <StatusBadge
          tone={VISIT_STATUS_TONE.confirmed}
          label={tVisits(VISIT_STATUS_LABEL_KEY.confirmed)}
          icon={<Check className="size-3.5" aria-hidden="true" />}
          className="absolute top-3 left-3 bg-card portee-app:bg-card"
        />
      </Link>
      <div className="p-4">
        <p className="font-display text-2xl font-semibold tracking-titre tabular-nums text-foreground">
          {v.scheduled_at ? t('jourEtHeure', { jour: jour(v.scheduled_at, true), heure: f.heure(v.scheduled_at) }) : null}
        </p>
        <p className="mt-1 text-corps font-medium text-foreground">{bienEtQuartier(v, titre)}</p>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0">{lieu}</span>
        </p>

        <div data-slot="agent-de-la-visite" className="mt-4 flex items-center gap-3 rounded-xl bg-muted/60 p-3">
          <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary-deep" aria-hidden="true">
            {agent ? initiales(agent) : '?'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-corps font-semibold text-foreground">{agent || t('agentAAttribuer')}</p>
            {agent ? (
              <p className="truncate text-sm text-muted-foreground">
                {v.agent?.agency_name?.trim() ? t('agentDe', { agence: v.agent.agency_name.trim() }) : t('votreAgent')}
              </p>
            ) : null}
          </div>
          {agent ? <GestesDeLAgent v={v} nom={agent} bien={titre} /> : null}
        </div>

        <div className="mt-3 flex flex-col gap-2 md:flex-row md:flex-wrap">
          {/* « Itinéraire », le seul geste plein, à la hauteur des deux autres (44 px, maquette a-7). */}
          <GesteItineraire v={v} className="border-0 bg-foreground text-background md:px-5" />
          {slug ? (
            <Button type="button" variant="outline" size="lg" onClick={() => setProposer(true)} className="px-3.5">
              {t('proposer')}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="lg" onClick={() => setDialogue('cancel')} className="px-3.5 text-destructive">
            {t('annuler')}
          </Button>
        </div>
      </div>

      <VisitActionDialog
        kind={dialogue}
        defaultSlot=""
        pending={annulation.isPending}
        onOpenChange={(ouvert) => {
          if (!ouvert) setDialogue(null);
        }}
        onCancel={annuler}
        onReschedule={async () => undefined}
      />
      {proposer && slug ? <ProposerUnCreneau visitId={v.id} slug={slug} onClose={() => setProposer(false)} /> : null}
    </article>
  );
}

const ROND = 'inline-flex size-11 flex-none items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring';

/**
 * Appeler et WhatsApp l'agent (maquette a-7 : contour, puis vert plein). Le numéro n'est servi qu'au
 * demandeur d'une visite confirmée à venir (`PropertyVisitResource::contactDeLAgent`) ; sans lui, aucun
 * geste. WhatsApp seulement sur un numéro déclaré WhatsApp. Aucun signalement de clic.
 */
function GestesDeLAgent({ v, nom, bien }: { readonly v: PropertyVisit; readonly nom: string; readonly bien: string }) {
  const t = useTranslations('visits.client');
  const numero = v.agent?.phone?.trim() || null;
  if (!numero) return null;
  return (
    <>
      <a href={telHref(numero)} aria-label={t('appelerAgent', { nom })} data-slot="geste-appeler-agent" className={cn(ROND, 'border border-border bg-card text-foreground')}>
        <Phone className="size-icone" strokeWidth={1.75} aria-hidden="true" />
      </a>
      {v.agent?.phone_whatsapp ? (
        <a
          href={whatsappHref(numero, t('messageAgent', { nom: v.agent?.first_name?.trim() || nom, bien }))}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('whatsappAgent', { nom })}
          data-slot="geste-whatsapp-agent"
          className={cn(ROND, 'bg-success text-success-foreground')}
        >
          <IconeWhatsApp className="size-icone" />
        </a>
      ) : null}
    </>
  );
}

/** Une demande en attente (ou une visite confirmée plus tard) : le jour, l'heure ou la tranche, le bien. */
function LigneEnAttente({ v }: { readonly v: PropertyVisit }) {
  const t = useTranslations('visits.client');
  const tTranches = useTranslations('visits.parLeTemps.tranches');
  const tVisits = useTranslations('visits');
  const f = useFormatteurs();
  const jour = useJour();
  const titre = v.property?.title?.trim() || tVisits('fallbackTitle', { id: String(v.id) });
  const tranche = v.status === 'scheduled' ? (v.preferred_window ?? null) : null;
  return (
    <li>
      <Link
        href={`/app/visits/${v.id}`}
        data-slot="ligne-en-attente"
        className={cn(CARTE, 'flex items-center gap-3 p-3 outline-none hover:border-foreground/15 focus-visible:ring-3 focus-visible:ring-ring')}
      >
        <Vignette src={v.property?.cover_url} className="size-14 rounded-xl" />
        <div className="min-w-0 flex-1">
          {v.scheduled_at ? (
            <p className="text-sm font-semibold text-foreground">
              {jour(v.scheduled_at)} ·{' '}
              {tranche ? (
                <span className="text-warning">{t('trancheAFixer', { tranche: tTranches(tranche).toLocaleLowerCase(f.locale) })}</span>
              ) : (
                <span className="tabular-nums">{f.heure(v.scheduled_at)}</span>
              )}
            </p>
          ) : null}
          <p className="truncate text-corps text-foreground">{bienEtQuartier(v, titre)}</p>
        </div>
        <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Une visite passée : le bien, le jour et la note donnée, le motif d'une annulation, le statut. */
function LignePassee({ v }: { readonly v: PropertyVisit }) {
  const t = useTranslations('visits.client');
  const tVisits = useTranslations('visits');
  const jour = useJour();
  const statut = v.status ?? 'scheduled';
  const titre = v.property?.title?.trim() || tVisits('fallbackTitle', { id: String(v.id) });
  const motif = statut === 'cancelled' ? v.cancellation_reason?.trim() || null : null;
  return (
    <li>
      <Link
        href={`/app/visits/${v.id}`}
        data-slot="ligne-passee"
        className="flex min-h-17 items-center gap-3 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <Vignette src={v.property?.cover_url} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-corps font-medium text-foreground">{bienEtQuartier(v, titre)}</p>
          <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
            {v.scheduled_at ? jour(v.scheduled_at) : null}
            {v.rating != null ? <Etoiles note={v.rating} /> : null}
          </p>
          {motif ? <p className="truncate text-ui text-muted-foreground">{t('motif', { motif })}</p> : null}
        </div>
        <StatusBadge tone={VISIT_STATUS_TONE[statut]} label={tVisits(VISIT_STATUS_LABEL_KEY[statut])} />
      </Link>
    </li>
  );
}
