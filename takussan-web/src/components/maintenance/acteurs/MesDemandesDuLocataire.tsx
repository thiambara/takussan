'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Camera, Check, ChevronRight, Plus, ThumbsUp, Wrench } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { StatusBadge } from '@/components/console/StatusBadge';
import { EmptyState, ErrorState } from '@/components/feedback';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { DATE_COURTE, useFormatteurs } from '@/lib/format/useFormatteurs';
import { joursAvant, type InterventionEnFile } from '@/lib/maintenance/files';
import { jourRelatif, repartirDemandes } from '@/lib/maintenance/mes-demandes';
import { estTuileDuLocataire } from '@/lib/maintenance/signalement';
import { useConfirmMaintenanceResolution, useContestMaintenanceResolution, useMaintenanceRequest } from '@/lib/queries/maintenance';
import { DEMANDES_DU_LOCATAIRE_PAR_PAGE, useDemandesDuLocataire } from '@/lib/queries/maintenance-signalement';
import { reduirePhotos } from '@/lib/reduire-photo';
import { cn } from '@/lib/utils';
import type { MaintenanceCategory } from '@/types/maintenance';

import { EtapesDeLaDemande } from './EtapesDeLaDemande';

/** Les bornes de `ContestMaintenanceResolutionRequest` (comme `MaintenanceResolutionResponse`). */
const COMMENTAIRE_MIN = 3;
const PHOTOS_MAX = 5;
/** « Terminées » en montre trois ; au-delà, « Tout voir ». */
const CLOSES_MONTREES = 3;
const LIEN_DES_CLOSES = '/app/maintenance?status=closed,cancelled';

/**
 * TCK-2654, lot 2 — « Interventions » du locataire. Maquette retenue : `app-interventions` a, écran
 * « Locataire — mes demandes, « C'est réparé ? » » (téléphone ; bureau : deux colonnes dès `xl`).
 *
 *  · En tête, la demande TERMINÉE la plus récente, quand le locataire peut y répondre — les gestes
 *    viennent de la fiche (`abilities.can_confirm_resolution|can_contest_resolution`, servis au détail
 *    seulement) : sans eux, la carte n'est pas rendue et la demande reste « En cours ».
 *  · « Le problème persiste » ouvre, dans la carte, le mot et les photos (≤ 5) que l'API demande.
 *  · Aucun montant : la liste ne lit aucune colonne de coût ni de devis (décision famille 4 n° 6a).
 *  · La carte en tête est un aplat de succès (`success/5`, comme `MaintenanceResolutionResponse`) et non
 *    l'aplat d'accent de la maquette : l'accent est réservé aux badges *featured* (check-valeurs-arbitraires-app).
 *  · Sans demande : un état vide qui parle du logement, jamais d'un filtre.
 *
 * Écarts de donnée à la maquette : le métier de l'artisan (« plombière ») et la fenêtre du créneau
 * (« entre 9 h et 11 h ») ne sont pas servis ; « Changer le créneau » n'a pas de route pour le
 * locataire ; « Écrire à l'agence » est le fil de la fiche (« Discuter »), servi au détail.
 */
