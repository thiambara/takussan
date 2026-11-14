'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, MapPin } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { StatusBadge } from '@/components/console/StatusBadge';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { MaintenanceCompleteForm } from '@/components/maintenance/MaintenanceCompleteForm';
import { MaintenanceGallery } from '@/components/maintenance/MaintenanceGallery';
import { MaintenanceResolutionResponse } from '@/components/maintenance/MaintenanceResolutionResponse';
import { MaintenanceStatusBadge } from '@/components/maintenance/MaintenanceStatusBadge';
import { QuoteActions } from '@/components/maintenance/QuoteActions';
import { QuoteCard } from '@/components/maintenance/QuoteCard';
import { PastilleDePriorite, useTexteDAttente } from '@/components/maintenance/files/CartesDIntervention';
import { RelancerLeBailleur } from '@/components/maintenance/files/RelancerLeBailleur';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { gestePrincipal, type GestePrincipal } from '@/lib/maintenance/fiche';
import { attenteDe, type InterventionEnFile } from '@/lib/maintenance/files';
import { useMaintenanceRequest } from '@/lib/queries/maintenance';
import { useCarnetActif } from '@/lib/queries/maintenance-files';
import { cn } from '@/lib/utils';

import { AutreActionListe, AutreActionMenu, EchecDAutreAction, FeuillesDAutreAction, useAutreAction, useEcrituresDAutreAction } from './AutreAction';
import { ChoixDuPrestataire, useChoixDuPrestataire } from './ChoixDuPrestataire';
import { FriseDesFiles } from './FriseDesFiles';
import { JournalDeLaDemande } from './JournalDeLaDemande';

/**
 * TCK-2653 — la fiche d'une intervention pour l'agence (maquette `app-interventions`, approche a,
 * « Fiche — à dispatcher » et « Fiche — Autre action ») : UN geste principal selon la file, à droite
 * au bureau (dès `xl` ; dessous avant), « Autre action » pour le reste.
 *
 * Rien ne se perd de l'ancienne fiche (`MaintenanceDetail`, gardée pour les autres rôles) : titre,
 * métier, création, priorité, statut, description ; bien et adresse, demandeur, assigné à, prévu le,
 * coût réel ; « Prestataire et créneau » (carnet, créneau, invitation) ; la frise ; le devis
 * (demander, approuver, refuser avec motif, PDF) ; les transitions permises ; le rapport de fin et
 * ses notes ; la galerie.
 *
 * `?geste=` (les gestes des cartes de la liste) ouvre la fiche sur ce geste : « reassigner » ouvre le
 * choix du prestataire en retard, « voirDevis » descend au devis. Il n'ouvre que ce que la file et
 * les `abilities` permettent déjà.
 */
export function FicheDIntervention({ id }: { readonly id: number }) {
  const query = useMaintenanceRequest(id);
  return <QueryBoundary query={query}>{(payload) => <Corps request={payload.data as InterventionEnFile} />}</QueryBoundary>;
}

