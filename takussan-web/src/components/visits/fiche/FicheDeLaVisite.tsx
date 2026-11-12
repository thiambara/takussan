'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Check, Clock, MoreHorizontal, Phone, UserCheck, UserRound, Users, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { StatusBadge } from '@/components/console';
import { PageHeader } from '@/components/console/PageHeader';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { messageDeSelection } from '@/components/crm/CustomerMatches';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AttribuerA } from '@/components/visits/par-le-temps/TableDesVisites';
import { formaterTelephone } from '@/lib/phone';
import { nomAffichable } from '@/lib/identite';
import { CARTE, GesteItineraire, nomDuVisiteur, telephoneDuVisiteur, useDureeEnClair, useHeuresProposees, type HeureProposee } from '@/components/visits/par-le-temps/pieces';
import { PastilleDeChoix, useDetailDuBien } from '@/components/visits/planification/PiecesDeLaPlanification';
import { VISIT_STATUS_LABEL_KEY, VISIT_STATUS_TONE, VISIT_TYPE_LABEL_KEY } from '@/components/visits/visit-status';
import { useAuth } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import { ageDeLaDemande } from '@/lib/demandes/boite';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { AGENT_CRM_QUERY_KEY, fetchMatchingProperties } from '@/lib/queries/agent-crm';
import { cn } from '@/lib/utils';
import { debutEffectif, finPrevue, type EtatDeLaFiche } from '@/lib/visites/etat-de-la-fiche';
import { heureMuraleADakar } from '@/lib/visites/heure-de-dakar';
import { ecartAuDebut, jourADakar } from '@/lib/visites/par-le-temps';
import { jourEnClair, jourEnToutesLettres } from '@/lib/visites/planification';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { CustomerDetail } from '@/types/customer';
import type { PropertyVisit } from '@/types/visit';

import { AutreHeure } from './AutreHeure';
import { AdresseCourte, AutresGestes, CarteCreneau, CarteEnRoute, CarteLieu, CarteVisiteur, DeclencheurDeGeste, Etapes, Etiquette, Monogramme, PastilleDeStatut, PhotoDuBien, type AutreGeste } from './pieces';

/**
 * TCK-2587, lot B — la fiche d'une visite : trois états de la maquette (« à confirmer », « jour J »,
 * « après l'heure ») et ceux qu'elle ne dessine pas (confirmée un autre jour, fin prévue passée,
 * close). `VisitDetail` reste le conteneur (lecture, mutations, dialogues) ; cette fiche ne fait que
 * montrer et appeler.
 *
 * Au téléphone (sous `md`), un seul arbre : la photo, l'heure en très grand, les cartes, « Autres
 * gestes », la barre collante du geste du moment. Au bureau, l'en-tête de page (`EnTeteDeLaFiche`,
 * posé par le conteneur AU-DESSUS de la grille du compte rendu) puis le corps. L'arbre est choisi
 * par `useMatchesMedia`, jamais doublé par le CSS : un test jsdom n'en voit qu'un.
 */

/** Les gestes que le conteneur ouvre au lecteur ; `null` : le geste n'est pas offert. */
export interface GestesDeLaFiche {
  /** Confirme, à l'instant `scheduledAt` (tranche, « Autre… ») ou à l'heure fixée (`null`). Rend `true` si l'API l'a pris. */
  readonly confirmer: ((scheduledAt: string | null) => Promise<boolean>) | null;
  readonly terminer: (() => void) | null;
  readonly absent: (() => void) | null;
  readonly replanifier: (() => void) | null;
  readonly annuler: (() => void) | null;
  readonly prendreEnCharge: (() => void) | null;
  readonly proposer: (() => void) | null;
  readonly attribuer: { readonly agence: number; readonly onChoisir: (agentId: number) => void } | null;
  readonly enCours: boolean;
}

export interface FicheDeLaVisiteProps {
  readonly visite: PropertyVisit;
  readonly etat: EtatDeLaFiche;
  readonly maintenant: Date;
  readonly commenceeA: Date | null;
  readonly gestes: GestesDeLaFiche;
  /** Le personnel qui gère la visite (`abilities.manage`) : messages au visiteur, sa fiche. */
  readonly personnel: boolean;
  /** Le lecteur est le visiteur : sa propre carte n'a rien à lui dire. */
  readonly visiteur: boolean;
  /** Le compte rendu se fait depuis la fiche (la clé `report`, TCK-2581). */
  readonly compteRendu: boolean;
  /** « — Sokhna » au bas des messages WhatsApp ; `null` : pas de signature. */
  readonly signature: string | null;
  /** Bureau : la colonne du visiteur (« Ses visites ») ; faux quand le compte rendu prend la droite. */
  readonly colonne: boolean;
  /**
   * Le personnel ACTIF de l'agence lit la fiche du client (« Cherche », « Étape », biens
   * correspondants) — jamais le bailleur, à qui la visite ne montre que le nom et le téléphone
   * (décision de TCK-2589/2590).
   */
  readonly ficheClient: boolean;
  readonly erreur: string | null;
  readonly onCommencer: () => void;
  readonly autreHeure: boolean;
  readonly onAutreHeure: (ouverte: boolean) => void;
}

/* ───────────────────────────── la lecture commune ───────────────────────────── */

const POINTS: Record<EtatDeLaFiche, string> = {
  'a-confirmer': 'bg-warning',
  'jour-j': 'bg-success',
  confirmee: 'bg-success',
  'en-cours': 'bg-primary',
  apres: 'bg-warning',
  terminee: 'bg-foreground',
  annulee: 'bg-destructive',
  absent: 'bg-destructive',
};

const STATUTS: Record<EtatDeLaFiche, string> = {
  'a-confirmer': 'aConfirmer',
  'jour-j': 'confirmee',
  confirmee: 'confirmee',
  'en-cours': 'enCours',
  apres: 'apres',
  terminee: 'terminee',
  annulee: 'annulee',
  absent: 'absent',
};

const ETAPE: Record<EtatDeLaFiche, number | null> = {
  'a-confirmer': 0,
  'jour-j': 1,
  confirmee: 1,
  'en-cours': 2,
  apres: 2,
  terminee: 3,
  annulee: null,
  absent: null,
};

const ACTIVE: ReadonlySet<EtatDeLaFiche> = new Set(['a-confirmer', 'jour-j', 'confirmee', 'en-cours', 'apres']);

/** « mardi 10 novembre » (fr), « Tuesday, November 10 » (en) : le jour dans une phrase. */
function jourDansLaPhrase(jour: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Dakar' }).format(new Date(`${jour}T12:00:00Z`));
}

/**
 * « mercredi » tant que le jour tombe dans les six jours qui viennent (sans ambiguïté), sinon
 * « mercredi 18 novembre » : la phrase de la demande, comme la maquette (« mercredi après-midi »).
 */
function jourProche(jour: string, maintenant: Date, locale: string): string {
  const ecart = (Date.parse(`${jour}T12:00:00Z`) - Date.parse(`${jourADakar(maintenant)}T12:00:00Z`)) / 86_400_000;
  if (ecart < 0 || ecart > 6) return jourDansLaPhrase(jour, locale);
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'Africa/Dakar' }).format(new Date(`${jour}T12:00:00Z`));
}