export function MesDemandesDuLocataire() {
  const t = useTranslations('maintenance.locataire.demandes');
  const tCommon = useTranslations('common');
  const lu = useDemandesDuLocataire();

  const demandes = lu.data?.data ?? [];
  const { aConfirmer, enCours, closes } = repartirDemandes(demandes);
  const enTete = aConfirmer[0] ?? null;
  const fiche = useMaintenanceRequest(enTete?.id ?? null);
  const detail = fiche.data?.data ?? null;
  const peutRepondre =
    detail !== null && detail.id === enTete?.id && (detail.abilities?.can_confirm_resolution === true || detail.abilities?.can_contest_resolution === true);
  // Une terminée sans geste possible (ou dont la fiche n'est pas encore lue) se lit « En cours ».
  const enCoursRendues = peutRepondre ? [...aConfirmer.slice(1), ...enCours] : [...aConfirmer, ...enCours];
  const bien = demandes[0]?.property?.title ?? null;
  const total = lu.data?.meta?.total ?? demandes.length;

  const signaler = (
    <Link href="/app/maintenance/new" className={buttonVariants()}>
      <Camera aria-hidden="true" />
      {t('signaler')}
    </Link>
  );

  return (
    <PagePleineLargeur>
      <div className="space-y-6 max-md:px-4 max-md:pt-4 max-md:pb-8" data-slot="demandes-du-locataire">
        <DeclarerEnTete
          titre={t('titre')}
          action={<ActionDEnTete libelle={t('signaler')} icone={<Plus className="size-5" aria-hidden="true" />} href="/app/maintenance/new" primaire />}
        />
        <div className="max-md:hidden">
          <PageHeader
            title={t('titre')}
            description={
              lu.data && demandes.length > 0
                ? t(bien ? 'sousTitre' : 'sousTitreSansBien', { bien: bien ?? '', attente: peutRepondre ? 1 : 0, enCours: enCoursRendues.length })
                : undefined
            }
            actions={signaler}
          />
        </div>

        {lu.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : lu.isError ? (
          <ErrorState message={t('erreur')} onRetry={() => void lu.refetch()} retryLabel={tCommon('actions.retry')} />
        ) : demandes.length === 0 ? (
          <EmptyState icon={<Wrench aria-hidden="true" />} title={t('vide.titre')} description={t('vide.texte')} action={signaler} />
        ) : (
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
            <div className="min-w-0 space-y-6 xl:flex-[640_1_0%]">
              {peutRepondre && detail ? <CarteAConfirmer demande={{ ...enTete, ...detail }} /> : null}
              {enCoursRendues.length > 0 ? (
                <section aria-labelledby="demandes-en-cours" className="space-y-3">
                  <h2 id="demandes-en-cours" className="font-display text-lg font-semibold tracking-titre">
                    {t('enCours.titre')}
                  </h2>
                  {enCoursRendues.map((d) => (
                    <CarteEnCours key={d.id} demande={d} />
                  ))}
                </section>
              ) : null}
            </div>
            {closes.length > 0 ? (
              <section aria-labelledby="demandes-closes" className="min-w-0 space-y-3 xl:flex-[448.8_1_0%]">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="demandes-closes" className="font-display text-lg font-semibold tracking-titre">
                    {t('closes.titre')}
                  </h2>
                  {closes.length > CLOSES_MONTREES || total > DEMANDES_DU_LOCATAIRE_PAR_PAGE ? (
                    <Link href={LIEN_DES_CLOSES} className="flex-none text-sm font-medium text-primary-deep hover:underline">
                      {t('closes.toutVoir')}
                    </Link>
                  ) : null}
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {closes.slice(0, CLOSES_MONTREES).map((d) => (
                    <LigneClose key={d.id} demande={d} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </PagePleineLargeur>
  );
}

function useCategorie() {
  const tTuiles = useTranslations('maintenance.locataire.signaler.tuiles');
  const tCategorie = useTranslations('maintenance.category');
  return (c: MaintenanceCategory) => (estTuileDuLocataire(c) ? tTuiles(c) : tCategorie(c));
}

function useQuand() {
  const f = useFormatteurs();
  const jourDe = (d: Date) => f.date(d, DATE_COURTE);
  return (iso: string | null | undefined) => ({
    jour: jourRelatif(iso, new Date(), jourDe),
    date: f.jourMois(iso),
    heure: f.heure(iso),
  });
}

function CarteAConfirmer({ demande }: { readonly demande: InterventionEnFile }) {
  const t = useTranslations('maintenance.locataire.demandes.aConfirmer');
  const tR = useTranslations('maintenance.intervention.resolution');
  const quand = useQuand();
  const messageErreur = useMessageErreurApi();
  const confirmer = useConfirmMaintenanceResolution(demande.id);
  const contester = useContestMaintenanceResolution(demande.id);
  const [persiste, setPersiste] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [erreurPhotos, setErreurPhotos] = useState<string | null>(null);

  const peutConfirmer = demande.abilities?.can_confirm_resolution === true;
  const peutContester = demande.abilities?.can_contest_resolution === true;
  const enVol = confirmer.isPending || contester.isPending;
  const erreur = confirmer.error ?? contester.error;
  const jours = joursAvant(demande.auto_close_at, new Date());
  const nom = demande.assignee?.name ?? null;
  const fin = quand(demande.completed_at);

  const envoyer = async () => {
    await contester.mutateAsync({ comment: commentaire.trim(), photos: photos.length > 0 ? await reduirePhotos(photos) : undefined });
    setPersiste(false);
    setCommentaire('');
    setPhotos([]);
  };

  return (
    <section aria-labelledby="demande-a-confirmer" className="rounded-2xl border border-success/20 bg-success/5 p-5" data-slot="demande-a-confirmer">
      <p className="text-sm font-semibold text-success">{tR('title')}</p>
      <h2 id="demande-a-confirmer" className="mt-1 font-display text-xl font-semibold leading-snug tracking-titre">
        {t('question', { titre: demande.title })}
      </h2>
      <p className="mt-2 text-corps leading-snug text-encre-douce">
        {demande.completed_at ? t(nom ? 'termineePar' : 'terminee', { nom: nom ?? '', ...fin }) : null}
        {demande.completed_at && jours !== null ? ' ' : null}
        {jours !== null ? t('cloture', { jours }) : null}
      </p>

      {persiste ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (commentaire.trim().length < COMMENTAIRE_MIN) return;
            void envoyer().catch(() => undefined);
          }}
        >
          <label htmlFor="persiste-commentaire" className="block text-sm font-medium">
            {tR('comment_label')}
          </label>
          <Textarea id="persiste-commentaire" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={3} placeholder={tR('comment_placeholder')} />
          <label className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full cursor-pointer has-focus-visible:ring-3 has-focus-visible:ring-ring')}>
            <Camera aria-hidden="true" />
            {photos.length > 0 ? t('photos', { n: photos.length }) : tR('photos_label')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              multiple
              className="sr-only"
              data-slot="photos-persiste"
              onChange={(e) => {
                const choisies = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (choisies.length > PHOTOS_MAX) {
                  setPhotos([]);
                  setErreurPhotos(tR('max_files', { max: PHOTOS_MAX }));
                  return;
                }
                setErreurPhotos(null);
                setPhotos(choisies);
              }}
            />
          </label>
          {erreurPhotos ? (
            <p role="alert" className="text-xs text-destructive">
              {erreurPhotos}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="lg" className="flex-1" disabled={enVol || commentaire.trim().length < COMMENTAIRE_MIN}>
              {tR('send_contest')}
            </Button>
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => setPersiste(false)}>
              {tR('back')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="mt-4 flex gap-2">
            {peutConfirmer ? (
              <Button type="button" size="lg" className="min-w-0 flex-1 bg-success text-success-foreground hover:bg-success/90" disabled={enVol} onClick={() => confirmer.mutate()}>
                <ThumbsUp aria-hidden="true" />
                {tR('confirm')}
              </Button>
            ) : null}
            {peutContester ? (
              <Button type="button" variant="outline" size="lg" className="min-w-0 flex-1" disabled={enVol} onClick={() => setPersiste(true)}>
                {tR('contest')}
              </Button>
            ) : null}
          </div>
          {peutContester ? <p className="mt-2.5 text-xs text-encre-douce">{t('aidePersiste')}</p> : null}
        </>
      )}

      {erreur ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {messageErreur(erreur, tR('failed'))}
        </p>
      ) : null}
    </section>
  );
}

function CarteEnCours({ demande }: { readonly demande: InterventionEnFile }) {
  const t = useTranslations('maintenance.locataire.demandes.enCours');
  const quand = useQuand();
  const nom = demande.assignee?.name ?? null;
  const signalee = quand(demande.created_at);

  return (
    <article className="relative rounded-xl border border-border bg-card p-4 focus-within:ring-3 focus-within:ring-ring" data-slot="demande-en-cours" data-id={demande.id}>
      <div className="flex items-center gap-2">
        {demande.priority === 'urgent' ? <StatusBadge label={t('urgente')} tone="danger" /> : null}
        <span className="text-xs text-muted-foreground">{t('signalee', signalee)}</span>
      </div>
      <h3 className="mt-1.5 text-base font-semibold">
        <Link href={`/app/maintenance/${demande.id}`} className="outline-none after:absolute after:inset-0 after:rounded-xl">
          {demande.title}
        </Link>
      </h3>
      {nom ? (
        <p className="mt-0.5 text-corps leading-snug">
          {demande.scheduled_at
            ? t.rich('passe', { nom, ...quand(demande.scheduled_at), fort: (c) => <span className="font-medium">{c}</span> })
            : t.rich('sOccupe', { nom, fort: (c) => <span className="font-medium">{c}</span> })}
        </p>
      ) : null}
      <EtapesDeLaDemande statut={demande.status} className="mt-4" />
    </article>
  );
}

function LigneClose({ demande }: { readonly demande: InterventionEnFile }) {
  const t = useTranslations('maintenance.locataire.demandes.closes');
  const categorie = useCategorie();
  const f = useFormatteurs();
  return (
    <li>
      <Link href={`/app/maintenance/${demande.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/50">
        <Check className="size-4 flex-none text-success" aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-corps font-medium">{demande.title}</span>
          <span className="block text-ui text-muted-foreground">
            {demande.status === 'cancelled'
              ? t('annulee', { categorie: categorie(demande.category) })
              : demande.completed_at
                ? t('termineeLe', { categorie: categorie(demande.category), date: f.jourMois(demande.completed_at) })
                : t('close', { categorie: categorie(demande.category) })}
          </span>
        </span>
        <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