function personne(p: InterventionEnFile['assignee']): string | null {
  return p ? p.name || p.email || p.username || null : null;
}

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Corps({ request }: { readonly request: InterventionEnFile }) {
  const t = useTranslations('maintenance.fiche');
  const tFiles = useTranslations('maintenance.files');
  const tCategorie = useTranslations('maintenance.category');
  const f = useFormatteurs();
  const texteDAttente = useTexteDAttente();
  const params = useSearchParams();
  const geste = params?.get('geste') ?? null;
  const [maintenant] = useState(() => new Date());
  const [rapport, setRapport] = useState(false);
  const principal = gestePrincipal(request);
  const [reassigner, setReassigner] = useState(geste === 'reassigner' && principal === 'relancer');
  const choix = useChoixDuPrestataire(request, maintenant, () => setReassigner(false));
  const ecritures = useEcrituresDAutreAction(request.id);
  const autre = useAutreAction(request, ecritures, () => setRapport(true));
  const attente = attenteDe(request, maintenant);
  const demandeur = personne(request.requester);
  const signalee = demandeur
    ? t('signaleeLePar', { date: f.jourMois(request.created_at, maintenant), heure: f.heure(request.created_at), nom: demandeur })
    : t('signaleeLe', { date: f.jourMois(request.created_at, maintenant), heure: f.heure(request.created_at) });
  const choisir = principal === 'choisir' || reassigner;

  useEffect(() => {
    if (geste === 'voirDevis') document.getElementById('devis')?.scrollIntoView({ block: 'start' });
    else if (geste === 'choisir' || geste === 'reassigner') document.getElementById('geste-principal')?.scrollIntoView({ block: 'start' });
  }, [geste]);

  const badges = (
    <span className="flex flex-wrap items-center gap-2">
      <PastilleDePriorite priorite={request.priority} />
      {attente ? <StatusBadge label={texteDAttente(attente)} tone={attente.ton === 'rouge' ? 'danger' : attente.ton === 'ambre' ? 'attention' : 'neutral'} /> : <MaintenanceStatusBadge status={request.status} />}
    </span>
  );
  const envoyer = choisir ? (
    <Button type="button" disabled={!choix.pret} onClick={choix.envoyer} className="max-md:hidden">
      {choix.choix ? t('choix.envoyer', { nom: choix.choix.nom }) : t('choix.choisirDAbord')}
    </Button>
  ) : null;
  const fileCourante = request.file && request.file !== 'a_accepter' ? tFiles(`noms.${request.file}`) : null;

  return (
    <div data-slot="fiche-d-intervention" data-geste={principal}>
      {/* Téléphone : « Autre action » est la feuille de « ⋯ » (maquette « Fiche — Autre action »). */}
      <DeclarerEnTete forme="detail" titre={t('titreCourt')} repli="/app/maintenance" actions={autre.present ? <AutreActionListe etat={autre} /> : undefined} />
      <FeuillesDAutreAction etat={autre} />

      <div className="max-md:hidden">
        <PageHeader
          title={t('titre', { titre: request.title })}
          fil={{
            label: t('fil'),
            etapes: [{ label: tFiles('titre'), href: '/app/maintenance' }, ...(fileCourante ? [{ label: fileCourante, href: '/app/maintenance' }] : []), { label: request.title }],
          }}
          description={
            <span className="flex flex-wrap items-center gap-2">
              {badges}
              <span>
                {tCategorie(request.category)} · {signalee}
              </span>
            </span>
          }
          actions={
            <>
              <AutreActionMenu etat={autre} />
              {envoyer}
            </>
          }
        />
      </div>

      {/* Téléphone : la tête de la fiche. */}
      <div className="md:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {badges}
          <span className="text-ui text-muted-foreground">{tCategorie(request.category)}</span>
        </div>
        <h1 className="mt-2 font-display text-2xl leading-tight font-semibold tracking-titre text-balance">{request.title}</h1>
        <p className="mt-1 text-ui text-muted-foreground">{signalee}</p>
      </div>
      <EchecDAutreAction ecritures={ecritures} className="mt-2 md:text-right" />

      <div className="mt-4 grid gap-5 md:mt-6 xl:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*122.22)] xl:items-start xl:gap-6">
        <div className="min-w-0 space-y-5 xl:col-start-1">
          {/* Au téléphone, la demande se lit sous le titre, sans cadre (maquette « Fiche — à dispatcher »). */}
          <section data-slot="la-demande" className="md:rounded-xl md:border md:border-border md:bg-card md:p-5">
            <p className="text-xs font-medium text-muted-foreground max-md:hidden">{t('laDemande')}</p>
            <p className="max-w-prose text-base leading-relaxed whitespace-pre-wrap md:mt-2">{request.description}</p>
          </section>
          <BienEtDemandeur request={request} />
        </div>

        <aside id="geste-principal" data-slot="geste-principal" className="min-w-0 scroll-mt-20 xl:sticky xl:top-6 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          {choisir ? (
            <ChoixDuPrestataire request={request} etat={choix} maintenant={maintenant} titre={principal === 'relancer' ? t('choix.titreReassigner') : t('choix.titre')}
              titreTelephone={principal === 'relancer' ? t('choix.titreReassigner') : t('choix.titreTelephone')}
            />
          ) : (
            <PanneauDuGeste request={request} geste={principal} maintenant={maintenant} onReassigner={() => setReassigner(true)} />
          )}
          {/* TCK-2786 — le journal, colonne droite au bureau ; sous la frise avant `xl`. */}
          <JournalDeLaDemande request={request} maintenant={maintenant} className="mt-5 max-xl:hidden" />
        </aside>

        <div className="min-w-0 space-y-5 xl:col-start-1">
          <Details request={request} />
          <FriseDesFiles request={request} />
          <JournalDeLaDemande request={request} maintenant={maintenant} className="xl:hidden" />
          <div id="devis" className="scroll-mt-20 space-y-5">
            <QuoteCard request={request} />
            {principal === 'devis' ? null : <QuoteActions request={request} sansDemande />}
          </div>
          <MaintenanceResolutionResponse request={request} />
          {rapport && request.abilities?.can_complete ? <MaintenanceCompleteForm id={request.id} onClose={() => setRapport(false)} withCost={request.abilities.can_assign === true} /> : null}
          {request.resolution_notes ? (
            <section className="rounded-xl border border-border bg-card p-4 md:p-5">
              <h2 className="font-display text-base font-semibold">{t('notesDeResolution')}</h2>
              <p className="mt-2 max-w-prose text-sm leading-relaxed whitespace-pre-wrap">{request.resolution_notes}</p>
            </section>
          ) : null}
          <MaintenanceGallery request={request} />
        </div>
      </div>

      {/* Téléphone : l'envoi, collé en bas. */}
      {choisir ? (
        <BarreDAction className="md:hidden">
          <Button type="button" disabled={!choix.pret} onClick={choix.envoyer}>
            {choix.choix ? t('choix.envoyer', { nom: choix.choix.nom }) : t('choix.choisirDAbord')}
          </Button>
        </BarreDAction>
      ) : null}
    </div>
  );
}

