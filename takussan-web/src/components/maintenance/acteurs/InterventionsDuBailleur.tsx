'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { EmptyState, ErrorState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { DecisionDuDevis } from '@/components/maintenance/acteurs/DecisionDuDevis';
import { Skeleton } from '@/components/ui/skeleton';
import { DATE_COURTE, useFormatteurs } from '@/lib/format/useFormatteurs';
import { montantDUneLigne, plafondARappeler, sousLeSeuil, STATUTS_EN_COURS_DU_BAILLEUR, type FicheDuBailleur } from '@/lib/maintenance/devis-du-bailleur';
import { dureeDepuis, type InterventionEnFile } from '@/lib/maintenance/files';
import { jourRelatif } from '@/lib/maintenance/mes-demandes';
import { useMaintenanceRequest } from '@/lib/queries/maintenance';
import { EN_COURS_DU_BAILLEUR_PAR_PAGE, useDevisAttendantLeBailleur, useEnCoursDuBailleur } from '@/lib/queries/maintenance-signalement';

/** « Tout voir » : la liste complète sur les mêmes statuts, avec sa recherche et ses filtres. */
const LIEN_DE_LA_LISTE = `/app/maintenance?status=${STATUTS_EN_COURS_DU_BAILLEUR.join(',')}`;

/**
 * TCK-2654, lot 3 — « Interventions » du bailleur. Maquette retenue : `app-interventions` a, écran
 * « Bailleur — devis à approuver » (téléphone ; bureau : deux colonnes dès `xl`).
 *
 *  · En tête, chaque devis qui attend son accord (`awaiting_owner`, filtré par l'API), avec ses
 *    lignes, son total (`quote_amount`, jamais une somme refaite ici) et le rappel du plafond qu'il
 *    a fixé : « Au-dessus de {seuil}, votre mandat prévoit votre accord. » Le plafond et les gestes
 *    viennent de la fiche (`owner_approval_threshold`, `abilities.can_decide_quote`, servis au
 *    détail seulement). Sans geste, la carte n'offre ni « Approuver » ni « Refuser ».
 *  · La décision du devis (lignes, total, rappel du plafond, « Approuver {montant} », « Refuser »)
 *    vit dans `DecisionDuDevis`, que l'accueil du bailleur monte aussi (TCK-2624).
 *  · « En cours sur vos biens » : le titre, le bien et l'artisan, le passage prévu, le montant,
 *    « Devis approuvé le … » quand une décision est datée, et « Sous le seuil : sans accord » quand
 *    la fiche de la ligne sert un plafond que le devis ne dépasse pas (`sousLeSeuil`).
 *
 * Écarts de donnée à la maquette (décision 2 : rien d'inventé) : le métier, la note et le nombre
 * d'interventions de l'artisan, la consultation d'autres artisans par l'agence, le numéro du devis,
 * « l'agence vous proposera une autre solution » (remplacé par ce que la machine d'état garantit,
 * voir `DecisionDuDevis`), et le bloc « Depuis janvier » (aucune somme « à votre charge » ni aucun
 * filtre de date n'est servi).
 */
