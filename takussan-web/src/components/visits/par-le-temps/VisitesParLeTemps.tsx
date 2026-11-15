'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClock, Check, ChevronDown, Plus } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { EmptyState } from '@/components/feedback';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Tabs, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { REQUETE_TELEPHONE } from '@/components/visits/compte-rendu/SuiteDeLaVisite';
import { PlanifierDialog } from '@/components/visits/PlanifierUneVisite';
import { VisitsList } from '@/components/visits/VisitsList';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useCan } from '@/hooks/useCan';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useAgenceDuPersonnelActif } from '@/hooks/usePersonnelActif';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import {
  type AffinageDesVisites,
  filtreDeLAffinage,
  type LigneDuLot,
  useAbsentDepuisLaListe,
  useAttribuerEnLot,
  useComptesDesVisites,
  useConfirmerDepuisLaListe,
  useConfirmerEnLot,
  useVerdictDepuisLaListe,
  useVisitesDeLaVue,
} from '@/lib/queries/visits';
import type { Verdict } from '@/lib/visites/compte-rendu';
import {
  cleDuCompte,
  type ComptesDesVisites,
  filtreDeLaVue,
  jourADakar,
  prochaineDuJour,
  tempsLibreEntre,
  triDeLaVue,
  type VueDesVisites,
  vueDesVisites,
} from '@/lib/visites/par-le-temps';
import { jourEnClair } from '@/lib/visites/planification';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyVisit } from '@/types/visit';

import { CarteAClore, CarteDemande, CarteDuJour, CarteProchaine, type GestesDesCartes, LignePlusTard } from './cartes';
import { CARTE, type HeureProposee, Libre, TitreBloc } from './pieces';
import { BarreDeSelection, TableDesVisites, useAgentsAttribuables } from './TableDesVisites';

/** L'hydratation n'a rien à écouter : `useSyncExternalStore` ne sert qu'à distinguer serveur et client. */
const sansAbonnement = () => () => {};

/**
 * TCK-2587 — les Visites « par le temps » : Aujourd'hui · À confirmer · À clore · Plus tard, et les
 * onglets de statut d'avant (`VisitsList`, « Par statut » au téléphone, « Toutes » au bureau).
 *
 * L'URL porte la vue (`?vue=` ; `?tab=requested`, la pastille du menu, ouvre « À confirmer » :
 * `vueDesVisites`) et, au bureau, les filtres (`?agent=`, `?bien=`, `?periode=`, `?q=`). Les
 * pastilles et les onglets se comptent en UNE requête (`GET /api/property-visits/counts`), qui
 * compte exactement ce que chaque vue liste (`cleDuCompte`).
 *
 * Le personnel actif de l'agence porte les gestes (confirmer, verdict, absent, lot) ; le bailleur lit
 * les visites de ses biens sans eux, et sans « À clore » (le compte rendu est celui de l'agence).
 */