/** Le bien (lien vers sa fiche pour le donneur d'ordre) et le demandeur. */
function BienEtDemandeur({ request }: { readonly request: InterventionEnFile }) {
  const t = useTranslations('maintenance.fiche');
  const bien = request.property;
  const demandeur = personne(request.requester);
  const contenuDuBien = bien ? (
    <>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-base font-semibold">{[bien.title, bien.location?.quarter && !bien.title.includes(bien.location.quarter) ? bien.location.quarter : null].filter(Boolean).join(' · ')}</span>
        {bien.location?.full ? (
          <span className="mt-0.5 flex items-center gap-1 text-ui text-muted-foreground">
            <MapPin className="size-3.5 flex-none" aria-hidden="true" />
            {bien.location.full}
          </span>
        ) : null}
      </span>
      <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
    </>
  ) : (
    <span className="text-sm text-muted-foreground">{t('bienAbsent')}</span>
  );
  return (
    <section data-slot="bien-et-demandeur" className="rounded-xl border border-border bg-card p-4">
      {bien && request.abilities?.can_manage_quotes ? (
        <Link href={`/app/properties/${bien.id}`} className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring">
          {contenuDuBien}
        </Link>
      ) : (
        <div className="flex items-center gap-3">{contenuDuBien}</div>
      )}
      <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
        <Avatar size="40">
          <AvatarFallback>{demandeur ? initiales(demandeur) : '?'}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-base font-medium">{demandeur ? t('demandeur', { nom: demandeur }) : t('demandeurAbsent')}</span>
      </div>
    </section>
  );
}

/** Ce que l'ancienne fiche disait en tête : statut, assigné à, prévu le, coût réel, créée le. */
function Details({ request }: { readonly request: InterventionEnFile }) {
  const t = useTranslations('maintenance.detail');
  const tFiche = useTranslations('maintenance.fiche');
  const f = useFormatteurs();
  const ligne = (terme: string, valeur: ReactNode) => (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{terme}</dt>
      <dd className="mt-0.5 text-sm">{valeur}</dd>
    </div>
  );
  return (
    <dl data-slot="details" className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-card p-4 tabular-nums md:p-5 lg:grid-cols-4">
      {ligne(tFiche('statut'), <MaintenanceStatusBadge status={request.status} />)}
      {ligne(t('assignee'), personne(request.assignee) ?? t('unassigned'))}
      {ligne(t('scheduled_for'), request.scheduled_at ? f.dateTime(request.scheduled_at) : '—')}
      {ligne(t('actual_cost'), request.actual_cost !== null && request.actual_cost !== undefined ? f.montantCourt(request.actual_cost) : '—')}
    </dl>
  );
}

/**
 * Le geste principal hors dispatch : relancer (et réassigner) en retard, décider du devis, attendre
 * le bailleur, suivre, attendre la confirmation. Chaque panneau dit d'abord ce qui attend, et qui.
 */
