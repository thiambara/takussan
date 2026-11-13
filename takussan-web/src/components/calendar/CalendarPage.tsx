'use client';

import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Plus, Rss, X } from 'lucide-react';

import { FicheDEvenement, OuvrirLEvenement } from '@/components/agenda/FicheDEvenement';
import { FiltresDeLAgenda } from '@/components/agenda/FiltresDeLAgenda';
import { BandeDeLaSemaine, JourDeLAgenda } from '@/components/agenda/JourDeLAgenda';
import { MoisCompact, MoisDeLAgenda } from '@/components/agenda/MoisDeLAgenda';
import { OccupationDesBiens, useOccupationDesBiens } from '@/components/agenda/OccupationDesBiens';
import { BarrePeriode, BasculeDeVue, DureeDeLOccupation, Filtre, Legende, MenuDeVue, NavPeriode, Segmente } from '@/components/agenda/pieces';
import { SemaineDeLAgenda } from '@/components/agenda/SemaineDeLAgenda';
import { useDatesDeLAgenda } from '@/components/agenda/dates';
import { PageHeader } from '@/components/console';
import { CalendarSubscription } from '@/components/crm/CalendarSubscription';
import { ErrorState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { Skeleton } from '@/components/ui/skeleton';
import { PlanifierDialog, PlanifierUneVisite } from '@/components/visits/PlanifierUneVisite';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { usePersonnelActif } from '@/hooks/usePersonnelActif';
import { useVueDansLUrl, valeurBornee } from '@/hooks/useVueDansLUrl';
import {
  basculerType,
  lundiDe,
  modesDisponibles,
  resumeDeLaPeriode,
  typesDeLUrl,
  typesDisponibles,
  typesParDefaut,
  vueParDefaut,
  type ModeDeLAgenda,
  type PersonaDeLAgenda,
} from '@/lib/agenda/agenda';
import { eventTouchesDay, formatISODate, parseServerDate, visibleRange } from '@/lib/calendar-date';
import { decalerJour, jourEnDateLocale } from '@/lib/jour-de-l-api';
import { useBienDeLAgenda } from '@/lib/queries/agenda';
import { useCalendar } from '@/lib/queries/calendar';
import { useVisitesDeLaVue } from '@/lib/queries/visits';
import { cn } from '@/lib/utils';
import { jourADakar } from '@/lib/visites/par-le-temps';
import type { CalendarEvent, CalendarEventType, CalendarView } from '@/types/calendar';
import type { PropertyVisit } from '@/types/visit';
import { paletteFor } from './event-colors';
import { ListView } from './ListView';
import { useDatesCalendrier } from './dates';

const VIEWS: readonly CalendarView[] = ['month', 'week', 'day', 'list'];

/** Le seuil du bureau : la barre d'outils de bureau, la semaine par défaut de l'agent. */
const BUREAU = '(width >= 48rem)';
/** Le panneau droit dès 1280 ; la feuille du bas en dessous. */
const PANNEAU = '(width >= 80rem)';

/** `AAAA-MM-JJ` valide, ou `null`. */
function jourDeLUrl(valeur: string | null): string | null {
  const m = valeur ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? valeur : null;
}

/** L'écran, lu après l'hydratation : le serveur ne le connaît pas (`null`), et rien ne se lit avant. */
function useEcran(): { readonly bureau: boolean; readonly panneau: boolean } | null {
  return useSyncExternalStore(
    (onChange) => {
      const listes = [window.matchMedia(BUREAU), window.matchMedia(PANNEAU)];
      for (const l of listes) l.addEventListener('change', onChange);
      return () => listes.forEach((l) => l.removeEventListener('change', onChange));
    },
    () => {
      const bureau = window.matchMedia(BUREAU).matches;
      const panneau = window.matchMedia(PANNEAU).matches;
      return bureau ? (panneau ? ECRAN_PANNEAU : ECRAN_BUREAU) : ECRAN_TELEPHONE;
    },
    () => null,
  );
}
const ECRAN_TELEPHONE = { bureau: false, panneau: false };
const ECRAN_BUREAU = { bureau: true, panneau: false };
const ECRAN_PANNEAU = { bureau: true, panneau: true };

/**
 * TCK-591 — qui regarde l'agenda décide de ce qu'il peut y demander. Le prestataire n'a aucun bien :
 * il ne demande que ses interventions, et aucun autre type ne lui serait rendu (AC27).
 */
export type CalendarAudience = 'staff' | 'landlord' | 'provider';

export interface CalendarPageProps {
  /** Date initiale focus (défaut = aujourd'hui). */
  initialFocus?: Date;
  /** TCK-591 — décidé par la page serveur depuis les rôles (défaut : le personnel). */
  audience?: CalendarAudience;
  /** TCK-591 — « Mes rendez-vous » coché d'emblée (l'agent). */
  defaultMine?: boolean;
  /** TCK-2597 — qui regarde ; déduit de l'audience à défaut. */
  persona?: PersonaDeLAgenda;
  /** TCK-591 §6 — l'abonnement iCal du personnel d'une agence (agent, admin d'agence). */
  abonnement?: boolean;
}

function personaDe(audience: CalendarAudience, defaultMine: boolean): PersonaDeLAgenda {
  if (audience === 'provider') return 'prestataire';
  if (audience === 'landlord') return 'bailleur';
  return defaultMine ? 'agent' : 'admin';
}

/**
 * TCK-2597 — « Agenda » (maquette `app-agenda` a) : « Mon agenda » (le jour au téléphone, la semaine
 * au bureau pour l'agent ; le mois pour l'admin et le bailleur) et « Occupation des biens » — les
 * séjours sortent des rendez-vous. Tout vit dans l'URL (TCK-1740) : `mode`, `view`, `date`, `types`,
 * `property`, `mine` ; la vue choisie s'écrit toujours (son défaut dépend de l'écran et de la
 * personne : un lien copié s'ouvre ainsi pareil partout).
 */
export function CalendarPage({ initialFocus, audience = 'staff', defaultMine = false, persona: personaDonnee, abonnement = false }: CalendarPageProps) {
  const t = useTranslations('agenda');
  const tCal = useTranslations('calendar');
  const tCommon = useTranslations('common');
  const d = useDatesDeLAgenda();
  const ecran = useEcran();
  const maintenant = useMinuteCourante();
  const personnel = usePersonnelActif();
  const persona = personaDonnee ?? personaDe(audience, defaultMine);
  const { params: requete, remplacer } = useVueDansLUrl();

  // ── L'état, lu dans l'URL et borné ─────────────────────────────────────────────────────────────
  const modes = modesDisponibles(persona);
  const mode: ModeDeLAgenda = (modes as readonly string[]).includes(requete.get('mode') ?? '') ? (requete.get('mode') as ModeDeLAgenda) : 'agenda';
  const vueLue = valeurBornee(requete, 'view', VIEWS);
  const view: CalendarView = vueLue ?? vueParDefaut(persona, ecran?.bureau ?? false);
  const aujourdhui = jourADakar(maintenant);
  const jourParDefaut = initialFocus ? formatISODate(initialFocus) : aujourdhui;
  const jour = jourDeLUrl(requete.get('date')) ?? jourParDefaut;
  const focus = jourEnDateLocale(jour);
  const types = typesDeLUrl(requete.get('types'), persona, mode);
  const offerts = typesDisponibles(persona, mode);
  const bienBrut = requete.get('property');
  const propertyId = bienBrut !== null && /^[1-9]\d*$/.test(bienBrut) ? Number(bienBrut) : null;
  const mineLu = requete.get('mine');
  const mine = mineLu === '1' ? true : mineLu === '0' ? false : defaultMine;
  const staff = audience === 'staff';

  const [ouvert, setOuvert] = useState<CalendarEvent | null>(null);
  const [filtres, setFiltres] = useState(false);
  const [feuilleAbonnement, setFeuilleAbonnement] = useState(false);
  const [planifier, setPlanifier] = useState<{ readonly jour: string; readonly heure: string | null } | null>(null);
  const [titreDuBien, setTitreDuBien] = useState<{ readonly id: number; readonly titre: string } | null>(null);
  const [panneauDuJour, setPanneauDuJour] = useState(false);

  // ── Les écritures ─────────────────────────────────────────────────────────────────────────────
  const setJour = (j: string) => remplacer({ date: j === jourParDefaut ? null : j });
  const setView = (v: CalendarView) => remplacer({ view: v });
  const setMode = (m: ModeDeLAgenda) => remplacer({ mode: m === 'agenda' ? null : m, types: null, view: null });
  const setMine = (m: boolean) => remplacer({ mine: m === defaultMine ? null : m ? '1' : '0' });
  const setBien = (b: { readonly id: number; readonly titre: string } | null) => {
    setTitreDuBien(b);
    remplacer({ property: b === null ? null : String(b.id) });
  };
  const basculer = (type: CalendarEventType) => {
    const suite = basculerType(types, type, persona, mode);
    if (suite !== undefined) remplacer({ types: suite });
  };

  // ── La fenêtre lue ────────────────────────────────────────────────────────────────────────────
  const fenetre = (() => {
    if (mode === 'occupation') {
      if (ecran?.bureau) {
        const premier = `${jour.slice(0, 8)}01`;
        const dernier = decalerJour(`${decalerJour(premier, 32).slice(0, 8)}01`, -1);
        return { de: premier, a: dernier };
      }
      return { de: jour, a: decalerJour(jour, 13) };
    }
    if (view === 'day' || view === 'week') return { de: lundiDe(jour), a: decalerJour(lundiDe(jour), 6) };
    const r = visibleRange(view, focus);
    return { de: formatISODate(r.start), a: formatISODate(r.end) };
  })();
  const query = useCalendar({
    start_date: fenetre.de,
    end_date: fenetre.a,
    property_id: propertyId ?? undefined,
    types,
    mine: staff && mine,
    enabled: ecran !== null,
  });
  const evenements: readonly CalendarEvent[] = query.data?.data ?? [];

  // Les séjours du jour, quand « Mon agenda » ne les demande pas : le compte replié vers l'occupation.
  const occupationOfferte = modes.includes('occupation');
  const sejoursAPart = mode === 'agenda' && occupationOfferte && !types.includes('booking') && view !== 'list';
  const sejours = useCalendar({ start_date: jour, end_date: jour, property_id: propertyId ?? undefined, types: ['booking'], enabled: ecran !== null && sejoursAPart });
  const sejoursDuJour = sejoursAPart ? (sejours.data?.data ?? []) : null;

  // Les visites du jour, pour le téléphone et l'adresse des gestes de terrain.
  const visitesLues = useVisitesDeLaVue({ day: jour, ...(mine ? { mine: '1' } : {}) }, 'scheduled_at', {}, 1, 50, {
    enabled: ecran !== null && staff && mode === 'agenda' && types.includes('visit') && (view === 'day' || view === 'week' || view === 'month'),
  });
  const visites = new Map<number, PropertyVisit>((visitesLues.data?.data ?? []).map((v) => [v.id, v]));

  const occupation = useOccupationDesBiens({ jour, de: fenetre.de, a: fenetre.a, aujourdhui, evenements, bien: propertyId, actif: ecran !== null && mode === 'occupation' });

  const bienLu = useBienDeLAgenda(propertyId !== null && titreDuBien?.id !== propertyId ? propertyId : null);
  const bien = propertyId === null ? null : titreDuBien?.id === propertyId ? titreDuBien : { id: propertyId, titre: bienLu.data?.data[0]?.title ?? tCal('propertyFallback', { id: String(propertyId) }) };

  // ── La navigation de période ──────────────────────────────────────────────────────────────────
  const moisDecale = (sens: number) => {
    const [a, m] = jour.split('-').map(Number);
    return new Date(Date.UTC(a!, m! - 1 + sens, 1)).toISOString().slice(0, 10);
  };
  const pas = (sens: -1 | 1) => {
    if (mode === 'occupation') return ecran?.bureau ? moisDecale(sens) : decalerJour(jour, sens * 14);
    if (view === 'day') return decalerJour(jour, sens);
    if (view === 'week') return decalerJour(jour, sens * 7);
    if (view === 'list') return decalerJour(jour, sens * 30);
    return moisDecale(sens);
  };
  const periode = (() => {
    if (mode === 'occupation') return ecran?.bureau ? d.mois(jour) : d.plage(jour, decalerJour(jour, 13));
    if (view === 'day') return ecran?.bureau ? d.long(jour) : d.moisCourt(jour);
    if (view === 'week') return (ecran?.bureau ? d.semaine : d.plage)(lundiDe(jour), decalerJour(lundiDe(jour), 6));
    if (view === 'list') return t('periode.trenteJours');
    return ecran?.bureau ? d.mois(jour) : d.moisCourt(jour);
  })();

  // ── Résumé de la tête de page (bureau) ────────────────────────────────────────────────────────
  const resume = (() => {
    if (query.isPending) return undefined;
    if (mode === 'occupation') return occupation.charge ? undefined : occupation.enTete;
    const r = resumeDeLaPeriode(evenements);
    const parties = [r.visites > 0 ? t('resume.visites', { n: r.visites, aConfirmer: r.aConfirmer }) : null, r.taches > 0 ? t('resume.taches', { n: r.taches }) : null].filter(Boolean).join(' · ');
    const quand = view === 'week' ? t('resume.cetteSemaine') : view === 'month' ? d.mois(jour).split(' ')[0] : view === 'day' ? d.long(jour) : t('periode.trenteJours');
    return `${quand} : ${parties || t('resume.rien')}`;
  })();

  const nbFiltres = types.length + (propertyId !== null ? 1 : 0);
  const quiCourt = mine ? t('qui.moi') : t('qui.agence');
  const peutPlanifier = staff && personnel;
  const ouvrirPlanifier = (j: string, heure: string | null) => (peutPlanifier ? setPlanifier({ jour: j, heure }) : undefined);
  const versOccupation = occupationOfferte ? () => setMode('occupation') : null;
  const titreFiltres = ecran?.panneau ? t('filtres.titreBureau') : t('filtres.titre');

  // ── Rendu ─────────────────────────────────────────────────────────────────────────────────────
  const enTeteMobile = (
    <DeclarerEnTete
      titre={t('titre')}
      action={
        <>
          {staff ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t('qui.libelle')}
                data-testid="calendar-mine-toggle"
                className="mr-1 inline-flex h-10 flex-none items-center gap-1 rounded-full border border-border bg-card pl-3.5 pr-2.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                {quiCourt}
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setMine(true)}>{t('qui.mesRendezVous')}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMine(false)}>{t('qui.touteLAgence')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {peutPlanifier ? <ActionDEnTete libelle={t('planifier')} icone={<Plus className="size-5" aria-hidden />} onClick={() => setPlanifier({ jour, heure: null })} primaire /> : null}
        </>
      }
    />
  );

  const bascule =
    modes.length > 1 ? (
      <Segmente
        libelle={t('modes.libelle')}
        options={[
          { valeur: 'agenda', libelle: staff && !mine ? t('modes.agendaAgence') : t('modes.agenda') },
          { valeur: 'occupation', libelle: ecran?.bureau ? t('modes.occupationLong') : t('modes.occupation') },
        ]}
        actif={mode}
        onChange={setMode}
        className="md:w-100"
      />
    ) : null;

  const contenu = (() => {
    if (ecran === null || query.isPending) return <Skeleton className="mx-4 h-96 rounded-xl md:mx-0" aria-busy="true" />;
    if (query.isError) return <ErrorState message={t('erreur')} onRetry={() => void query.refetch()} retryLabel={tCommon('actions.retry')} />;
    if (mode === 'occupation') {
      return <OccupationDesBiens de={fenetre.de} a={fenetre.a} aujourdhui={aujourdhui} bureau={ecran.bureau} occupation={occupation} onOuvrir={setOuvert} />;
    }
    if (view === 'day') {
      return (
        <div className={cn(ecran.bureau && 'rounded-xl border border-border bg-card')}>
          {ecran.bureau ? null : <BandeDeLaSemaine jour={jour} aujourdhui={aujourdhui} evenements={evenements} onChoisir={setJour} />}
          <JourDeLAgenda
            jour={jour}
            aujourdhui={aujourdhui}
            evenements={evenements}
            visites={visites}
            sejoursDuJour={sejoursDuJour}
            ouvert={ouvert}
            onOuvrir={setOuvert}
            onPlanifier={ouvrirPlanifier}
            onOccupation={versOccupation}
          />
        </div>
      );
    }
    if (view === 'week') {
      return (
        <div className="max-md:px-4">
          <SemaineDeLAgenda
            jour={jour}
            aujourdhui={aujourdhui}
            maintenant={maintenant}
            evenements={evenements}
            visites={visites}
            sejoursDuJour={sejoursDuJour}
            ouvert={ouvert}
            onOuvrir={setOuvert}
            onChoisirJour={setJour}
            onPlanifier={ouvrirPlanifier}
            onOccupation={versOccupation}
          />
        </div>
      );
    }
    if (view === 'list') return <div className="max-md:px-4"><ListView events={evenements} onSelect={setOuvert} /></div>;
    // Le mois : la grille, et le jour choisi — en liste au téléphone ; au bureau, en panneau quand on
    // touche un jour (la maquette ouvre sur le mois seul).
    return ecran.bureau ? (
      <div className={cn('grid gap-4', panneauDuJour && 'xl:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*88)]')}>
        <MoisDeLAgenda
          jour={jour}
          aujourdhui={aujourdhui}
          evenements={evenements}
          onOuvrir={setOuvert}
          onChoisirJour={(j) => {
            setJour(j);
            setPanneauDuJour(true);
          }}
        />
        {panneauDuJour ? <JourChoisi jour={jour} evenements={evenements} onSelect={setOuvert} onOpenDay={() => remplacer({ view: 'day' })} onFermer={() => setPanneauDuJour(false)} /> : null}
      </div>
    ) : (
      <>
        <MoisCompact jour={jour} aujourdhui={aujourdhui} evenements={evenements} onChoisirJour={setJour} />
        <JourDeLAgenda
          occupationEnHaut
          jour={jour}
          aujourdhui={aujourdhui}
          evenements={evenements}
          visites={visites}
          sejoursDuJour={sejoursDuJour}
          ouvert={ouvert}
          onOuvrir={setOuvert}
          onPlanifier={ouvrirPlanifier}
          onOccupation={versOccupation}
        />
      </>
    );
  })();

  return (
    <PagePleineLargeur data-slot="agenda" className="max-md:pb-8 md:space-y-5">
      {enTeteMobile}
      {ecran?.bureau ? (
        <>
          <PageHeader
            title={t('titre')}
            description={resume}
            actions={
              <>
                {abonnement ? (
                  <Button type="button" variant="outline" className="gap-1.5" onClick={() => setFeuilleAbonnement(true)}>
                    <Rss className="size-4" aria-hidden="true" />
                    {t('abonnement.bouton')}
                  </Button>
                ) : null}
                {staff ? <PlanifierUneVisite variant="default" /> : null}
              </>
            }
          />
          {bascule}
          <div className="flex flex-wrap items-center gap-2">
            <NavPeriode periode={periode} onPrecedent={() => setJour(pas(-1))} onAujourdhui={() => setJour(aujourdhui)} onSuivant={() => setJour(pas(1))} />
            <span className="ml-auto" />
            {mode === 'agenda' ? <BasculeDeVue vue={view} onChange={setView} /> : null}
            {staff ? <Filtre libelle={t('filtres.qui')} valeur={quiCourt} onClick={() => setFiltres(true)} /> : null}
            {offerts.length > 1 ? <Filtre libelle={t('filtres.types')} valeur={t('filtres.typesValeur', { n: types.length, total: offerts.length })} actif onClick={() => setFiltres(true)} /> : null}
            <Filtre libelle={t('filtres.bien')} valeur={bien?.titre ?? t('filtres.tous')} actif={bien !== null} onClick={() => setFiltres(true)} />
          </div>
        </>
      ) : (
        <>
          {bascule ? <div className="px-4 pt-3">{bascule}</div> : null}
          <BarrePeriode
            periode={periode}
            onPrecedent={() => setJour(pas(-1))}
            onSuivant={() => setJour(pas(1))}
            vue={mode === 'agenda' ? <MenuDeVue vue={view} onChange={setView} /> : <DureeDeLOccupation />}
            filtres={nbFiltres}
            onFiltres={() => setFiltres(true)}
          />
        </>
      )}

      {bien !== null || types.length !== typesParDefaut(persona, mode).length ? (
        <FiltresActifs
          bien={bien?.titre ?? null}
          types={types.length !== typesParDefaut(persona, mode).length ? types.map((ty) => t(`typesPluriel.${ty}`)).join(', ') : null}
          onRetirerBien={() => setBien(null)}
        />
      ) : null}

      <div>{contenu}</div>

      {ecran?.bureau ? <Legende types={offerts} /> : null}

      <Feuille panneau={ecran?.panneau ?? false} open={ouvert !== null} onOpenChange={(o) => (o ? null : setOuvert(null))} titre={t('fiche.titre')} pied={ouvert ? <OuvrirLEvenement evenement={ouvert} /> : null}>
        {ouvert ? <FicheDEvenement evenement={ouvert} visite={ouvert.type === 'visit' ? visites.get(ouvert.id) : undefined} /> : null}
      </Feuille>

      <Feuille
        panneau={ecran?.panneau ?? false}
        open={filtres}
        onOpenChange={setFiltres}
        titre={titreFiltres}
        pied={
          <Button type="button" size="lg" className="w-full xl:w-auto" onClick={() => setFiltres(false)}>
            {t('filtres.afficher', { n: evenements.length })}
          </Button>
        }
      >
        <FiltresDeLAgenda
          qui={staff ? { mine, onChange: setMine } : null}
          typesOfferts={offerts}
          types={types}
          onBasculer={basculer}
          onReinitialiser={() => remplacer({ types: null })}
          bien={bien}
          onBien={setBien}
          onAbonnement={
            abonnement
              ? () => {
                  setFiltres(false);
                  setFeuilleAbonnement(true);
                }
              : null
          }
        />
      </Feuille>

      {abonnement ? (
        <Feuille panneau={ecran?.panneau ?? false} open={feuilleAbonnement} onOpenChange={setFeuilleAbonnement} titre={t('abonnement.titre')} pied={null}>
          <CalendarSubscription />
        </Feuille>
      ) : null}

      {planifier ? <PlanifierDialog jour={planifier.jour} {...(planifier.heure ? { heure: planifier.heure } : {})} onClose={() => setPlanifier(null)} /> : null}
    </PagePleineLargeur>
  );
}