export function InterventionsDuBailleur() {
  const t = useTranslations('maintenance.bailleur');
  const tCommon = useTranslations('common');
  const devis = useDevisAttendantLeBailleur();
  const enCours = useEnCoursDuBailleur();

  const aDecider = devis.data?.data ?? [];
  const lignes = enCours.data?.data ?? [];
  const nbDevis = devis.data?.meta?.total ?? aDecider.length;
  const nbEnCours = enCours.data?.meta?.total ?? lignes.length;
  const charge = devis.isPending || enCours.isPending;
  const erreur = devis.isError || enCours.isError;

  return (
    <PagePleineLargeur>
      <div className="space-y-6 max-md:px-4 max-md:pt-4 max-md:pb-8" data-slot="interventions-du-bailleur">
        <DeclarerEnTete titre={t('titre')} />
        <div className="max-md:hidden">
          <PageHeader title={t('titre')} description={charge || erreur ? undefined : t('sousTitre', { devis: nbDevis, enCours: nbEnCours })} />
        </div>

        {charge ? (
          <div className="space-y-4">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : erreur ? (
          <ErrorState
            message={t('erreur')}
            onRetry={() => {
              void devis.refetch();
              void enCours.refetch();
            }}
            retryLabel={tCommon('actions.retry')}
          />
        ) : aDecider.length === 0 && lignes.length === 0 ? (
          <EmptyState icon={<Wrench aria-hidden="true" />} title={t('vide.titre')} description={t('vide.texte')} />
        ) : (
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
            {aDecider.length > 0 ? (
              <div className="min-w-0 space-y-6 xl:flex-[660_1_0%]">
                {aDecider.map((d) => (
                  <CarteDuDevis key={d.id} ligne={d} />
                ))}
              </div>
            ) : null}
            {lignes.length > 0 ? (
              <section aria-labelledby="bailleur-en-cours" className="min-w-0 space-y-3 xl:flex-[428.8_1_0%]">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="bailleur-en-cours" className="font-display text-lg font-semibold tracking-titre">
                    {t('enCours.titre')}
                  </h2>
                  {nbEnCours > EN_COURS_DU_BAILLEUR_PAR_PAGE ? (
                    <Link href={LIEN_DE_LA_LISTE} className="flex-none text-sm font-medium text-primary-deep hover:underline">
                      {t('enCours.toutVoir')}
                    </Link>
                  ) : null}
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {lignes.map((l) => (
                    <LigneEnCours key={l.id} ligne={l} />
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

function CarteDuDevis({ ligne }: { readonly ligne: InterventionEnFile }) {
  const t = useTranslations('maintenance.bailleur.devis');
  const lue = useMaintenanceRequest(ligne.id);

  const fiche = lue.data?.data?.id === ligne.id ? (lue.data.data as FicheDuBailleur) : undefined;
  const demande = { ...ligne, ...(fiche ?? {}) } as FicheDuBailleur & InterventionEnFile;
  const attente = dureeDepuis(ligne.waiting_since ?? ligne.quote_submitted_at, new Date());
  const demandeur = demande.requester?.name ?? null;
  const bien = demande.property?.title ?? null;

  return (
    <section aria-labelledby={`devis-${ligne.id}`} className="rounded-2xl border border-warning/25 bg-warning/10 p-5" data-slot="devis-a-decider">
      <p className="text-sm font-semibold text-warning">
        {attente ? t('attendu', { n: attente.n, unite: attente.unite }) : t('attenduSansDuree')}
      </p>
      <h2 id={`devis-${ligne.id}`} className="mt-1 font-display text-xl font-semibold leading-snug tracking-titre">
        {demande.title}
      </h2>
      {bien ? (
        <p className="mt-0.5 text-corps text-encre-douce">{demandeur ? t('lieuEtDemandeur', { bien, nom: demandeur }) : bien}</p>
      ) : null}
      <div className="mt-4">
        <DecisionDuDevis ligne={ligne} avecPhotos />
      </div>
    </section>
  );
}

function LigneEnCours({ ligne }: { readonly ligne: InterventionEnFile }) {
  const t = useTranslations('maintenance.bailleur.enCours');
  const tStatut = useTranslations('maintenance.status');
  const f = useFormatteurs();
  const jourDe = (d: Date) => f.date(d, DATE_COURTE);
  const montant = montantDUneLigne(ligne);
  // Le plafond n'est servi qu'au détail (décision 1a) : la ligne lit sa fiche. Un échec de lecture
  // ne masque que la mention, sans erreur à l'écran.
  const lue = useMaintenanceRequest(ligne.id);
  const fiche = lue.data?.data?.id === ligne.id ? (lue.data.data as FicheDuBailleur) : undefined;
  const sansAccord = sousLeSeuil(ligne.quote_amount, plafondARappeler(fiche));
  const bien = ligne.property?.title ?? null;
  const artisan = ligne.assignee?.name ?? null;
  const lieu = [bien, artisan].filter((x): x is string => x !== null).join(' · ');

  return (
    <li className="relative flex items-start gap-3 px-4 py-3" data-slot="bailleur-en-cours">
      <span className="min-w-0 flex-1 leading-tight">
        <Link href={`/app/maintenance/${ligne.id}`} className="block text-corps font-semibold after:absolute after:inset-0">
          {ligne.title}
        </Link>
        {lieu ? <span className="mt-0.5 block text-ui text-muted-foreground">{lieu}</span> : null}
        <span className="mt-1 block text-ui">
          {ligne.scheduled_at
            ? t('passage', { jour: jourRelatif(ligne.scheduled_at, new Date(), jourDe), date: f.jourMois(ligne.scheduled_at), heure: f.heure(ligne.scheduled_at) })
            : tStatut(ligne.status)}
        </span>
      </span>
      {montant !== null || ligne.quote_decision_at || sansAccord ? (
        <span className="flex-none text-right leading-tight">
          {montant !== null ? <span className="block text-corps font-semibold tabular-nums">{f.montant(montant, ligne.quote_currency ?? undefined)}</span> : null}
          {ligne.quote_decision_at ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">{t('approuve', { date: f.jourMois(ligne.quote_decision_at) })}</span>
          ) : null}
          {sansAccord ? (
            <span className="mt-0.5 block text-xs text-muted-foreground" data-slot="sous-le-seuil">
              {t('sousLeSeuil')}
            </span>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}