function PanneauDuGeste({ request, geste, maintenant, onReassigner }: { readonly request: InterventionEnFile; readonly geste: GestePrincipal; readonly maintenant: Date; readonly onReassigner: () => void }) {
  const t = useTranslations('maintenance.fiche.geste');
  const tStatut = useTranslations('maintenance.status');
  const f = useFormatteurs();
  const texteDAttente = useTexteDAttente();
  const attente = attenteDe(request, maintenant);
  const prestataire = personne(request.assignee);
  const cadre = (titre: string, corps: ReactNode, actions?: ReactNode) => (
    <section data-slot="panneau-du-geste" className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h2 className="font-display text-lg font-semibold tracking-titre">{titre}</h2>
      <div className="mt-1 space-y-1 text-sm text-muted-foreground">{corps}</div>
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
  switch (geste) {
    case 'relancer':
    case 'suivi':
      return cadre(
        geste === 'relancer' ? t('retard.titre') : t('suivi.titre'),
        <>
          {prestataire ? <p>{t('confieeA', { nom: prestataire })}</p> : null}
          {attente ? <p className={cn(attente.ton === 'rouge' && 'font-semibold text-destructive')}>{texteDAttente(attente)}</p> : null}
        </>,
        <>
          <Relancer request={request} />
          {geste === 'relancer' && request.abilities?.can_assign ? (
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={onReassigner}>
              {t('reassigner')}
            </Button>
          ) : null}
        </>,
      );
    case 'devis':
      return cadre(
        t('devis.titre'),
        <p>{request.quote_amount !== null && request.quote_amount !== undefined ? t('devis.texte', { montant: f.montantCourt(request.quote_amount, request.quote_currency), nom: prestataire ?? '—' }) : t('devis.texteSansMontant')}</p>,
        <div className="w-full [&>section]:bg-transparent [&>section]:p-0">
          <QuoteActions request={request} sansDemande />
        </div>,
      );
    case 'bailleur':
      return cadre(
        t('bailleur.titre'),
        <>
          <p>{request.quote_amount !== null && request.quote_amount !== undefined ? t('bailleur.texte', { montant: f.montantCourt(request.quote_amount, request.quote_currency) }) : t('bailleur.texteSansMontant')}</p>
          {attente ? <p className={cn(attente.ton === 'ambre' && 'font-semibold text-warning')}>{texteDAttente(attente)}</p> : null}
        </>,
        <>
          {/* TCK-2786 — le geste principal de la file : relancer le bailleur par Takussan. */}
          <RelancerLeBailleur request={request} maintenant={maintenant} taille="fiche" peut={request.abilities?.can_remind_owner === true} />
          <a href="#devis" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 flex-1')}>
            {t('voirDevis')}
          </a>
        </>,
      );
    case 'confirmer':
      return cadre(t('confirmer.titre'), <>{attente ? <p>{texteDAttente(attente)}</p> : null}<p>{t('confirmer.texte')}</p></>);
    default:
      return cadre(t('aucun.titre', { statut: tStatut(request.status) }), <p>{t('aucun.texte')}</p>);
  }
}

/**
 * « Relancer » : WhatsApp au prestataire, message prérempli. Le téléphone est celui du carnet (compte,
 * sinon invitation, TCK-2652), retrouvé par le compte assigné : la ligne de la demande ne le porte pas.
 * Sans numéro joignable, le bouton dit pourquoi au lieu de disparaître.
 */
function Relancer({ request }: { readonly request: InterventionEnFile }) {
  const t = useTranslations('maintenance.fiche.geste');
  const f = useFormatteurs();
  const { user } = useAuth();
  const agencyId = request.property?.agency?.id ?? user?.agency_id ?? null;
  const carnet = useCarnetActif(request.assigned_to !== null ? agencyId : null);
  const ligne = (carnet.data?.data ?? []).find((l) => l.user_id === request.assigned_to);
  const telephone = ligne?.phone ?? ligne?.metadata?.phone ?? null;
  const nom = personne(request.assignee) ?? '';
  if (request.assigned_to === null) return null;
  if (carnet.isPending) return <Button type="button" variant="outline" className="h-11 flex-1" disabled>{t('relancer')}</Button>;
  if (!isReachable(telephone)) {
    return <p data-slot="relance-impossible" className="basis-full text-ui text-muted-foreground">{ligne ? t('sansNumero', { nom }) : t('horsCarnet', { nom })}</p>;
  }
  const message = request.scheduled_at
    ? t('messageDeRelance', { nom, titre: request.title, date: f.jourMois(request.scheduled_at), heure: f.heure(request.scheduled_at) })
    : t('messageDeRelanceSansCreneau', { nom, titre: request.title });
  return (
    <>
      <a href={whatsappHref(telephone, message)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), 'h-11 flex-1')}>
        {t('relancer')}
      </a>
      <a href={telHref(telephone)} className={cn(buttonVariants({ variant: 'outline' }), 'h-11 flex-1')}>
        {t('appeler')}
      </a>
    </>
  );
}
