'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { KeyRound, Lock, MapPin, Navigation, ReceiptText } from 'lucide-react';

import { PageHeader, StatusBadge } from '@/components/console';
import { EmptyState, ErrorState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { directionsUrl } from '@/components/maintenance/MaintenanceAccessKit';
import { SERVICE_PROVIDER_BILL_STATUS_TONE } from '@/components/payments/constants';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import { jourRelatif } from '@/lib/maintenance/mes-demandes';
import {
  aPercevoir,
  grilleDeLaSemaine,
  semaineDe,
  tourneeDeLaSemaine,
  type GenreDuCreneau,
  type GrilleDeLaSemaine,
  type JourDeTournee,
  type SemaineDuPrestataire,
} from '@/lib/maintenance/semaine-du-prestataire';
import { useAcceptMaintenance, useDeclineMaintenance, useMaintenanceRequest } from '@/lib/queries/maintenance';
import {
  FACTURES_DU_PRESTATAIRE_PAR_PAGE,
  useFacturesAPercevoir,
  useFacturesDuPrestataire,
  useInterventionsAAccepter,
  useSemaineDuPrestataire,
} from '@/lib/queries/maintenance-signalement';
import { cn } from '@/lib/utils';
import type { ServiceProviderBill } from '@/types/invoice';

/** Le minimum de `DeclineMaintenanceRequestRequest` : un motif lisible par le donneur d'ordre. */
const MOTIF_MIN = 3;

/** La hauteur d'une heure de la grille : 44 px de la maquette, en rem (taille fixe, hors densité). */
const HAUTEUR_D_UNE_HEURE_REM = 2.75;

/** Le registre complet des factures du prestataire (sa table, triée et paginée). */
const LIEN_DES_FACTURES = '/app/maintenance?factures=toutes';

/** Un jour `AAAA-MM-JJ` en instant de midi : son libellé ne dépend d'aucun fuseau. */
const midi = (jour: string) => new Date(`${jour}T12:00:00Z`);

/**
 * TCK-2654, lot 4 — « Mes interventions » du prestataire. Maquette retenue : `app-interventions` a,
 * écran « Prestataire — Ma semaine » (téléphone ; bureau : la grille de la semaine et les factures à
 * gauche, « À accepter » et « Prochaines » à droite, dès `xl` comme la maquette).
 *
 *  · « À accepter » : la file `a_accepter` de l'API. « J'accepte » et « Je refuse » (motif ≥ 3) ne
 *    naissent que des drapeaux de la FICHE (`abilities.can_accept|can_decline`) : jamais sur une
 *    demande terminée (AC4), quoi que dise la liste.
 *  · « Cette semaine » : les passages acceptés, par jour ; l'adresse, « Itinéraire » et « Kit d'accès »
 *    viennent du bloc `access` de la fiche, que l'API n'ouvre qu'après acceptation.
 *  · « Mes factures » en cartes, et « À percevoir » : la somme des factures à valider ou validées,
 *    filtrées par l'API (AC5) — aucun total quand l'API en compte plus qu'elle n'en a rendu.
 *
 * Écarts de donnée à la maquette (décision 2 : rien d'inventé) : la fenêtre du passage (« 9 h –
 * 11 h », l'API ne sert que son début), « À facturer » (la facture naît seule à la fin des travaux),
 * « Relevé de mes factures », « Calendrier », le moyen et la date de paiement d'une facture.
 */
export function InterventionsDuPrestataire() {
  const t = useTranslations('maintenance.prestataire');
  const tCommon = useTranslations('common');
  const f = useFormatteurs();
  const { user } = useAuth();
  const moi = user?.id;
  const [semaine] = useState<SemaineDuPrestataire>(() => semaineDe(new Date()));

  const aAccepter = useInterventionsAAccepter();
  const laSemaine = useSemaineDuPrestataire(moi, semaine);

  const cartes = aAccepter.data?.data ?? [];
  const nbAAccepter = aAccepter.data?.meta?.total ?? cartes.length;
  const interventions = laSemaine.data?.data ?? [];
  const grille = grilleDeLaSemaine(interventions, semaine);
  const tournee = tourneeDeLaSemaine(interventions, semaine);
  const prevues = grille.creneaux.filter((c) => c.genre === 'prevu').length;
  // Sans compte lu, la semaine n'est pas demandée (`enabled`) : elle ne retient pas le rendu.
  const charge = aAccepter.isPending || (moi !== undefined && laSemaine.isPending);
  const erreur = aAccepter.isError || laSemaine.isError;
  const borne = (jour: string) => f.date(midi(jour), { dateStyle: undefined, day: 'numeric', month: 'long' });
  // « du 9 au 14 novembre » : le mois ne se dit qu'une fois quand la semaine n'en change pas.
  const debut =
    semaine.jours[0].slice(0, 7) === semaine.jours[5].slice(0, 7)
      ? f.date(midi(semaine.jours[0]), { dateStyle: undefined, day: 'numeric' })
      : borne(semaine.jours[0]);

  return (
    <PagePleineLargeur>
      <div className="space-y-6 max-md:px-4 max-md:pt-4 max-md:pb-8" data-slot="interventions-du-prestataire">
        <DeclarerEnTete titre={t('titre')} />
        <div className="max-md:hidden">
          <PageHeader
            title={t('titre')}
            description={
              charge || erreur
                ? undefined
                : t('sousTitre', { debut, fin: borne(semaine.jours[5]), aAccepter: nbAAccepter, prevues })
            }
          />
        </div>

        {charge ? (
          <div className="space-y-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : erreur ? (
          <ErrorState
            message={t('erreur')}
            onRetry={() => {
              void aAccepter.refetch();
              void laSemaine.refetch();
            }}
            retryLabel={tCommon('actions.retry')}
          />
        ) : (
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1 space-y-6 max-xl:order-2">
              <div className="max-xl:hidden">
                <GrilleDeLaSemaineVue grille={grille} aujourdhui={semaine.aujourdhui} />
              </div>
              <MesFactures moi={moi} />
            </div>
            <div className="w-full flex-none space-y-6 max-xl:order-1 xl:w-[23.75rem]">
              {cartes.length > 0 ? (
                <section aria-labelledby="prestataire-a-accepter" className="space-y-3">
                  <h2 id="prestataire-a-accepter" className="font-display text-lg font-semibold tracking-titre">
                    {t('aAccepter.titre', { n: nbAAccepter })}
                  </h2>
                  {cartes.map((c) => (
                    <CarteAAccepter key={c.id} ligne={c} />
                  ))}
                </section>
              ) : null}
              <section aria-labelledby="prestataire-semaine" className="space-y-3 xl:hidden">
                <h2 id="prestataire-semaine" className="font-display text-lg font-semibold tracking-titre">
                  {t('semaine.titre')}
                </h2>
                <Tournee jours={tournee.jours} sansRien={tournee.sansRien} />
              </section>
              {tournee.jours.length > 0 ? (
                <section aria-labelledby="prestataire-prochaines" className="space-y-3 max-xl:hidden">
                  <h2 id="prestataire-prochaines" className="font-display text-lg font-semibold tracking-titre">
                    {t('semaine.prochaines', { jour: f.date(midi(tournee.jours[0].jour), { dateStyle: undefined, weekday: 'short', day: 'numeric' }) })}
                  </h2>
                  {/* « rien de prévu » suit le DERNIER jour de passage : il ne se dit que si c'est celui-ci. */}
                  <Tournee jours={tournee.jours.slice(0, 1)} sansRien={tournee.jours.length === 1 ? tournee.sansRien : []} />
                </section>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </PagePleineLargeur>
  );
}

function CarteAAccepter({ ligne }: { readonly ligne: InterventionEnFile }) {
  const t = useTranslations('maintenance.prestataire.aAccepter');
  const tReponse = useTranslations('maintenance.intervention.response');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const lue = useMaintenanceRequest(ligne.id);
  const accepter = useAcceptMaintenance(ligne.id);
  const refuser = useDeclineMaintenance(ligne.id);
  const [refus, setRefus] = useState(false);
  const [motif, setMotif] = useState('');

  const fiche = lue.data?.data?.id === ligne.id ? lue.data.data : undefined;
  const peutAccepter = fiche?.abilities?.can_accept === true;
  const peutRefuser = fiche?.abilities?.can_decline === true;
  const photos = fiche?.media?.photos.length ?? 0;
  const agence = ligne.property?.agency?.name ?? null;
  const quartier = ligne.property?.location?.quarter ?? ligne.property?.title ?? null;
  const jourDe = (d: Date) => f.date(d, { dateStyle: undefined, year: 'numeric', month: '2-digit', day: '2-digit' });
  const quand = ligne.scheduled_at
    ? t('quand', {
        jour: jourRelatif(ligne.scheduled_at, new Date(), jourDe),
        date: f.date(ligne.scheduled_at, { dateStyle: undefined, weekday: 'short', day: 'numeric', month: 'short' }),
        heure: f.heure(ligne.scheduled_at),
      })
    : null;
  const erreur = accepter.error ?? refuser.error;
  const enCours = accepter.isPending || refuser.isPending;

  return (
    <article className="rounded-xl border border-primary/40 bg-secondary/60 p-4" data-slot="carte-a-accepter">
      <div className="flex items-center gap-2">
        {ligne.priority === 'urgent' ? <StatusBadge tone="danger" label={t('urgente')} /> : null}
        {agence || photos > 0 ? (
          <span className="text-xs text-muted-foreground">{agence ? t('agenceEtPhotos', { agence, photos }) : t('photos', { photos })}</span>
        ) : null}
      </div>
      <h3 className="mt-1.5 text-base font-semibold">
        <Link href={`/app/maintenance/${ligne.id}`} className="hover:underline">
          {ligne.title}
        </Link>
      </h3>
      {quartier || quand ? <p className="mt-0.5 text-corps">{[quartier, quand].filter(Boolean).join(' · ')}</p> : null}
      <p className="mt-2 flex items-center gap-1.5 text-ui text-encre-douce">
        <Lock className="size-3.5 flex-none" aria-hidden="true" />
        {t('verrou')}
      </p>

      {refus ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (motif.trim().length < MOTIF_MIN) return;
            refuser.mutate({ reason: motif.trim() });
          }}
        >
          <label htmlFor={`motif-${ligne.id}`} className="block text-sm font-medium">
            {tReponse('reason_label')}
          </label>
          <Textarea id={`motif-${ligne.id}`} value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} placeholder={tReponse('reason_placeholder')} />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" size="lg" className="min-w-0 flex-1" disabled={enCours || motif.trim().length < MOTIF_MIN}>
              {tReponse('confirm_decline')}
            </Button>
            <Button type="button" variant="outline" size="lg" className="min-w-0 flex-1" onClick={() => setRefus(false)}>
              {tReponse('back')}
            </Button>
          </div>
        </form>
      ) : peutAccepter || peutRefuser ? (
        <div className="mt-3 flex gap-2">
          {peutAccepter ? (
            <Button type="button" size="lg" className="min-w-0 flex-1" disabled={enCours} onClick={() => accepter.mutate()}>
              {tReponse('accept')}
            </Button>
          ) : null}
          {peutRefuser ? (
            <Button type="button" variant="outline" size="lg" className="min-w-0 flex-1" disabled={enCours} onClick={() => setRefus(true)}>
              {tReponse('decline')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {erreur ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {messageErreur(erreur, tReponse('failed'))}
        </p>
      ) : null}
    </article>
  );
}

function Tournee({ jours, sansRien }: { readonly jours: readonly JourDeTournee[]; readonly sansRien: readonly string[] }) {
  const t = useTranslations('maintenance.prestataire.semaine');
  const f = useFormatteurs();
  const libelle = (jour: string) => f.date(midi(jour), { dateStyle: undefined, weekday: 'short', day: 'numeric', month: 'short' });
  const libelleCourt = (jour: string) => f.date(midi(jour), { dateStyle: undefined, weekday: 'short', day: 'numeric' });
  const rien = sansRien.length > 0 ? t('rienDePrevu', { jours: new Intl.ListFormat(f.locale, { type: 'conjunction' }).format(sansRien.map(libelleCourt)) }) : null;

  if (jours.length === 0) {
    return <p className="rounded-xl border border-border bg-card px-4 py-3 text-ui text-muted-foreground">{t('vide')}</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" data-slot="tournee">
      {jours.map((j) => (
        <div key={j.jour}>
          <p className="border-b border-border px-4 py-2 text-xs font-semibold text-muted-foreground first-letter:uppercase">{libelle(j.jour)}</p>
          <ul className="divide-y divide-border border-b border-border last:border-b-0">
            {j.interventions.map((i) => (
              <Passage key={i.id} ligne={i} />
            ))}
          </ul>
        </div>
      ))}
      {rien ? <p className="border-t border-border px-4 py-2.5 text-ui text-muted-foreground first-letter:uppercase">{rien}</p> : null}
    </div>
  );
}

function Passage({ ligne }: { readonly ligne: InterventionEnFile }) {
  const t = useTranslations('maintenance.prestataire.semaine');
  const f = useFormatteurs();
  const lue = useMaintenanceRequest(ligne.id);
  const fiche = lue.data?.data?.id === ligne.id ? lue.data.data : undefined;
  const acces = fiche?.access ?? null;
  // La rue seule quand elle est servie : le quartier est déjà sur la ligne du bien, au-dessus.
  const adresse = acces ? acces.street || [acces.quarter, acces.city].filter(Boolean).join(', ') : '';
  const itineraire = acces ? directionsUrl(acces) : null;
  const quartier = ligne.property?.location?.quarter ?? null;
  const bien = ligne.property?.title ?? null;
  const lieu = [bien, quartier && !bien?.includes(quartier) ? quartier : null].filter(Boolean).join(' · ');

  return (
    <li className="flex gap-3 px-4 py-3" data-slot="passage">
      <span className="w-10 flex-none pt-0.5 text-corps font-semibold tabular-nums">{f.heure(ligne.scheduled_at)}</span>
      <span className="min-w-0 flex-1">
        <Link href={`/app/maintenance/${ligne.id}`} className="block text-corps font-semibold leading-tight hover:underline">
          {ligne.title}
        </Link>
        {lieu ? <span className="mt-0.5 block text-ui text-muted-foreground">{lieu}</span> : null}
        {adresse ? (
          <span className="mt-1 flex items-start gap-1 text-ui">
            <MapPin className="mt-0.5 size-3.5 flex-none text-muted-foreground" aria-hidden="true" />
            {adresse}
          </span>
        ) : null}
        {itineraire || acces?.instructions ? (
          <span className="mt-2.5 flex flex-wrap gap-2">
            {itineraire ? (
              <a href={itineraire} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                <Navigation aria-hidden="true" />
                {t('itineraire')}
              </a>
            ) : null}
            {acces?.instructions ? (
              <Link href={`/app/maintenance/${ligne.id}`} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                <KeyRound aria-hidden="true" />
                {t('kit')}
              </Link>
            ) : null}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** La couleur d'un créneau se décide ici, par ce qu'il est pour le prestataire, jamais au rendu. */
const CLASSES_DU_CRENEAU: Readonly<Record<GenreDuCreneau, string>> = {
  prevu: 'bg-primary text-primary-foreground',
  attente: 'border border-dashed border-primary bg-secondary text-primary-deep',
  fait: 'bg-muted text-muted-foreground',
};

function GrilleDeLaSemaineVue({ grille, aujourdhui }: { readonly grille: GrilleDeLaSemaine; readonly aujourdhui: string }) {
  const t = useTranslations('maintenance.prestataire.semaine');
  const f = useFormatteurs();
  const colonnes = { gridTemplateColumns: `3.25rem repeat(${grille.jours.length}, minmax(0, 1fr))` };
  const premiere = grille.heures[0];
  const hauteur = `${HAUTEUR_D_UNE_HEURE_REM}rem`;

  return (
    <section
      aria-label={t('grille', { debut: f.jourMois(midi(grille.jours[0])), fin: f.jourMois(midi(grille.jours.at(-1) ?? grille.jours[0])) })}
      className="overflow-x-auto rounded-xl border border-border bg-card"
      data-slot="grille-de-la-semaine"
    >
      <div className="min-w-[32.5rem]">
        <div className="grid border-b border-border text-xs" style={colonnes}>
          <span />
          {grille.jours.map((j) => {
            const libelle = f.date(midi(j), { dateStyle: undefined, weekday: 'short', day: 'numeric' });
            return (
              <span
                key={j}
                className={cn('border-l border-border px-2 py-2.5 font-medium first-letter:uppercase', j === aujourdhui ? 'bg-secondary/70 text-primary-deep' : 'text-muted-foreground')}
              >
                {j === aujourdhui ? t('aujourdhui', { jour: libelle }) : libelle}
              </span>
            );
          })}
        </div>
        <div className="grid" style={colonnes}>
          <div>
            {grille.heures.map((h) => (
              <p key={h} className="pt-1 pr-2 text-right text-legende text-muted-foreground tabular-nums" style={{ height: hauteur }}>
                {t('heure', { h })}
              </p>
            ))}
          </div>
          {grille.jours.map((j) => (
            <div key={j} className={cn('relative border-l border-border', j === aujourdhui && 'bg-secondary/30')}>
              {grille.heures.map((h) => (
                <span key={h} className="block border-b border-border/60" style={{ height: hauteur }} />
              ))}
              {grille.creneaux
                .filter((c) => c.jour === j)
                .map((c) => {
                  const quartier = c.intervention.property?.location?.quarter ?? c.intervention.property?.title ?? '';
                  const etat = c.genre === 'prevu' ? null : t(`genre.${c.genre}`);
                  return (
                    <Link
                      key={c.intervention.id}
                      href={`/app/maintenance/${c.intervention.id}`}
                      data-slot="creneau"
                      data-genre={c.genre}
                      className={cn('absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1.5 text-xs leading-tight', CLASSES_DU_CRENEAU[c.genre])}
                      style={{ top: `${(c.de - premiere) * HAUTEUR_D_UNE_HEURE_REM + 0.125}rem`, height: `${HAUTEUR_D_UNE_HEURE_REM - 0.25}rem` }}
                    >
                      <span className="block truncate font-semibold">{c.intervention.title}</span>
                      <span className="block truncate">{[quartier, etat].filter(Boolean).join(' · ')}</span>
                    </Link>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MesFactures({ moi }: { readonly moi: number | undefined }) {
  const t = useTranslations('maintenance.prestataire.factures');
  const tCommon = useTranslations('common');
  const f = useFormatteurs();
  const factures = useFacturesDuPrestataire(moi);
  const aPercevoirLues = useFacturesAPercevoir(moi);

  const lignes = factures.data?.data ?? [];
  const total = factures.data?.meta?.total ?? lignes.length;
  const lues = aPercevoirLues.data?.data ?? [];
  const nbAPercevoir = aPercevoirLues.data?.meta?.total ?? lues.length;
  const somme = aPercevoirLues.data ? aPercevoir(lues, nbAPercevoir) : null;

  return (
    <section aria-labelledby="prestataire-factures" className="space-y-3" data-slot="mes-factures">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="prestataire-factures" className="font-display text-lg font-semibold tracking-titre">
          {t('titre')}
        </h2>
        {total > FACTURES_DU_PRESTATAIRE_PAR_PAGE ? (
          <Link href={LIEN_DES_FACTURES} className="flex-none text-sm font-medium text-primary-deep hover:underline">
            {t('toutes')}
          </Link>
        ) : null}
      </div>
      {factures.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : factures.isError ? (
        <ErrorState message={t('erreur')} onRetry={() => void factures.refetch()} retryLabel={tCommon('actions.retry')} />
      ) : lignes.length === 0 ? (
        <EmptyState icon={<ReceiptText aria-hidden="true" />} title={t('vide')} description={t('videTexte')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {lignes.map((b) => (
              <CarteDeFacture key={b.id} facture={b} />
            ))}
          </ul>
          {/* Au-delà de ce que l'API rend en une page, le total lu serait faux : le compte reste, sans montant. */}
          {aPercevoirLues.data ? (
            <div className="flex items-baseline justify-between gap-3 border-t border-foreground/20 px-4 py-3" data-slot="a-percevoir">
              <span className="text-corps font-semibold">{t('aPercevoir')}</span>
              {somme !== null ? (
                <span className="font-display text-xl font-semibold tracking-titre tabular-nums">{f.montant(somme, 'XOF')}</span>
              ) : (
                <span className="text-corps text-muted-foreground tabular-nums" data-slot="a-percevoir-compte">
                  {t('aPercevoirCompte', { n: nbAPercevoir })}
                </span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CarteDeFacture({ facture }: { readonly facture: ServiceProviderBill }) {
  const t = useTranslations('maintenance.prestataire.factures');
  const tStatut = useTranslations('payments.serviceProviderBills.status');
  const f = useFormatteurs();
  const objet = facture.maintenance_request?.title ?? facture.reference_number ?? '';
  const source = [facture.reference_number, facture.property?.title].filter(Boolean).join(' · ');
  const detail =
    facture.status === 'pending_validation' && facture.created_at
      ? t('envoyee', { date: f.jourMois(facture.created_at) })
      : facture.status === 'validated' && facture.validated_at
        ? t('validee', { date: f.jourMois(facture.validated_at) })
        : null;

  return (
    <li className="px-4 py-3" data-slot="carte-de-facture">
      <div className="flex items-baseline gap-3">
        <p className="min-w-0 flex-1 truncate text-corps font-medium">{objet}</p>
        <p className="flex-none text-corps font-semibold tabular-nums">{f.montant(facture.amount, facture.currency)}</p>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{source}</p>
        {detail ? <span className="flex-none text-xs text-muted-foreground">{detail}</span> : null}
        <StatusBadge tone={SERVICE_PROVIDER_BILL_STATUS_TONE[facture.status]} label={tStatut(facture.status)} className="flex-none" />
      </div>
    </li>
  );
}