export function VisitesParLeTemps({ titre }: { readonly titre: string }) {
  const t = useTranslations('visits.parLeTemps');
  const tPlan = useTranslations('visitPlanning.plan');
  const { params, remplacer } = useVueDansLUrl();
  // Le personnel ACTIF (le profil actif, pas les rôles globaux) et son agence : celle des agents.
  // Lu APRÈS l'hydratation : le rendu serveur ne connaît pas les profils, alors que la coque, hydratée
  // avant cette frontière, les a déjà lus dans le cache du navigateur — sans ce délai, l'en-tête
  // (« Planifier une visite ») et les vues du personnel ne collent pas au HTML du serveur.
  const hydrate = useSyncExternalStore(sansAbonnement, () => true, () => false);
  const agenceLue = useAgenceDuPersonnelActif();
  const agenceDuPersonnel = hydrate ? agenceLue : null;
  const personnel = agenceDuPersonnel !== null;
  const large = useMatchesMedia('(width >= 64rem)');
  const maintenant = useMinuteCourante();
  // L'instant des bornes est figé au montage : à la minute, chaque vue changerait de clé de cache.
  const [base] = useState(() => new Date());
  const [planifier, setPlanifier] = useState(false);

  const lue = vueDesVisites(params);
  const vue: VueDesVisites = lue === 'to_close' && !personnel ? 'today' : lue;
  const affinage = affinageDeLUrl(params, base);
  const comptes = useComptesDesVisites(affinage);
  const c = comptes.data?.data ?? null;

  const vues: readonly VueDesVisites[] = personnel ? ['today', 'to_confirm', 'to_close', 'later', 'status'] : ['today', 'to_confirm', 'later', 'status'];
  // `onglet` : l'onglet de statut qu'ouvre la vue. « Toutes N » (bureau) ouvre « Toutes » — la portée
  // entière, celle que compte `counts.all` ; « Par statut » (téléphone, sans compte) ouvre le défaut.
  const choisir = (v: VueDesVisites, onglet: 'all' | null = null) => remplacer({ vue: v === 'today' ? null : v, tab: onglet });
  // La vue des statuts ne lit pas les filtres du bureau : sous un filtre, « Toutes » n'annonce aucun
  // compte plutôt qu'un compte filtré que la liste qu'il ouvre ne rendrait pas.
  const affine = Object.keys(filtreDeLAffinage(affinage)).length > 0;

  const sousTitre = c
    ? personnel
      ? t('sousTitre', { today: c.today, toConfirm: c.requested, toClose: c.to_close })
      : t('sousTitreBailleur', { today: c.today, toConfirm: c.requested })
    : undefined;

  const declaration = personnel ? (
    <DeclarerEnTete action={<ActionDEnTete libelle={tPlan('cta')} icone={<Plus className="size-5" aria-hidden />} onClick={() => setPlanifier(true)} primaire />} />
  ) : null;
  const planification = planifier ? <PlanifierDialog onClose={() => setPlanifier(false)} /> : null;

  const actions = personnel ? (
    <Button type="button" onClick={() => setPlanifier(true)}>
      <Plus className="size-4" aria-hidden />
      {tPlan('cta')}
    </Button>
  ) : null;

  if (large) {
    return (
      <div data-slot="visites-par-le-temps" className="space-y-5">
        {declaration}
        <PageHeader
          title={titre}
          description={sousTitre}
          actions={actions}
          dessous={
            <Tabs value={vue} onValueChange={(v) => choisir(v as VueDesVisites, v === 'status' ? 'all' : null)}>
              <TabsList variant="line" aria-label={t('vuesLabel')}>
                {vues.map((v) => (
                  <TabsTrigger key={v} value={v}>
                    {v === 'status' ? t('vues.statusDesktop') : t(`vues.${v}`)}
                    <CompteDeLaVue comptes={v === 'status' && affine ? null : c} vue={v} />
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        />
        {vue === 'status' ? <VisitsList /> : <VueDuBureau vue={vue} base={base} affinage={affinage} personnel={personnel} agence={agenceDuPersonnel} />}
        {planification}
      </div>
    );
  }

  return (
    <PagePleineLargeur data-slot="visites-par-le-temps">
      {declaration}
      {/* Au téléphone, l'en-tête de la coque porte le titre (déclaré par `PageHeader`) et « + ». */}
      <div className="px-4 max-md:hidden md:px-0">
        <PageHeader title={titre} description={sousTitre} actions={actions} />
      </div>
      <RangeeDePuces aria-label={t('vuesLabel')} className="sticky top-0 z-10 border-b border-border/70 bg-background md:mt-5 md:px-0">
        {vues.map((v) => (
          <PuceDeFiltre key={v} active={v === vue} compte={v === 'status' ? undefined : (compteDe(c, v) ?? undefined)} onClick={() => choisir(v)}>
            {t(`vues.${v}`)}
          </PuceDeFiltre>
        ))}
      </RangeeDePuces>
      <div className="px-4 pt-6 pb-10 md:px-0">
        {vue === 'status' ? (
          <VisitsList />
        ) : vue === 'today' ? (
          <AujourdhuiDuTelephone base={base} maintenant={maintenant} affinage={affinage} comptes={c} personnel={personnel} />
        ) : (
          <VueDuTelephone vue={vue} base={base} maintenant={maintenant} affinage={affinage} personnel={personnel} />
        )}
      </div>
      {planification}
    </PagePleineLargeur>
  );
}

/* ───────────────────────────── l'URL ───────────────────────────── */

const PERIODES = ['7', '30'] as const;

function entier(valeur: string | null): number | null {
  const n = valeur ? Number.parseInt(valeur, 10) : Number.NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Les filtres du bureau, lus dans l'URL : Agent, Bien, Période (jours à venir), recherche. */
export function affinageDeLUrl(params: Pick<URLSearchParams, 'get'>, base: Date): AffinageDesVisites & { readonly periode: (typeof PERIODES)[number] | null } {
  const p = params.get('periode');
  const periode = PERIODES.find((x) => x === p) ?? null;
  return {
    agent: entier(params.get('agent')),
    bien: entier(params.get('bien')),
    q: params.get('q')?.trim() || null,
    periode,
    jusquA: periode ? new Date(base.getTime() + Number(periode) * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
  };
}

function compteDe(c: ComptesDesVisites | null, v: VueDesVisites): number | null {
  if (!c) return null;
  return c[cleDuCompte(v)] ?? null;
}

function CompteDeLaVue({ comptes, vue }: { readonly comptes: ComptesDesVisites | null; readonly vue: VueDesVisites }) {
  const n = compteDe(comptes, vue);
  return n === null ? null : <TabsCount>{n}</TabsCount>;
}

/* ───────────────────────────── les gestes ───────────────────────────── */

function codeDeRefus(code: string | undefined): string {
  return (code ?? 'autre').replace(/\./g, '_');
}

/**
 * Les gestes posés depuis la liste : confirmer (l'heure proposée d'une tranche part en
 * `scheduled_at`), le verdict (puis « Et maintenant ? » de TCK-2581), absent.
 */
function useGestesDeLaListe(): GestesDesCartes {
  const t = useTranslations('visits.parLeTemps');
  const tPlanning = useTranslations('visitPlanning');
  const f = useFormatteurs();
  const toast = useToast();
  const router = useRouter();
  const telephone = useMatchesMedia(REQUETE_TELEPHONE);
  const confirmer = useConfirmerDepuisLaListe();
  const verdict = useVerdictDepuisLaListe();
  const absent = useAbsentDepuisLaListe();
  const [enCours, setEnCours] = useState<number | null>(null);
  const echec = (e: unknown) =>
    toast.add({ title: e instanceof ApiError && e.displayMessage ? e.displayMessage : t('erreurGeste'), type: 'error' });

  return {
    enCours,
    onConfirmer: (v: PropertyVisit, heure: HeureProposee) => {
      setEnCours(v.id);
      const instant = heure.start ?? v.scheduled_at ?? null;
      confirmer.mutate(
        { id: v.id, ...(heure.start ? { scheduled_at: heure.start } : {}) },
        {
          onSuccess: (r) => {
            const quand = instant ? `${jourEnClair(jourADakar(new Date(instant)), f.locale)} ${heure.label}` : heure.label;
            toast.add({ title: t('confirmee', { quand }), type: 'success' });
            if (r.sms_sent === false) toast.add({ title: tPlanning('smsWithheld.title'), description: tPlanning('smsWithheld.description'), type: 'warning' });
          },
          onError: echec,
          onSettled: () => setEnCours(null),
        },
      );
    },
    onVerdict: (v: PropertyVisit, outcome: Verdict) => {
      setEnCours(v.id);
      verdict.mutate(
        { id: v.id, outcome },
        {
          onSuccess: () => router.push(telephone ? `/app/visits/${v.id}?etape=et-maintenant` : `/app/visits/${v.id}`),
          onError: echec,
          onSettled: () => setEnCours(null),
        },
      );
    },
    onAbsent: (v: PropertyVisit) => {
      setEnCours(v.id);
      absent.mutate(
        { id: v.id },
        {
          onSuccess: () => toast.add({ title: t('absentEnregistre'), type: 'success' }),
          onError: echec,
          onSettled: () => setEnCours(null),
        },
      );
    },
  };
}

/* ───────────────────────────── le téléphone ───────────────────────────── */

function EtatDeLaListe({ etat, vue, onReessayer }: { readonly etat: 'chargement' | 'erreur' | 'vide'; readonly vue: Exclude<VueDesVisites, 'status'>; readonly onReessayer: () => void }) {
  const t = useTranslations('visits.parLeTemps');
  if (etat === 'chargement') {
    return (
      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }
  if (etat === 'erreur') {
    return (
      <EmptyState
        icon={<CalendarClock className="size-8" aria-hidden="true" />}
        title={t('erreur')}
        action={
          <Button type="button" variant="outline" onClick={onReessayer}>
            {t('reessayer')}
          </Button>
        }
      />
    );
  }
  return <EmptyState icon={<CalendarClock className="size-8" aria-hidden="true" />} title={t(`vide.${vue}`)} description={vue === 'today' ? t('videTodayDetail') : undefined} />;
}

type Lecture = ReturnType<typeof useVisitesDeLaVue>;

function etatDe(q: Lecture): 'chargement' | 'erreur' | 'vide' | 'liste' {
  if (q.isPending) return 'chargement';
  if (q.isError) return 'erreur';
  return (q.data?.data.length ?? 0) === 0 ? 'vide' : 'liste';
}

/** Le déroulé du jour : la prochaine visite en carte à photo, le temps libre, les suivantes. */
function DerouleDuJour({ visites, maintenant }: { readonly visites: readonly PropertyVisit[]; readonly maintenant: Date }) {
  const t = useTranslations('visits.parLeTemps');
  const f = useFormatteurs();
  const prochaine = prochaineDuJour(visites, maintenant);
  if (!prochaine) {
    // La journée est derrière : ses visites restent lisibles, sans carte « prochaine ».
    const passees = visites.filter((v) => v.status !== 'cancelled').sort((a, b) => Date.parse(a.scheduled_at ?? '') - Date.parse(b.scheduled_at ?? ''));
    return passees.length > 0 ? (
      <div className="mt-3.5 space-y-3">
        {passees.map((v) => (
          <CarteDuJour key={v.id} v={v} />
        ))}
      </div>
    ) : null;
  }
  const debut = Date.parse(prochaine.scheduled_at ?? '');
  const suivantes = visites
    .filter((v) => v.id !== prochaine.id && v.status !== 'cancelled' && !(v.status === 'scheduled' && v.preferred_window) && Date.parse(v.scheduled_at ?? '') >= debut)
    .sort((a, b) => Date.parse(a.scheduled_at ?? '') - Date.parse(b.scheduled_at ?? ''));
  const suite: ReactNode[] = [];
  let avant = prochaine;
  for (const v of suivantes) {
    const libre = tempsLibreEntre(avant, v);
    suite.push(
      <div key={v.id}>
        {libre ? <Libre>{t('libre', { de: f.heure(libre.de), a: f.heure(libre.a) })}</Libre> : <div className="h-3" />}
        <CarteDuJour v={v} />
      </div>,
    );
    avant = v;
  }
  return (
    <div className="mt-3.5">
      <CarteProchaine v={prochaine} maintenant={maintenant} />
      {suite}
    </div>
  );
}

interface AujourdhuiProps {
  readonly base: Date;
  readonly maintenant: Date;
  readonly affinage: AffinageDesVisites;
  readonly comptes: ComptesDesVisites | null;
  readonly personnel: boolean;
}

/**
 * « Aujourd'hui » au téléphone (`app-visites` a-0) : le déroulé du jour, puis À clore, les quatre
 * premières demandes À confirmer, les trois prochaines « Plus tard » et l'accès aux statuts.
 */
function AujourdhuiDuTelephone({ base, maintenant, affinage, comptes, personnel }: AujourdhuiProps) {
  const t = useTranslations('visits.parLeTemps');
  const tVisits = useTranslations('visits');
  const tPlanning = useTranslations('visitPlanning');
  const f = useFormatteurs();
  const gestes = useGestesDeLaListe();
  const duJour = useVisitesDeLaVue(filtreDeLaVue('today', base), triDeLaVue('today'), affinage, 1, 50);
  const aClore = useVisitesDeLaVue(filtreDeLaVue('to_close', base), triDeLaVue('to_close'), affinage, 1, 3, { enabled: personnel });
  const aConfirmer = useVisitesDeLaVue(filtreDeLaVue('to_confirm', base), triDeLaVue('to_confirm'), affinage, 1, 4);
  const plusTard = useVisitesDeLaVue(filtreDeLaVue('later', base), triDeLaVue('later'), affinage, 1, 3);

  const jour = f.date(base, { dateStyle: undefined, weekday: 'long', day: 'numeric', month: 'long' });
  const visitesDuJour = duJour.data?.data ?? [];
  const deroule = visitesDuJour.some((v) => v.status !== 'cancelled') ? <DerouleDuJour visites={visitesDuJour} maintenant={maintenant} /> : null;
  const demandes = aConfirmer.data?.data ?? [];
  const totalDemandes = comptes?.requested ?? aConfirmer.data?.meta.total ?? demandes.length;
  const reste = Math.max(0, totalDemandes - demandes.length);

  const statuts: readonly { readonly onglet: string; readonly libelle: string; readonly compte: number | null }[] = [
    { onglet: 'requested', libelle: tVisits('list.tabs.requested'), compte: comptes?.requested ?? null },
    { onglet: 'confirmed', libelle: tVisits('list.tabs.confirmed'), compte: comptes?.confirmed ?? null },
    { onglet: 'past', libelle: tVisits('list.tabs.past'), compte: comptes?.past ?? null },
    { onglet: 'cancelled', libelle: tVisits('list.tabs.cancelled'), compte: comptes?.cancelled ?? null },
    ...(personnel ? [{ onglet: 'unassigned', libelle: tPlanning('unassigned'), compte: comptes?.unassigned ?? null }] : []),
  ];

  return (
    <div className="space-y-9">
      <section data-slot="bloc-aujourd-hui">
        <TitreBloc note={jour}>{t('vues.today')}</TitreBloc>
        {etatDe(duJour) === 'liste' && deroule ? (
          deroule
        ) : etatDe(duJour) === 'chargement' ? (
          <span className="mt-3.5 block h-72 animate-pulse rounded-2xl bg-muted" aria-hidden="true" />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t('vide.today')}</p>
        )}
      </section>

      {personnel && (aClore.data?.data.length ?? 0) > 0 ? (
        <section data-slot="bloc-a-clore">
          <TitreBloc
            compte={comptes?.to_close ?? null}
            note={(comptes?.to_close ?? 0) <= 3 ? t('aCloreNote') : undefined}
            action={(comptes?.to_close ?? 0) > 3 ? { libelle: t('toutVoir'), href: '/app/visits?vue=to_close' } : undefined}
          >
            {t('vues.to_close')}
          </TitreBloc>
          <div className="mt-3.5 space-y-3">
            {(aClore.data?.data ?? []).map((v) => (
              <CarteAClore key={v.id} v={v} maintenant={maintenant} gestes={gestes} />
            ))}
          </div>
        </section>
      ) : null}

      {demandes.length > 0 ? (
        <section data-slot="bloc-a-confirmer">
          <TitreBloc compte={totalDemandes} action={{ libelle: t('toutVoir'), href: '/app/visits?vue=to_confirm' }}>
            {t('vues.to_confirm')}
          </TitreBloc>
          <ul className="mt-3.5 space-y-3">
            {demandes.map((v) => (
              <CarteDemande key={v.id} v={v} gestes={personnel ? gestes : null} />
            ))}
          </ul>
          {reste > 0 ? (
            <Link href="/app/visits?vue=to_confirm" scroll={false} className="mt-1 flex h-11 items-center justify-center rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring">
              {t('voirAutres', { n: reste })}
            </Link>
          ) : null}
        </section>
      ) : null}

      {(plusTard.data?.data.length ?? 0) > 0 ? (
        <section data-slot="bloc-plus-tard">
          <TitreBloc compte={comptes?.later ?? null} action={{ libelle: t('toutVoir'), href: '/app/visits?vue=later' }}>
            {t('vues.later')}
          </TitreBloc>
          <ul className={cn(CARTE, 'mt-3.5 divide-y divide-border/70 overflow-hidden')}>
            {(plusTard.data?.data ?? []).map((v) => (
              <LignePlusTard key={v.id} v={v} />
            ))}
          </ul>
        </section>
      ) : null}

      <section data-slot="bloc-par-statut">
        <p className="text-xs font-semibold tracking-surtitre text-muted-foreground uppercase">{t('parStatut')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {statuts.map((s) => (
            <Link
              key={s.onglet}
              href={`/app/visits?vue=status&tab=${s.onglet}`}
              scroll={false}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
            >
              {s.libelle}
              {s.compte !== null ? <span className="tabular-nums text-muted-foreground">{s.compte}</span> : null}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Une vue entière au téléphone : À confirmer, À clore ou Plus tard, trente par trente. */
function VueDuTelephone({
  vue,
  base,
  maintenant,
  affinage,
  personnel,
}: {
  readonly vue: Exclude<VueDesVisites, 'status' | 'today'>;
  readonly base: Date;
  readonly maintenant: Date;
  readonly affinage: AffinageDesVisites;
  readonly personnel: boolean;
}) {
  const t = useTranslations('visits.parLeTemps');
  const gestes = useGestesDeLaListe();
  const [parPage, setParPage] = useState(30);
  const q = useVisitesDeLaVue(filtreDeLaVue(vue, base), triDeLaVue(vue), affinage, 1, parPage);
  const etat = etatDe(q);
  if (etat !== 'liste') return <EtatDeLaListe etat={etat} vue={vue} onReessayer={() => void q.refetch()} />;
  const visites = q.data?.data ?? [];
  const total = q.data?.meta.total ?? visites.length;
  return (
    <div>
      {vue === 'later' ? (
        <ul className={cn(CARTE, 'divide-y divide-border/70 overflow-hidden')}>
          {visites.map((v) => (
            <LignePlusTard key={v.id} v={v} />
          ))}
        </ul>
      ) : vue === 'to_close' ? (
        <div className="space-y-3">
          {visites.map((v) => (
            <CarteAClore key={v.id} v={v} maintenant={maintenant} gestes={personnel ? gestes : null} />
          ))}
        </div>
      ) : (
        <ul className="space-y-3">
          {visites.map((v) => (
            <CarteDemande key={v.id} v={v} gestes={personnel ? gestes : null} />
          ))}
        </ul>
      )}
      {total > visites.length ? (
        <Button type="button" variant="link" className="mt-2 h-11 w-full" disabled={q.isFetching} onClick={() => setParPage((n) => n + 30)}>
          {t('voirPlus')}
        </Button>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── le bureau ───────────────────────────── */

const DECLENCHEUR = 'inline-flex h-9 flex-none items-center gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring';

function Filtre({
  libelle,
  valeur,
  actif,
  children,
}: {
  readonly libelle: string;
  readonly valeur: string;
  readonly actif: boolean;
  readonly children: (fermer: () => void) => ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger className={cn(DECLENCHEUR, actif ? 'border-primary/50 bg-secondary' : 'border-border bg-card')}>
        <span className="text-muted-foreground">{libelle}</span>
        <span className="font-medium text-foreground">{valeur}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="max-h-80 w-72 overflow-y-auto p-1">{children(() => setOuvert(false))}</PopoverContent>
    </Popover>
  );
}

function Option({ choisie, onClick, children }: { readonly choisie: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={choisie}
      onClick={onClick}
      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {choisie ? <Check className="size-4 flex-none text-primary" strokeWidth={1.75} aria-hidden="true" /> : null}
    </button>
  );
}

/** Recherche, Agent (qui attribue), Bien, Période : chacun dans l'URL. */
function FiltresDuBureau({ affinage, agence }: { readonly affinage: ReturnType<typeof affinageDeLUrl>; readonly agence: number | null }) {
  const t = useTranslations('visits.parLeTemps.bureau');
  const { remplacer } = useVueDansLUrl();
  const [terme, setTerme] = useState('');
  const agents = useAgentsAttribuables(agence);
  const biens = useApiQuery<PaginatedResponse<{ id: number; title: string }>>(['properties', 'visites', terme], '/api/properties', {
    params: { fields: { properties: ['id', 'title'] }, filter: terme ? { search: terme } : {}, per_page: 8 },
  });
  const agent = agents.data?.data.find((a) => a.id === affinage.agent);
  const bien = biens.data?.data.find((b) => b.id === affinage.bien);
  return (
    <>
      <DebouncedSearchInput
        value={affinage.q ?? ''}
        onCommit={(q) => remplacer({ q: q.trim() || null })}
        placeholder={t('recherche')}
        aria-label={t('recherche')}
        className="w-64"
      />
      {agence !== null ? (
        <Filtre libelle={t('agentFiltre')} valeur={agent ? nomAffichable(agent) : t('tous')} actif={affinage.agent != null}>
          {(fermer) => (
            <>
              <Option choisie={affinage.agent == null} onClick={() => (remplacer({ agent: null }), fermer())}>
                {t('tous')}
              </Option>
              {(agents.data?.data ?? []).map((a) => (
                <Option key={a.id} choisie={affinage.agent === a.id} onClick={() => (remplacer({ agent: a.id }), fermer())}>
                  {nomAffichable(a)}
                </Option>
              ))}
            </>
          )}
        </Filtre>
      ) : null}
      <Filtre libelle={t('bienFiltre')} valeur={bien?.title ?? t('tous')} actif={affinage.bien != null}>
        {(fermer) => (
          <div className="space-y-1">
            <DebouncedSearchInput value={terme} onCommit={setTerme} placeholder={t('bienRecherche')} aria-label={t('bienRecherche')} busy={biens.isFetching} />
            <Option choisie={affinage.bien == null} onClick={() => (remplacer({ bien: null }), fermer())}>
              {t('tous')}
            </Option>
            {(biens.data?.data ?? []).map((b) => (
              <Option key={b.id} choisie={affinage.bien === b.id} onClick={() => (remplacer({ bien: b.id }), fermer())}>
                {b.title}
              </Option>
            ))}
          </div>
        )}
      </Filtre>
      <Filtre libelle={t('periodeFiltre')} valeur={affinage.periode ? t(`periodes.${affinage.periode}`) : t('periodes.toutes')} actif={affinage.periode != null}>
        {(fermer) => (
          <>
            <Option choisie={affinage.periode == null} onClick={() => (remplacer({ periode: null }), fermer())}>
              {t('periodes.toutes')}
            </Option>
            {PERIODES.map((p) => (
              <Option key={p} choisie={affinage.periode === p} onClick={() => (remplacer({ periode: p }), fermer())}>
                {t(`periodes.${p}`)}
              </Option>
            ))}
          </>
        )}
      </Filtre>
    </>
  );
}

/**
 * Une vue au bureau : les filtres, la barre de sélection, le tableau. « Confirmer (n) » part en un
 * lot (`bulk-confirm`) avec l'heure proposée de chaque tranche ; le résultat se lit ligne par ligne —
 * une ligne refusée reste cochée, avec sa raison.
 */
function VueDuBureau({
  vue,
  base,
  affinage,
  personnel,
  agence,
}: {
  readonly vue: Exclude<VueDesVisites, 'status'>;
  readonly base: Date;
  readonly affinage: ReturnType<typeof affinageDeLUrl>;
  readonly personnel: boolean;
  readonly agence: number | null;
}) {
  const t = useTranslations('visits.parLeTemps');
  const toast = useToast();
  const gestes = useGestesDeLaListe();
  const { can: peutAttribuer } = useCan('crm.assign', agence ?? undefined, personnel && agence !== null);
  const agenceDesAgents = personnel && peutAttribuer ? agence : null;
  const [parPage, setParPage] = useState(30);
  const q = useVisitesDeLaVue(filtreDeLaVue(vue, base), triDeLaVue(vue), affinage, 1, parPage);
  const [coches, setCoches] = useState<ReadonlySet<number>>(new Set());
  const [refus, setRefus] = useState<ReadonlyMap<number, string>>(new Map());
  const [proposees, setProposees] = useState<ReadonlyMap<number, HeureProposee | null>>(new Map());
  const confirmerEnLot = useConfirmerEnLot();
  const attribuerEnLot = useAttribuerEnLot();

  const visites = q.data?.data ?? [];
  const total = q.data?.meta.total ?? visites.length;
  const visibles = visites.filter((v) => coches.has(v.id));

  const cocher = (ids: readonly number[], coche: boolean) =>
    setCoches((avant) => {
      const suite = new Set(avant);
      for (const id of ids) {
        if (coche) suite.add(id);
        else suite.delete(id);
      }
      return suite;
    });

  const lireLeLot = (lignes: readonly LigneDuLot[], meta: { readonly ok: number; readonly failed: number }) => {
    const refusees = new Map<number, string>();
    for (const l of lignes) {
      if (l.ok) continue;
      const cle = `refus.${codeDeRefus(l.code)}`;
      refusees.set(l.id, t.has(cle) ? t(cle) : t('refus.autre'));
    }
    setRefus(refusees);
    setCoches(new Set(refusees.keys()));
    toast.add({ title: t('bureau.lotResultat', meta), type: meta.failed > 0 ? 'warning' : 'success' });
  };

  const confirmerLaSelection = () => {
    confirmerEnLot.mutate(
      {
        visits: visibles.map((v) => {
          const h = v.preferred_window ? proposees.get(v.id) : null;
          return h?.start ? { id: v.id, scheduled_at: h.start } : { id: v.id };
        }),
      },
      { onSuccess: (r) => lireLeLot(r.data, r.meta), onError: () => toast.add({ title: t('erreurGeste'), type: 'error' }) },
    );
  };

  const attribuer = (ids: readonly number[], agentId: number) => {
    attribuerEnLot.mutate(
      { ids, agent_id: agentId },
      { onSuccess: (r) => lireLeLot(r.data, r.meta), onError: () => toast.add({ title: t('erreurGeste'), type: 'error' }) },
    );
  };

  const heures = visibles.filter((v) => v.status === 'scheduled' && v.preferred_window).flatMap((v) => {
    const h = proposees.get(v.id);
    return h ? [h.label] : [];
  });

  const etat = etatDe(q);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FiltresDuBureau affinage={affinage} agence={agenceDesAgents} />
        {etat === 'liste' ? <span className="ml-auto text-sm tabular-nums text-muted-foreground">{t('bureau.compte', { n: visites.length, total })}</span> : null}
      </div>
      {personnel && visibles.length > 0 ? (
        <BarreDeSelection
          n={visibles.length}
          heures={heures}
          enCours={confirmerEnLot.isPending || attribuerEnLot.isPending}
          agence={agenceDesAgents}
          onConfirmer={confirmerLaSelection}
          onAttribuer={(agentId) => attribuer(visibles.map((v) => v.id), agentId)}
          onDeselectionner={() => {
            setCoches(new Set());
            setRefus(new Map());
          }}
        />
      ) : null}
      {etat === 'liste' ? (
        <>
          <TableDesVisites
            visites={visites}
            coches={coches}
            refus={refus}
            onCocher={cocher}
            onHeureProposee={(id, h) =>
              setProposees((avant) => {
                if ((avant.get(id)?.start ?? null) === (h?.start ?? null) && avant.has(id)) return avant;
                const suite = new Map(avant);
                suite.set(id, h);
                return suite;
              })
            }
            gestes={personnel ? { onConfirmer: gestes.onConfirmer, onAttribuer: attribuer, enCours: gestes.enCours } : null}
            agence={agenceDesAgents}
          />
          {total > visites.length ? (
            <Button type="button" variant="link" className="w-full" disabled={q.isFetching} onClick={() => setParPage((n) => n + 30)}>
              {t('bureau.suivantes', { n: Math.min(30, total - visites.length) })}
            </Button>
          ) : null}
        </>
      ) : (
        <EtatDeLaListe etat={etat} vue={vue} onReessayer={() => void q.refetch()} />
      )}
    </div>
  );
}