/** « mer. 11 » (fr), « Wed 11 » (en) : le jour dans la barre qui confirme. */
function jourDeLaBarre(jour: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', timeZone: 'Africa/Dakar' }).format(new Date(`${jour}T12:00:00Z`));
}

/** L'id du texte « Possible à partir de HH:MM », que le bouton « Absent » grisé désigne. */
const ID_ABSENT_DES = 'fiche-absent-des';

/**
 * « Absent » ne s'enregistre qu'une fois l'heure de la visite atteinte — la règle de
 * `PropertyVisitController::noShow` (`scheduled_at <= now()`). Rend l'heure à partir de laquelle il le
 * sera, ou `null` quand il l'est déjà (ou qu'aucune heure n'est fixée : le serveur tranche).
 */
function absentPossibleA(v: PropertyVisit, maintenant: Date): string | null {
  if (!v.scheduled_at) return null;
  return Date.parse(v.scheduled_at) <= maintenant.getTime() ? null : v.scheduled_at;
}

const capitaliser = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
const minuscule = (s: string) => s.charAt(0).toLocaleLowerCase() + s.slice(1);

/** Ce que la fiche lit de la visite, une fois pour les deux arbres. */
function useLecture(p: FicheDeLaVisiteProps) {
  const { visite: v, etat, maintenant, commenceeA, personnel, signature } = p;
  const t = useTranslations('visits.fiche');
  const tVisits = useTranslations('visits');
  const tPlt = useTranslations('visits.parLeTemps');
  const f = useFormatteurs();
  const locale = useLocale();
  const duree = useDureeEnClair();

  const nomLu = nomDuVisiteur(v);
  const nom = nomLu ?? tVisits('detail.requester.anonymousName');
  const prenom = v.customer?.first_name?.trim() || nomLu?.split(/\s+/)[0] || null;
  const brut = v.visitor_display?.phone ?? v.customer?.phone ?? v.visitor?.phone ?? v.visitor_phone ?? null;
  const numero = telephoneDuVisiteur(v);
  const email = v.customer?.email ?? v.visitor?.email ?? v.visitor_email ?? null;
  const jour = v.scheduled_at ? jourADakar(new Date(v.scheduled_at)) : null;
  const aujourdhui = jour !== null && jour === jourADakar(maintenant);
  const heure = v.scheduled_at ? f.heure(v.scheduled_at) : '';
  const debut = debutEffectif(v, commenceeA);
  const fin = Number.isFinite(debut) ? f.heure(finPrevue(v, commenceeA)) : '';
  const minutes = v.duration_minutes && v.duration_minutes > 0 ? v.duration_minutes : 30;
  const type = tVisits(VISIT_TYPE_LABEL_KEY[v.type ?? 'in_person']);
  const tranche = v.status === 'scheduled' ? (v.preferred_window ?? null) : null;
  const rang = v.visitor_display?.visits_on_property ? tPlt('rang', { n: v.visitor_display.visits_on_property }) : null;

  /** « 10 h 57 » dans un message : l'heure de Dakar, lue de l'instant. */
  const heureParlee = (iso: string) => {
    const [h, mm] = heureMuraleADakar(new Date(iso)).slice(11, 16).split(':');
    return t('messages.heure', { h: String(Number(h)), mm });
  };
  const message = (corps: string) =>
    [prenom ? t('messages.bonjour', { prenom }) : t('messages.bonjourSansNom'), corps, signature ? t('messages.signature', { signature }) : null].filter(Boolean).join(' ');
  const messageEnRoute = v.scheduled_at ? message(t('messages.enRoute', { heure: heureParlee(v.scheduled_at) })) : null;
  const messageRetard = v.scheduled_at ? message(t('messages.retard', { minutes: 10, heure: heureParlee(v.scheduled_at) })) : null;
  // Les messages au visiteur partent du personnel, et seulement vers un numéro joignable.
  const peutEcrire = personnel && numero !== null;

  const ecart = v.scheduled_at ? ecartAuDebut(new Date(debut).toISOString(), maintenant) : null;
  const pastille =
    etat === 'jour-j' && ecart?.sens === 'dans'
      ? tPlt('dans', { duree: duree(ecart.minutes) })
      : etat === 'en-cours' && ecart?.sens === 'depuis'
        ? tPlt('depuis', { duree: duree(ecart.minutes) })
        : null;

  const jourCourt = jour ? capitaliser(jourEnClair(jour, locale)) : '';
  const surtitre =
    etat === 'a-confirmer'
      ? v.created_at
        ? t('surtitre.demandeRecue', { age: ageEnClair(t, ageDeLaDemande(v.created_at, maintenant)) })
        : null
      : jour
        ? aujourdhui
          ? t('surtitre.aujourdhui', { jour: jourDansLaPhrase(jour, locale) })
          : jourEnToutesLettres(jour, locale)
        : null;
  const titre = etat === 'a-confirmer' ? jourCourt : heure;
  const sousTitre: ReactNode =
    etat === 'a-confirmer' ? (
      <>
        {tranche ? (
          <span className="font-semibold text-warning">{tPlt('heureAFixer', { tranche: tPlt(`tranches.${tranche}`) })}</span>
        ) : (
          <span className="font-semibold tabular-nums text-foreground">{heure}</span>
        )}
        {' · '}
        {t('sous.dureeType', { duree: duree(minutes), type: minuscule(type) })}
      </>
    ) : etat === 'en-cours' && commenceeA ? (
      t('sous.commencee', { debut: f.heure(commenceeA), fin })
    ) : (
      t('sous.finPrevue', { duree: duree(minutes), type: minuscule(type), heure: fin })
    );

  return {
    nom,
    prenom,
    brut,
    numero,
    email,
    jour,
    aujourdhui,
    heure,
    fin,
    minutes,
    type,
    tranche,
    rang,
    messageEnRoute,
    messageRetard,
    peutEcrire,
    pastille,
    surtitre,
    titre,
    sousTitre,
    jourCourt,
    heureDe: (iso: string) => f.heure(iso),
    statut: t(`statut.${STATUTS[etat]}`),
    point: POINTS[etat],
    etape: ETAPE[etat],
    duree,
  };
}

type Lecture = ReturnType<typeof useLecture>;

function ageEnClair(t: ReturnType<typeof useTranslations>, age: ReturnType<typeof ageDeLaDemande>): string {
  if (age.unite === 'instant') return t('age.justNow');
  if (age.unite === 'minutes') return t('age.minutes', { n: age.valeur });
  if (age.unite === 'heures') return t('age.hours', { n: age.valeur });
  return t('age.days', { n: age.valeur });
}

/** Prix et référence du bien (`GET /api/properties/{id}`), pour le personnel seulement. */
function useDetailDuBienDeLaVisite(v: PropertyVisit, actif: boolean): string | null {
  const detailDe = useDetailDuBien();
  // Un `show` rend la ressource entière et ignore `fields` (P60.03) : la même lecture, et la même clé,
  // que la saisie d'une demande (`SaisirUneDemande`).
  const lu = useApiQuery<ApiResponse<{ readonly id: number; readonly price?: number | string | null; readonly currency?: string | null; readonly contract_type?: string | null; readonly reference_number?: string | null }>>(
    ['saisie-demande', 'bien', v.property_id],
    cheminApi`/api/properties/${v.property_id}`,
    { enabled: actif && v.property_id > 0 },
  );
  const bien = lu.data?.data.id === v.property_id ? lu.data.data : null;
  return bien ? detailDe(bien) : null;
}