/** La feuille du bas sous 1280, le panneau droit dès 1280. */
function Feuille({
  panneau,
  open,
  onOpenChange,
  titre,
  pied,
  children,
}: {
  readonly panneau: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly titre: string;
  readonly pied: ReactNode;
  readonly children: ReactNode;
}) {
  return panneau ? (
    <PanneauDroit open={open} onOpenChange={(o) => onOpenChange(o)} titre={titre} pied={pied}>
      {children}
    </PanneauDroit>
  ) : (
    <FeuilleDuBas open={open} onOpenChange={(o) => onOpenChange(o)} titre={titre} pied={pied}>
      {children}
    </FeuilleDuBas>
  );
}

/** Le bandeau des filtres actifs : le bien (retirable) et les types, quand ils ne sont pas ceux d'ouverture. */
function FiltresActifs({ bien, types, onRetirerBien }: { readonly bien: string | null; readonly types: string | null; readonly onRetirerBien: () => void }) {
  const t = useTranslations('calendar');
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2 text-xs md:rounded-lg md:border" data-testid="calendar-active-filters">
      <span className="font-semibold">{t('activeFilters.title')}</span>
      {bien ? (
        <button type="button" onClick={onRetirerBien} className="rounded-md bg-card px-2 py-1 shadow-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring">
          {t('activeFilters.property', { label: bien })}
        </button>
      ) : null}
      {types ? <span className="rounded-md bg-card px-2 py-1 shadow-sm">{t('activeFilters.types', { list: types })}</span> : null}
    </div>
  );
}