/** Les « Autres gestes » de l'état : le menu « ⋯ » de la maquette, écrit en entier. */
function useAutresGestes(p: FicheDeLaVisiteProps, l: Lecture, sansReplanifier = false): AutreGeste[] {
  const t = useTranslations('visits.fiche.autres');
  const { gestes: g, etat } = p;
  if (!ACTIVE.has(etat)) return [];
  const liste: AutreGeste[] = [];
  if (g.prendreEnCharge) liste.push({ cle: 'prendre', libelle: t('prendreEnCharge'), detail: t('prendreEnChargeDetail'), icone: UserCheck, onClick: g.prendreEnCharge, disabled: g.enCours });
  if (g.proposer) liste.push({ cle: 'proposer', libelle: t('proposer'), detail: t('proposerDetail'), icone: CalendarClock, onClick: g.proposer });
  // Une demande dont l'heure est passée se confirme encore (heure fixée) : le geste reste écrit.
  if (g.confirmer && (etat === 'en-cours' || etat === 'apres')) {
    const confirmer = g.confirmer;
    liste.push({ cle: 'confirmer', libelle: t('confirmer'), icone: Check, onClick: () => void confirmer(null), disabled: g.enCours });
  }
  if (g.replanifier && !sansReplanifier) {
    liste.push({
      cle: 'replanifier',
      libelle: t('replanifier'),
      detail: etat === 'a-confirmer' ? t('replanifierPrevenu', { prenom: l.prenom ?? l.nom }) : t('replanifierDetail'),
      icone: CalendarClock,
      onClick: g.replanifier,
    });
  }
  if (l.peutEcrire && l.messageRetard && (etat === 'jour-j' || etat === 'en-cours') && l.numero) {
    liste.push({ cle: 'retard', libelle: t('retard'), detail: t('retardDetail'), icone: Clock, href: whatsappHref(l.numero, l.messageRetard), externe: true });
  }
  if (g.attribuer && (etat === 'a-confirmer' || etat === 'confirmee')) {
    const { agence, onChoisir } = g.attribuer;
    liste.push({
      cle: 'attribuer',
      libelle: t('attribuer'),
      icone: Users,
      disabled: g.enCours,
      envelopper: (declencheur) => <AttribuerA agence={agence} onChoisir={onChoisir} declencheur={declencheur} disabled={g.enCours} />,
    });
  }
  // Une demande par tranche dont le jour est passé se termine encore (TCK-1375) : le geste reste écrit.
  if (g.terminer && etat === 'a-confirmer') liste.push({ cle: 'terminer', libelle: t('terminer'), icone: Check, onClick: g.terminer, disabled: g.enCours });
  if (g.annuler) liste.push({ cle: 'annuler', libelle: t('annuler'), detail: t('annulerDetail'), icone: X, danger: true, onClick: g.annuler });
  return liste;
}

/* ───────────────────────────── les cartes d'état ───────────────────────────── */

/**
 * Suivi du lot A (TCK-2587) — l'agent de la visite est parti ou suspendu : `/slots` refuse son
 * `agent_id`. La ligne le dit ; « Réattribuer » quand le geste existe (`crm.assign`), sinon rien
 * d'inventé. Aucune heure de l'appelant en repli : ce ne sont pas celles de la visite.
 */