/** Le panneau du jour choisi, à côté du mois (bureau) : « +N autres » y mène. */
function JourChoisi({
  jour,
  evenements,
  onSelect,
  onOpenDay,
  onFermer,
}: {
  readonly jour: string;
  readonly evenements: readonly CalendarEvent[];
  readonly onSelect: (e: CalendarEvent) => void;
  readonly onOpenDay: () => void;
  readonly onFermer: () => void;
}) {
  const t = useTranslations('calendar');
  const tCommon = useTranslations('common');
  const dates = useDatesCalendrier();
  const d = useDatesDeLAgenda();
  const titreId = useId();
  const jourLocal = jourEnDateLocale(jour);
  const duJour = evenements
    .map((event) => ({ event, start: parseServerDate(event.start) ?? new Date(NaN), end: parseServerDate(event.end) }))
    .filter(({ start, end }) => eventTouchesDay({ start, end }, jourLocal))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return (
    <aside aria-labelledby={titreId} className="rounded-xl border border-border bg-card" data-testid="calendar-selected-day">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 id={titreId} className="font-display text-sm font-semibold tracking-tight text-foreground">
            {d.long(jour)}
          </h3>
          <p className="text-xs tabular-nums text-muted-foreground">{t('eventCount', { count: duJour.length })}</p>
        </div>
        <span className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="h-9 sm:h-7" onClick={onOpenDay}>
            {t('dayViewCta')}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={tCommon('actions.close')} onClick={onFermer}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </span>
      </header>
      {duJour.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t('selectedDayEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {duJour.map(({ event, start }) => (
            <li key={`${event.type}-${event.id}`}>
              <button
                type="button"
                onClick={() => onSelect(event)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                data-testid={`calendar-selected-day-row-${event.type}-${event.id}`}
              >
                <span className={cn('mt-1 size-2.5 shrink-0 rounded-full', paletteFor(event).accent)} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium tabular-nums text-muted-foreground">{event.all_day ? t('allDay') : dates.heure(start)}</span>
                  <span className="block truncate text-sm font-medium text-foreground">{event.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