function AgentIndisponible({ g, avecGeste = true, className }: { readonly g: GestesDeLaFiche; readonly avecGeste?: boolean; readonly className?: string }) {
  const t = useTranslations('visits.parLeTemps');
  return (
    <div data-slot="agent-indisponible" className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      <p role="status" className="text-ui font-medium text-warning">
        {t('agentIndisponible')}
      </p>
      {avecGeste && g.attribuer ? (
        <AttribuerA
          agence={g.attribuer.agence}
          onChoisir={g.attribuer.onChoisir}
          disabled={g.enCours}
          declencheur={
            <Button variant="outline" size="sm">
              {t('reattribuer')}
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

/** Avant : ce que le visiteur a demandé, et les heures libres ce jour-là. */
function CarteDemandeRecue({
  v,
  l,
  proposees,
  choisie,
  onChoisir,
  onAutre,
  gestes,
}: {
  readonly v: PropertyVisit;
  readonly l: Lecture;
  readonly proposees: ReturnType<typeof useHeuresProposees>;
  readonly choisie: HeureProposee | null;
  readonly onChoisir: ((h: HeureProposee) => void) | null;
  readonly onAutre: (() => void) | null;
  readonly gestes: GestesDeLaFiche;
}) {
  const t = useTranslations('visits.fiche.demande');
  const tPlt = useTranslations('visits.parLeTemps');
  const locale = useLocale();
  const jourLong = l.jour ? jourEnToutesLettres(l.jour, locale) : null;
  const quand = jourLong ? (l.tranche ? t('quand', { jour: jourLong, tranche: minuscule(tPlt(`tranches.${l.tranche}`)) }) : `${jourLong} · ${l.heure}`) : null;
  return (
    <section data-slot="carte-demande-recue" className={cn(CARTE, 'p-4')}>
      <Etiquette>{t('titre')}</Etiquette>
      {quand ? <p className="mt-2.5 text-corps font-semibold text-foreground">{quand}</p> : null}
      {v.notes?.trim() ? (
        <p className="mt-2.5 rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5 text-corps leading-relaxed whitespace-pre-line text-foreground">« {v.notes.trim()} »</p>
      ) : null}
      {onChoisir && l.tranche ? (
        <>
          <p className="mt-5 text-sm font-medium text-foreground">{t('heuresLibres')}</p>
          {proposees.etat === 'agent-indisponible' ? <AgentIndisponible g={gestes} className="mt-2.5" /> : null}
          {proposees.etat === 'attente' ? <p className="mt-2.5 text-ui text-muted-foreground">{t('chargement')}</p> : null}
          {proposees.etat === 'aucune' ? <p className="mt-2.5 text-ui text-muted-foreground">{t('aucune')}</p> : null}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {proposees.heures.slice(0, 3).map((h) => (
              <PastilleDeChoix key={h.label} actif={choisie?.label === h.label} onChoisir={() => onChoisir(h)}>
                {h.label}
              </PastilleDeChoix>
            ))}
            {onAutre && proposees.etat !== 'agent-indisponible' ? (
              <PastilleDeChoix actif={false} onChoisir={onAutre} className="border-dashed">
                {t('autre')}
              </PastilleDeChoix>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

/** Après l'heure : où on en est, et ce que font les deux boutons du bas. */
function CarteEnCours({ p, l }: { readonly p: FicheDeLaVisiteProps; readonly l: Lecture }) {
  const t = useTranslations('visits.fiche.enCours');
  const f = useFormatteurs();
  const { visite: v, maintenant, commenceeA, etat } = p;
  const debut = debutEffectif(v, commenceeA);
  const ecoule = Math.max(0, Math.floor((maintenant.getTime() - debut) / 60_000));
  const qui = l.prenom ?? l.nom;
  const absentDes = absentPossibleA(v, maintenant);
  return (
    <section data-slot="carte-en-cours" className={cn(CARTE, 'p-4')}>
      {etat === 'en-cours' ? (
        <>
          <div className="flex items-baseline justify-between">
            <Etiquette>{t('titre')}</Etiquette>
            <span className="text-sm font-semibold tabular-nums text-foreground">{t('progression', { n: Math.min(ecoule, l.minutes), total: l.minutes })}</span>
          </div>
          <progress value={Math.min(ecoule, l.minutes)} max={l.minutes} aria-label={t('titre')} className="sr-only" />
          <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (ecoule / l.minutes) * 100)}%` }} />
          </span>
        </>
      ) : (
        <Etiquette>{t('apres')}</Etiquette>
      )}
      {p.compteRendu && p.gestes.terminer ? <p className="mt-4 text-corps leading-relaxed text-encre-douce">{t('terminer')}</p> : null}
      {p.gestes.absent ? (
        <p id={absentDes ? ID_ABSENT_DES : undefined} className={cn('text-corps leading-relaxed text-encre-douce', p.compteRendu && p.gestes.terminer ? 'mt-1.5' : 'mt-4')}>
          {absentDes ? t('absentDes', { heure: f.heure(absentDes) }) : t('absent', { prenom: qui })}
        </p>
      ) : null}
    </section>
  );
}

/** Le créneau : date, heure, durée, type, accompagnement, référence — et le motif d'une annulation. */
function useLignesDuCreneau(p: FicheDeLaVisiteProps, l: Lecture, bureau: boolean) {
  const t = useTranslations('visits.fiche.creneau');
  const tTranche = useTranslations('visits.fiche.tranches');
  const tDetail = useTranslations('visits.detail');
  const locale = useLocale();
  const v = p.visite;
  const lignes: (readonly [string, ReactNode])[] = [
    // Maquette : « Mer. 11 nov. 2026 » — l'année, au téléphone comme au bureau.
    [t('date'), l.jour ? `${capitaliser(jourEnClair(l.jour, locale))} ${l.jour.slice(0, 4)}` : '—'],
    [
      t('heure'),
      l.tranche ? (
        <span className="text-warning">{bureau ? t('aFixerBureau', { tranche: tTranche(l.tranche) }) : t('aFixer', { tranche: capitaliser(tTranche(l.tranche)) })}</span>
      ) : (
        l.heure || '—'
      ),
    ],
    [t('duree'), l.duree(l.minutes)],
    [t('type'), l.type],
    [t('accompagnement'), v.agent ? nomAffichable(v.agent, tDetail('assignedAgent')) : t('nonAttribuee')],
    [t('reference'), `#${v.id}`],
  ];
  const motif = v.cancellation_reason?.trim() ? (
    <div className="mt-4 border-t border-border/70 pt-4">
      <p className="text-ui text-muted-foreground">{tDetail('cancellationReason')}</p>
      <p className="mt-0.5 text-corps text-pretty text-foreground">{v.cancellation_reason}</p>
    </div>
  ) : null;
  return { lignes, motif };
}

/* ───────────────────────────── le téléphone ───────────────────────────── */

function FicheTelephone(p: FicheDeLaVisiteProps) {
  const t = useTranslations('visits.fiche');
  const tPlt = useTranslations('visits.parLeTemps');
  const locale = useLocale();
  const l = useLecture(p);
  const { visite: v, etat, gestes: g, personnel } = p;
  const detail = useDetailDuBienDeLaVisite(v, personnel);
  const proposees = useHeuresProposees(v, (iso) => l.heureDe(iso), etat === 'a-confirmer' && g.confirmer !== null);
  const [choisie, setChoisie] = useState<HeureProposee | null>(null);
  const heureChoisie = choisie ?? proposees.heures[0] ?? null;
  const autres = useAutresGestes(p, l);
  const { lignes, motif } = useLignesDuCreneau(p, l, false);
  const messageGenerique = useMessageGenerique(v, l);

  let barre: ReactNode = null;
  // Deux gestes : le secondaire (contour) à la largeur de son libellé, comme la maquette.
  let secondaire: 'premier' | 'dernier' | undefined;
  if (etat === 'a-confirmer' && g.confirmer) {
    const confirmer = g.confirmer;
    barre =
      heureChoisie ? (
        <Button className="w-full tabular-nums" disabled={g.enCours} onClick={() => void confirmer(heureChoisie.start)}>
          <Check className="size-icone" aria-hidden="true" />
          {t('barre.confirmerPour', { jour: l.jour ? jourDeLaBarre(l.jour, locale) : '', heure: heureChoisie.label })}
        </Button>
      ) : proposees.etat === 'agent-indisponible' && g.attribuer ? (
        // Suivi du lot A : sans agent disponible, le geste du bas est de réattribuer la visite.
        <AttribuerA
          agence={g.attribuer.agence}
          onChoisir={g.attribuer.onChoisir}
          disabled={g.enCours}
          declencheur={<Button className="w-full">{tPlt('reattribuer')}</Button>}
        />
      ) : (
        <Button className="w-full" disabled={g.enCours} onClick={() => p.onAutreHeure(true)}>
          {t('barre.confirmerChoisir')}
        </Button>
      );
  } else if (etat === 'jour-j' && personnel) {
    secondaire = 'dernier';
    barre = (
      <>
        {l.peutEcrire && l.numero && l.messageEnRoute ? (
          <a
            href={whatsappHref(l.numero, l.messageEnRoute)}
            target="_blank"
            rel="noopener noreferrer"
            data-slot="geste-en-route"
            className={cn(buttonVariants(), 'bg-success px-3 text-success-foreground hover:bg-success')}
          >
            <IconeWhatsApp className="size-icone" />
            {t('barre.enRoute')}
          </a>
        ) : null}
        <Button variant="outline" className="px-4" onClick={p.onCommencer}>
          {t('barre.commencer')}
        </Button>
      </>
    );
  } else if ((etat === 'en-cours' || etat === 'apres') && (g.absent || g.terminer)) {
    const absentDes = absentPossibleA(v, p.maintenant);
    secondaire = 'premier';
    barre = (
      <>
        {g.absent ? (
          <Button variant="outline" className="px-4" disabled={g.enCours || absentDes !== null} aria-describedby={absentDes ? ID_ABSENT_DES : undefined} onClick={g.absent}>
            {t('barre.absent')}
          </Button>
        ) : null}
        {g.terminer ? (
          <Button disabled={g.enCours} onClick={g.terminer}>
            {t('barre.terminer')}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <PagePleineLargeur data-slot="fiche-telephone" className="pb-10">
      <DeclarerEnTete forme="detail" titre={t('titre')} repli="/app/visits" />
      <div className="relative h-40">
        <PhotoDuBien src={v.property?.cover_url} className="absolute inset-0" />
        <span className="absolute top-4 left-4">
          <PastilleDeStatut libelle={l.statut} point={l.point} />
        </span>
      </div>
      <div className="relative -mt-5 rounded-t-3xl bg-background px-4 pt-5">
        {l.surtitre ? <p className="text-xs font-semibold uppercase tracking-surtitre text-muted-foreground">{l.surtitre}</p> : null}
        <div className="mt-2 flex items-end justify-between gap-3">
          <h1 className={cn('font-display text-affiche-44 leading-none font-semibold tracking-titre text-foreground', etat !== 'a-confirmer' && 'tabular-nums')}>
            <span className="sr-only">{v.property?.title ? `${v.property.title} — ` : null}</span>
            {l.titre}
          </h1>
          {l.pastille ? (
            <span data-slot="pastille-de-l-heure" className="mb-1 inline-flex h-8 flex-none items-center rounded-full bg-primary/10 px-3 text-sm font-semibold text-primary-deep">
              {l.pastille}
            </span>
          ) : null}
        </div>
        <p className="mt-2.5 text-corps text-encre-douce">{l.sousTitre}</p>
        {l.etape !== null ? <Etapes courant={l.etape} /> : null}
      </div>
      <div className="space-y-4 px-4 pt-6">
        {etat === 'a-confirmer' && !p.visiteur ? (
          <CarteDemandeRecue
            v={v}
            l={l}
            proposees={proposees}
            choisie={heureChoisie}
            onChoisir={g.confirmer ? setChoisie : null}
            onAutre={g.confirmer ? () => p.onAutreHeure(true) : null}
            gestes={g}
          />
        ) : null}
        <CarteLieu v={v} detail={detail} itinerairePlein={etat === 'jour-j' || etat === 'en-cours'} />
        {!p.visiteur ? (
          <CarteVisiteur
            nom={l.nom}
            numero={l.numero ?? l.brut}
            email={l.numero || l.brut ? null : l.email}
            rang={personnel ? l.rang : null}
            ficheHref={personnel && v.customer?.id ? `/app/customers/${v.customer.id}` : null}
            messageWhatsApp={messageGenerique}
          />
        ) : null}
        {etat === 'jour-j' && l.peutEcrire && l.messageEnRoute ? <CarteEnRoute message={l.messageEnRoute} /> : null}
        {(etat === 'en-cours' || etat === 'apres') && personnel ? <CarteEnCours p={p} l={l} /> : null}
        <CarteCreneau titre={t('creneau.titre')} lignes={lignes}>
          {motif}
        </CarteCreneau>
        {p.erreur ? (
          <p role="alert" className="text-sm text-destructive">
            {p.erreur}
          </p>
        ) : null}
        <AutresGestes gestes={autres} />
      </div>
      {barre ? (
        // Le complément du team-lead : des boutons de 48 px, comme la maquette (le défaut de la barre reste 44).
        <BarreDAction secondaire={secondaire} taille="action">
          {barre}
        </BarreDAction>
      ) : null}
      {p.autreHeure && g.confirmer ? <DialogueAutreHeure p={p} l={l} /> : null}
    </PagePleineLargeur>
  );
}

/** Le message WhatsApp de la carte du visiteur : celui de la liste (« au sujet de votre visite »). */
function useMessageGenerique(v: PropertyVisit, l: Lecture): string {
  const tPlt = useTranslations('visits.parLeTemps');
  return tPlt('messageWhatsApp', { nom: l.prenom ?? l.nom, bien: v.property?.title ?? '' });
}

function DialogueAutreHeure({ p, l }: { readonly p: FicheDeLaVisiteProps; readonly l: Lecture }) {
  const confirmer = p.gestes.confirmer;
  if (!confirmer) return null;
  return (
    <AutreHeure
      propertyId={p.visite.property_id}
      agentId={p.visite.agent_id ?? null}
      jourInitial={l.jour}
      enCours={p.gestes.enCours}
      erreur={p.erreur}
      onConfirmer={(start) => void confirmer(start).then((ok) => ok && p.onAutreHeure(false))}
      onFermer={() => p.onAutreHeure(false)}
    />
  );
}

/* ───────────────────────────── le bureau ───────────────────────────── */

/** Le menu « ⋯ » du bureau : les autres gestes, en liste. */
function PlusDActions({ gestes }: { readonly gestes: readonly AutreGeste[] }) {
  const t = useTranslations('visits.fiche.bureau');
  const [ouvert, setOuvert] = useState(false);
  if (gestes.length === 0) return null;
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger render={<Button variant="outline" size="icon" aria-label={t('plusDActions')} />}>
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 overflow-hidden p-0">
        <ul className="divide-y divide-border/70">
          {gestes.map((g) => (
            <li key={g.cle}>
              <DeclencheurDeGeste
                g={g.onClick ? { ...g, onClick: () => { setOuvert(false); g.onClick?.(); } } : g}
                className="hover:bg-muted"
              />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * L'en-tête de page du bureau, et la barre du jour J dessous. Posé par le conteneur au-dessus de la
 * grille du compte rendu (TCK-2581) : le titre court sur toute la largeur.
 */
export function EnTeteDeLaFiche(p: FicheDeLaVisiteProps) {
  const t = useTranslations('visits.fiche');
  const tPlt = useTranslations('visits.parLeTemps');
  const tFil = useTranslations('console.pageHeader');
  const locale = useLocale();
  const l = useLecture(p);
  const { visite: v, etat, gestes: g, personnel } = p;
  const proposees = useHeuresProposees(v, (iso) => l.heureDe(iso), etat === 'a-confirmer' && g.confirmer !== null);
  const replanifierEnTete = personnel && etat !== 'a-confirmer' && ACTIVE.has(etat) && g.replanifier !== null;
  const autres = useAutresGestes(p, l, replanifierEnTete);
  const quartier = v.property?.address?.neighborhood?.trim();
  const bien = v.property?.title ? (quartier ? `${v.property.title} · ${quartier}` : v.property.title) : t('titre');

  const titre =
    etat === 'a-confirmer'
      ? t('bureau.titre.aConfirmer')
      : etat === 'terminee'
        ? t('bureau.titre.terminee')
        : etat === 'annulee'
          ? t('bureau.titre.annulee')
          : etat === 'absent'
            ? t('bureau.titre.absent')
            : t('bureau.titre.aLHeure', { heure: l.heure });

  const quandDemande = l.jour ? (l.tranche ? t('demande.quand', { jour: jourDansLaPhrase(l.jour, locale), tranche: minuscule(tPlt(`tranches.${l.tranche}`)) }) : `${jourDansLaPhrase(l.jour, locale)} · ${l.heure}`) : '';
  const age = v.created_at ? ageEnClair(t, ageDeLaDemande(v.created_at, p.maintenant)) : null;
  const description =
    etat === 'a-confirmer' && age
      ? p.visiteur
        ? t('bureau.sous.demandeSansNom', { age, quand: quandDemande })
        : t('bureau.sous.demande', { age, nom: l.nom, quand: quandDemande })
      : [l.jour ? (l.aujourdhui ? t('bureau.aujourdhui', { jour: jourDansLaPhrase(l.jour, locale) }) : jourEnToutesLettres(l.jour, locale)) : null, p.visiteur ? null : l.nom, minuscule(l.type)]
          .filter(Boolean)
          .join(' · ');

  let actions: ReactNode = null;
  if (!personnel && (g.proposer || g.annuler)) {
    // Le visiteur n'a que deux gestes : écrits en clair, sans menu.
    actions = (
      <>
        {g.proposer ? (
          <Button variant="outline" onClick={g.proposer}>
            {t('autres.proposer')}
          </Button>
        ) : null}
        {g.annuler ? (
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={g.annuler}>
            {t('autres.annuler')}
          </Button>
        ) : null}
      </>
    );
  } else if (personnel) {
    const premiere = proposees.heures[0] ?? null;
    const confirmer = g.confirmer;
    actions = (
      <>
        <PlusDActions gestes={autres} />
        {etat === 'a-confirmer' && confirmer ? (
          <>
            <Button variant="outline" onClick={() => p.onAutreHeure(true)}>
              {t('bureau.proposerAutreHeure')}
            </Button>
            {premiere ? (
              // Réponse 5 du team-lead : un bouton unique, comme la maquette — « Proposer une autre
              // heure », à côté, choisit une autre heure. Sans chevron : aucun menu derrière lui.
              <Button className="tabular-nums" disabled={g.enCours} onClick={() => void confirmer(premiere.start)}>
                <Check className="size-4" aria-hidden="true" />
                {premiere.start ? t('autreHeure.confirmer', { heure: premiere.label }) : t('autres.confirmer')}
              </Button>
            ) : proposees.etat === 'agent-indisponible' && g.attribuer ? (
              // Suivi du lot A : l'agent de la visite est parti ou suspendu — le geste principal réattribue.
              <AttribuerA agence={g.attribuer.agence} onChoisir={g.attribuer.onChoisir} disabled={g.enCours} declencheur={<Button>{tPlt('reattribuer')}</Button>} />
            ) : null}
          </>
        ) : null}
        {replanifierEnTete && g.replanifier ? (
          <Button variant="outline" onClick={g.replanifier}>
            <CalendarClock className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {t('autres.replanifier')}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        fil={{ label: tFil('breadcrumb'), etapes: [{ label: t('fil'), href: '/app/visits' }, { label: bien }] }}
        title={titre}
        description={description}
        actions={actions}
      />
      {personnel && (etat === 'jour-j' || etat === 'en-cours' || etat === 'apres') ? <BarreDuJourJ p={p} l={l} /> : null}
      {p.autreHeure && g.confirmer ? <DialogueAutreHeure p={p} l={l} /> : null}
    </>
  );
}

/** « Confirmer à 15:00 ▾ » : l'heure proposée, et les autres heures libres sous le chevron. */
/** Le jour J au bureau : le compte à rebours, le message prêt, et le geste du moment. */
function BarreDuJourJ({ p, l }: { readonly p: FicheDeLaVisiteProps; readonly l: Lecture }) {
  const t = useTranslations('visits.fiche');
  const { etat, gestes: g, visite: v } = p;
  const absentDes = absentPossibleA(v, p.maintenant);
  const f = useFormatteurs();
  const grand = etat === 'jour-j' ? (l.pastille ? capitaliser(l.pastille) : l.heure) : etat === 'en-cours' ? t('bureau.enCours') : t('bureau.apres');
  return (
    <div data-slot="barre-du-jour-j" className="mt-6 flex flex-wrap items-center gap-6 rounded-xl border border-border bg-secondary/60 px-5 py-4">
      <div>
        <p className="font-display text-affiche-28 leading-none font-semibold tracking-titre text-foreground">{grand}</p>
        <p className="mt-1.5 text-sm text-encre-douce">
          {l.aujourdhui ? t('bureau.plage', { debut: l.heure, fin: l.fin }) : `${l.heure} – ${l.fin}`}
          {v.property?.address?.line ? ` · ${v.property.address.line}` : null}
        </p>
      </div>
      {etat === 'jour-j' && l.peutEcrire && l.messageEnRoute ? (
        <p className="max-w-[calc(var(--spacing)*92)] rounded-xl rounded-bl-sm bg-success/10 px-3.5 py-2 text-sm leading-relaxed text-encre-douce">{l.messageEnRoute}</p>
      ) : null}
      <div className="ml-auto flex flex-none items-center gap-2">
        {etat === 'jour-j' ? (
          <>
            {l.peutEcrire && l.numero && l.messageEnRoute ? (
              <a
                href={whatsappHref(l.numero, l.messageEnRoute)}
                target="_blank"
                rel="noopener noreferrer"
                data-slot="geste-en-route"
                className={cn(buttonVariants(), 'bg-success text-success-foreground hover:bg-success')}
              >
                <IconeWhatsApp className="size-4" />
                {t('barre.enRoute')}
              </a>
            ) : null}
            <Button variant="sombre" onClick={p.onCommencer}>
              {t('barre.commencer')}
            </Button>
          </>
        ) : (
          <>
            {g.absent && absentDes ? (
              <span id={ID_ABSENT_DES} className="text-sm tabular-nums text-encre-douce">
                {t('bureau.absentPossibleA', { heure: f.heure(absentDes) })}
              </span>
            ) : null}
            {g.absent ? (
              <Button variant="outline" disabled={g.enCours || absentDes !== null} aria-describedby={absentDes ? ID_ABSENT_DES : undefined} onClick={g.absent}>
                {t('barre.absent')}
              </Button>
            ) : null}
            {g.terminer ? (
              <Button disabled={g.enCours} onClick={g.terminer}>
                {t('barre.terminer')}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** Une carte du bureau : titre à gauche, action à droite, filet dessous. */
function CarteBureau({ titre, action, children, slot }: { readonly titre: string; readonly action?: ReactNode; readonly children: ReactNode; readonly slot?: string }) {
  return (
    <section data-slot={slot} className="rounded-xl border border-border bg-card">
      <div className="flex min-h-12 items-center gap-2 border-b border-border px-4 py-2">
        <h2 className="min-w-0 flex-1 text-corps font-semibold text-foreground">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const LIEN_DE_CARTE = 'inline-flex h-9 items-center rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring';

/** Le corps du bureau : le créneau et le bien à gauche ; le visiteur et ses visites à droite. */
export function CorpsDeLaFiche(p: FicheDeLaVisiteProps) {
  const t = useTranslations('visits.fiche');
  const tVisits = useTranslations('visits');
  const locale = useLocale();
  const l = useLecture(p);
  const { visite: v, etat, personnel } = p;
  const detail = useDetailDuBienDeLaVisite(v, personnel);
  const proposees = useHeuresProposees(v, (iso) => l.heureDe(iso), etat === 'a-confirmer' && personnel);
  const { lignes, motif } = useLignesDuCreneau(p, l, true);
  const status = v.status ?? 'scheduled';
  const messageGenerique = useMessageGenerique(v, l);
  const age = v.created_at ? ageEnClair(t, ageDeLaDemande(v.created_at, p.maintenant)) : null;
  const jourDeLaDemande = l.jour ? jourProche(l.jour, p.maintenant, locale) : '';
  const quandDemande = l.jour
    ? l.tranche
      ? t('bureau.quandTranche', { jour: jourDeLaDemande, tranche: t(`tranches.${l.tranche}`) })
      : `${jourDeLaDemande} · ${l.heure}`
    : '';

  const creneau = (
    <CarteBureau
      slot="carte-creneau"
      titre={t('creneau.titreCourt')}
      action={<StatusBadge tone={VISIT_STATUS_TONE[status]} label={tVisits(VISIT_STATUS_LABEL_KEY[status])} data-testid="visit-status" />}
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 lg:grid-cols-3">
        {lignes.map(([cle, valeur]) => (
          <div key={cle} className="min-w-0">
            <dt className="text-ui text-muted-foreground">{cle}</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{valeur}</dd>
          </div>
        ))}
      </dl>
      {etat === 'a-confirmer' && !p.visiteur && (v.notes?.trim() || age) ? (
        <div className="border-t border-border p-4">
          {age ? <p className="text-ui text-muted-foreground">{t('bureau.demandeDe', { nom: l.prenom ?? l.nom, age, quand: quandDemande })}</p> : null}
          {v.notes?.trim() ? (
            <p className="mt-1.5 max-w-xl rounded-xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-corps leading-relaxed whitespace-pre-line text-foreground">« {v.notes.trim()} »</p>
          ) : null}
          {personnel && l.tranche && proposees.etat === 'agent-indisponible' ? <AgentIndisponible g={p.gestes} avecGeste={false} className="mt-2" /> : null}
          {personnel && l.tranche && proposees.heures.length > 0 ? (
            <p className="mt-2 text-ui text-muted-foreground tabular-nums">{t('bureau.heuresLibres', { quand: `${jourDeLaDemande} ${t(`tranches.${l.tranche}`)}`, heures: proposees.heures.slice(0, 3).map((h) => h.label).join(' · ') })}</p>
          ) : null}
        </div>
      ) : v.notes?.trim() && etat !== 'a-confirmer' ? (
        <div className="border-t border-border p-4">
          <p className="text-ui text-muted-foreground">{tVisits('detail.notes')}</p>
          <p className="mt-0.5 text-corps whitespace-pre-line text-pretty text-foreground">{v.notes.trim()}</p>
        </div>
      ) : null}
      {motif ? <div className="px-4 pb-4">{motif}</div> : null}
    </CarteBureau>
  );

  const bienCarte = (
    <CarteBureau
      slot="carte-bien"
      titre={t('bureau.bien')}
      action={
        v.property?.slug ? (
          <Link href={`/properties/${v.property.slug}`} className={LIEN_DE_CARTE}>
            {t('lieu.voirLeBien')}
          </Link>
        ) : undefined
      }
    >
      <div className="flex gap-4 p-4">
        <PhotoDuBien src={v.property?.cover_url} className="h-37 w-44 flex-none rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-action font-semibold text-foreground">
            {v.property?.title}
            {v.property?.address?.neighborhood ? ` · ${v.property.address.neighborhood}` : null}
          </p>
          <AdresseCourte v={v} />
          {detail ? <p className="mt-1 text-sm tabular-nums text-muted-foreground">{detail}</p> : null}
          <div className="mt-4 flex gap-2">
            <GesteItineraire v={v} className="h-9" />
          </div>
        </div>
      </div>
    </CarteBureau>
  );

  const visiteurCarte = !p.visiteur ? <CarteVisiteurBureau p={p} l={l} message={messageGenerique} /> : null;
  const sesVisites = personnel && p.colonne && v.customer_id ? <SesVisites v={v} /> : null;
  const biens = p.ficheClient && p.colonne && v.customer?.id ? <BiensCorrespondants clientId={v.customer.id} prenom={l.prenom ?? l.nom} numero={l.numero} /> : null;

  return (
    <div data-slot="fiche-bureau" className="space-y-6">
      {p.erreur && !p.autreHeure ? (
        <p role="alert" className="text-sm text-destructive">
          {p.erreur}
        </p>
      ) : null}
      <div className={cn('grid grid-cols-1 items-start gap-6', p.colonne && 'xl:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*117)]')}>
        <div className="min-w-0 space-y-6">
          {creneau}
          {bienCarte}
          {!p.colonne ? visiteurCarte : null}
        </div>
        {p.colonne ? (
          <div className="min-w-0 space-y-6">
            {visiteurCarte}
            {sesVisites}
            {biens}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * La fiche du client, pour « Cherche » et « Étape ». `/api/customers/{id}` est un `show` : il ignore
 * `fields` (P60.03) — la lecture, et la clé, de « Et maintenant ? » (`useEtapeDeLaFiche`). Les critères
 * n'y sont émis qu'au personnel de l'agence de la fiche (`CustomerResource::readsCriteria`).
 */
function useFicheDuClient(clientId: number | null) {
  return useApiQuery<ApiResponse<Partial<CustomerDetail>>>(['customers', 'etape', clientId ?? 0], cheminApi`/api/customers/${clientId ?? 0}`, {
    enabled: clientId !== null,
  });
}

/** « Location · local commercial · Plateau, Yoff · jusqu’à 500 000 F/mois » — ce qui est renseigné. */
function useCeQuIlCherche(c: Partial<CustomerDetail> | null): string | null {
  const t = useTranslations('visits.fiche.bureau');
  // Une seule langue dans le produit (team-lead) : le libellé du type est celui du reste du produit.
  // `nav.categories` porte mot pour mot `property.types` (fr, en, wo), et la coque /app le sert déjà ;
  // `property` (13,9 Ko gzip) ferait monter chaque page de /app/visits de 28,5 à 37 %.
  const tTypes = useTranslations('nav.categories');
  const { montantCourt } = useFormatteurs();
  if (!c) return null;
  const types = (c.seeking_property_types ?? []).map((x) => (tTypes.has(x) ? minuscule(tTypes(x)) : x));
  const lieux = (c.seeking_neighborhoods?.length ? c.seeking_neighborhoods : c.seeking_cities) ?? [];
  const plafond = c.budget_max !== null && c.budget_max !== undefined && c.budget_max !== '' ? montantCourt(Number(c.budget_max)) : null;
  const parties = [
    c.seeking_contract_type ? t(`contrats.${c.seeking_contract_type}`) : null,
    types.length > 0 ? types.join(', ') : null,
    lieux.length > 0 ? lieux.join(', ') : null,
    plafond ? (c.seeking_contract_type === 'rent' ? t('jusquaParMois', { montant: plafond }) : t('jusqua', { montant: plafond })) : null,
  ].filter((x): x is string => Boolean(x));
  return parties.length > 0 ? parties.join(' · ') : null;
}

function CarteVisiteurBureau({ p, l, message }: { readonly p: FicheDeLaVisiteProps; readonly l: Lecture; readonly message: string }) {
  const t = useTranslations('visits.fiche.bureau');
  const tCrm = useTranslations('crm.pipeline.stage');
  const v = p.visite;
  const clientId = p.ficheClient && v.customer?.id ? v.customer.id : null;
  const lue = useFicheDuClient(clientId);
  const client = clientId !== null && lue.data?.data.id === clientId ? lue.data.data : null;
  const cherche = useCeQuIlCherche(client);
  const etape = client?.pipeline_stage && tCrm.has(client.pipeline_stage) ? tCrm(client.pipeline_stage) : null;
  const fiche = p.personnel && v.customer?.id ? `/app/customers/${v.customer.id}` : null;
  const affiche = l.numero ?? l.brut;
  return (
    <CarteBureau
      slot="carte-visiteur"
      titre={t('visiteur')}
      action={
        fiche ? (
          <Link href={fiche} className={LIEN_DE_CARTE}>
            {t('ouvrirLaFiche')}
          </Link>
        ) : undefined
      }
    >
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Monogramme nom={l.nom} className="size-11 text-base" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-action font-semibold text-foreground">{l.nom}</p>
            {affiche && formaterTelephone(affiche) !== l.nom ? <p className="text-sm tabular-nums text-muted-foreground">{formaterTelephone(affiche)}</p> : null}
            {l.email ? (
              <a href={`mailto:${l.email}`} className="block truncate text-sm text-muted-foreground hover:text-foreground hover:underline">
                {l.email}
              </a>
            ) : null}
          </div>
          {p.personnel && l.rang ? <span className="inline-flex h-6 flex-none items-center rounded-full bg-secondary px-2.5 text-xs font-medium text-primary-deep">{l.rang}</span> : null}
        </div>
        {l.numero || fiche ? (
          <div className="mt-4 flex gap-2">
            {l.numero ? (
              <a href={telHref(l.numero)} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>
                <Phone className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('appeler')}
              </a>
            ) : null}
            {l.numero ? (
              <a
                href={whatsappHref(l.numero, message)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants(), 'flex-1 bg-success text-success-foreground hover:bg-success')}
              >
                <IconeWhatsApp className="size-4" />
                {t('whatsapp')}
              </a>
            ) : null}
            {fiche ? (
              <Link href={fiche} className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>
                <UserRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {t('fiche')}
              </Link>
            ) : null}
          </div>
        ) : null}
        {cherche || etape ? (
          <dl data-slot="cherche-etape" className="mt-4 space-y-3 border-t border-border pt-4">
            {cherche ? (
              <div>
                <dt className="text-ui text-muted-foreground">{t('cherche')}</dt>
                <dd className="mt-0.5 text-sm text-foreground">{cherche}</dd>
              </div>
            ) : null}
            {etape ? (
              <div>
                <dt className="text-ui text-muted-foreground">{t('etape')}</dt>
                <dd className="mt-0.5 text-sm text-foreground">{etape}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </CarteBureau>
  );
}

/**
 * « Biens correspondants » : la lecture et le flux de la fiche client (`CustomerMatches`, TCK-591 §5) —
 * mêmes biens, même message WhatsApp. « Partager (n) » envoie les biens publics listés ici,
 * « Proposer » un seul ; un bien privé reste listé, jamais envoyé.
 */
function BiensCorrespondants({ clientId, prenom, numero }: { readonly clientId: number; readonly prenom: string; readonly numero: string | null }) {
  const t = useTranslations('visits.fiche.bureau');
  const tMatches = useTranslations('agentCrm.matches');
  const detailDe = useDetailDuBien();
  const { token } = useAuth();
  const lu = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.matchingProperties(clientId),
    queryFn: () => fetchMatchingProperties(token ?? '', clientId),
    enabled: !!token,
  });
  const biens = (lu.data?.data ?? []).slice(0, 3);
  if (biens.length === 0) return null;
  const joignable = isReachable(numero);
  const origine = typeof window === 'undefined' ? '' : window.location.origin;
  const partageables = biens.filter((b) => b.visibility === 'public' && b.slug);
  const lien = (liste: typeof partageables) => (joignable && numero && liste.length > 0 ? whatsappHref(numero, messageDeSelection(tMatches('shareIntro', { firstName: prenom }), liste, origine)) : null);
  const tous = lien(partageables);
  return (
    <CarteBureau
      slot="biens-correspondants"
      titre={t('biensCorrespondants')}
      action={
        tous ? (
          <a href={tous} target="_blank" rel="noopener noreferrer" className={LIEN_DE_CARTE}>
            {t('partager', { n: partageables.length })}
          </a>
        ) : undefined
      }
    >
      <ul className="divide-y divide-border">
        {biens.map((b) => {
          const un = b.visibility === 'public' && b.slug ? lien([b]) : null;
          const detail = detailDe({ price: b.price, currency: null, contract_type: b.contract_type, reference_number: null });
          return (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/app/properties/${b.id}`} className="block truncate font-medium text-foreground hover:underline">
                  {b.title}
                  {b.neighborhood ? ` · ${b.neighborhood}` : null}
                </Link>
                {detail ? <p className="truncate text-ui tabular-nums text-muted-foreground">{detail}</p> : null}
              </div>
              {un ? (
                <a href={un} target="_blank" rel="noopener noreferrer" aria-label={t('proposerA', { titre: b.title })} className={LIEN_DE_CARTE}>
                  {t('proposer')}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </CarteBureau>
  );
}

interface VisiteDuClient {
  readonly id: number;
  readonly status?: PropertyVisit['status'];
  readonly scheduled_at?: string | null;
  readonly property?: { readonly id: number; readonly title?: string | null } | null;
}

/** « Ses visites » : les visites du même client (`filter[customer_id]`), la plus récente d'abord. */
function SesVisites({ v }: { readonly v: PropertyVisit }) {
  const t = useTranslations('visits.fiche.bureau');
  const tVisits = useTranslations('visits');
  const f = useFormatteurs();
  const locale = useLocale();
  const lu = useApiQuery<PaginatedResponse<VisiteDuClient>>(['visits', 'fiche', 'client', v.customer_id], '/api/property-visits', {
    params: {
      filter: { customer_id: v.customer_id ?? 0 },
      fields: { property_visits: ['id', 'status', 'scheduled_at', 'property_id'], properties: ['id', 'title'] },
      include: ['property'],
      sort: '-scheduled_at',
      per_page: 5,
    },
    enabled: v.customer_id != null,
  });
  const visites = lu.data?.data ?? [];
  if (visites.length === 0) return null;
  return (
    <CarteBureau slot="ses-visites" titre={t('sesVisites')}>
      <ul className="divide-y divide-border">
        {visites.map((x) => {
          const statut = x.status ?? 'scheduled';
          const jour = x.scheduled_at ? jourADakar(new Date(x.scheduled_at)) : null;
          return (
            <li key={x.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                {x.id === v.id ? (
                  <p className="truncate font-medium text-foreground">{x.property?.title ?? t('cetteVisite')}</p>
                ) : (
                  <Link href={`/app/visits/${x.id}`} className="block truncate font-medium text-foreground hover:underline">
                    {x.property?.title ?? `#${x.id}`}
                  </Link>
                )}
                <p className="truncate text-ui tabular-nums text-muted-foreground">
                  {jour ? capitaliser(jourEnClair(jour, locale)) : null}
                  {x.scheduled_at ? ` · ${f.heure(x.scheduled_at)}` : null}
                </p>
              </div>
              <StatusBadge tone={VISIT_STATUS_TONE[statut]} label={tVisits(VISIT_STATUS_LABEL_KEY[statut])} />
            </li>
          );
        })}
      </ul>
    </CarteBureau>
  );
}

/** Le téléphone ou le bureau : un seul arbre. Au bureau, l'en-tête est posé par le conteneur. */
export function FicheDeLaVisite(p: FicheDeLaVisiteProps & { readonly telephone: boolean }) {
  const { telephone, ...props } = p;
  return telephone ? <FicheTelephone {...props} /> : <CorpsDeLaFiche {...props} />;
}
