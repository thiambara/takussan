'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, Download, MoreHorizontal, Share2, Trash2, TriangleAlert } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { StatusBadge } from '@/components/console/StatusBadge';
import { ErrorState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { echeanceDe } from '@/lib/documents/coffre';
import { formatDuFichier, seVersionne, tailleDuFichier } from '@/lib/documents/fiche';
import { CLE_DE_LA_PROMESSE, estDeMesPieces, rappelAVenir } from '@/lib/documents/rappel-d-expiration';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useDocumentWithVersions } from '@/lib/queries/documents';
import { cn } from '@/lib/utils';
import { jourADakar } from '@/lib/visites/par-le-temps';
import type { DocumentType, DocumentWithVersions } from '@/types/document';

import { DOCUMENT_TYPE_ORDER } from './constants';
import { ApercuDuDocument } from './fiche/ApercuDuDocument';
import { useNomDAuteur } from './fiche/auteur';
import { Carte, Paire } from './fiche/blocs';
import { LiensDePartage, PartagerParLien, useSuiviDesLiens } from './fiche/PartageDuDocument';
import { SuppressionDuDocument } from './fiche/SuppressionDuDocument';
import { VersionsDuDocument } from './fiche/VersionsDuDocument';

interface DocumentDetailClientProps {
  readonly documentId: number;
}

/**
 * TCK-2656 (lot 3) — la fiche d'un document : aperçu, nom et marques, métadonnées, « Versions (n) »,
 * « Liens de partage (n) », « Télécharger », « Partager » et « Supprimer ce document ».
 *
 * Maquette : `FicheMobile` et `FicheBureau` (`app-documents-a.tsx`). Au téléphone, l'aperçu bord à bord
 * puis le nom, la barre collante « Télécharger » / « Partager », « Supprimer ce document » en bas ; au
 * bureau, l'en-tête (fil, nom, marques, « … », « Télécharger », « Partager ») puis, dès `xl`, l'aperçu
 * à gauche et une colonne de 400 px à droite.
 *
 * Chaque geste suit le verdict de l'API (`abilities`, TCK-1867) : « Ajouter une version » et
 * « Restaurer » `update` (hors pièce de profil, `seVersionne`), « Partager » et les liens `share`,
 * « Supprimer » `delete`. Les noms (auteur, vérificateur, entité de rattachement) ne sont pas servis :
 * « vous » quand c'est l'appelant, la date seule sinon — écarts « donnée » de la fiche de fidélité.
 */
export function DocumentDetailClient({ documentId }: DocumentDetailClientProps) {
  const t = useTranslations('documents.detail');
  const tCommon = useTranslations('common');
  const tPage = useTranslations('dashboard.pages.documentDetail');
  const messageErreur = useMessageErreurApi();
  const documentQuery = useDocumentWithVersions(documentId);
  const { data, isLoading, isError } = documentQuery;
  const document = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        {/* TCK-1189 (P101.02) — chargement et erreur gardent leur h1. */}
        <h1 className="sr-only">{tPage('metaTitle')}</h1>
        <span className="sr-only">{t('loading')}</span>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  if (isError || !document) {
    // TCK-2807 — trois cas, comme `QueryBoundary` (TCK-2751) : un 403 dit le refus (jamais
    // « introuvable »), un 404 dit « introuvable », et ni l'un ni l'autre ne propose « Réessayer », qui
    // n'y changerait rien. Seule une panne (5xx, réseau) garde sa reprise, avec le message de l'API.
    const statut = documentQuery.error instanceof ApiError ? documentQuery.error.status : null;
    const panne = isError && statut !== 403 && statut !== 404;
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="sr-only">{tPage('metaTitle')}</h1>
        {panne ? (
          <ErrorState
            message={messageErreur(documentQuery.error, tCommon('status.error'))}
            onRetry={() => void documentQuery.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        ) : (
          <ErrorState message={statut === 403 ? t('forbidden') : t('not_found')} />
        )}
      </div>
    );
  }

  return <FicheDuDocument document={document} />;
}

function FicheDuDocument({ document }: { readonly document: DocumentWithVersions }) {
  const t = useTranslations('documents.fiche');
  const tDetail = useTranslations('documents.detail');
  const tMarques = useTranslations('documents.coffre.marques');
  const tTypes = useTranslations('documents.types');
  const tLib = useTranslations('documents.library');
  const tPages = useTranslations('dashboard.pages');
  const tConsole = useTranslations('console.pageHeader');
  const f = useFormatteurs();
  const { user } = useAuth();
  // TCK-2773 — qui a ajouté, vérifié : le nom ou le rôle que l'API sert au lecteur.
  const nomDe = useNomDAuteur();
  const bureau = useMatchesMedia('(width >= 48rem)');
  const suivi = useSuiviDesLiens();
  const [partage, setPartage] = useState(false);
  const [suppression, setSuppression] = useState(false);

  const peutPartager = document.abilities?.share === true;
  // TCK-2729 (5a) — le bailleur bloqué ne partage plus, mais voit et révoque les liens qu'il a créés : la liste
  // sans « Partager » (ni en-tête, ni barre collante, ni feuille du bas).
  const sesLiensSeuls = !peutPartager && document.abilities?.manage_own_share_links === true;
  const peutSupprimer = document.abilities?.delete === true;
  const peutRestaurer = document.abilities?.update === true;
  const moi = (id: number | null) => user !== null && id !== null && id === user.id;

  /* ── Marques : vérification, échéance ── */
  const aujourdhui = jourADakar(new Date());
  const echeance = echeanceDe(document.expiry_date, aujourdhui);
  // TCK-2783 — la promesse du prochain rappel (J-60 ou J-7), sur une pièce de « Mes pièces ».
  const promesse = estDeMesPieces(document, user?.id) ? rappelAVenir(document.expiry_date, aujourdhui) : null;
  const marques = (
    <span className="flex flex-wrap items-center gap-1.5">
      {document.is_verified ? (
        <StatusBadge tone="success" icon={<BadgeCheck aria-hidden="true" />} label={tDetail('verified')} className="text-legende" />
      ) : (
        <StatusBadge tone="neutral" label={tDetail('not_verified')} className="text-legende" />
      )}
      {echeance?.etat === 'bientot' || echeance?.etat === 'aujourdhui' ? (
        <StatusBadge
          tone="attention"
          icon={<TriangleAlert aria-hidden="true" />}
          label={echeance.etat === 'bientot' ? tMarques('expireDans', { jours: echeance.jours }) : tMarques('expireAujourdhui')}
          className="text-legende font-semibold"
        />
      ) : echeance?.etat === 'expiree' ? (
        <StatusBadge tone="danger" label={tMarques('expireeLe', { date: f.jourMois(echeance.le) })} className="text-legende" />
      ) : echeance?.etat === 'plusTard' ? (
        <span className="whitespace-nowrap text-legende text-muted-foreground">{tMarques('expireLe', { date: f.jourMois(echeance.le) })}</span>
      ) : null}
      {promesse ? <span className="text-legende text-muted-foreground">{tMarques(CLE_DE_LA_PROMESSE[promesse])}</span> : null}
    </span>
  );

  /* ── Fichier : « JPG · 2,4 Mo » ── */
  const format = formatDuFichier(document.file_name, document.mime_type);
  const taille = tailleDuFichier(document.file_size);
  const fichier = [format, taille ? t(taille.unite === 'Mo' ? 'tailleMo' : 'tailleKo', { n: f.nombre(taille.valeur, taille.unite === 'Mo' ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : undefined) }) : null]
    .filter(Boolean)
    .join(' · ');

  const ajoute = document.created_at ? f.date(document.created_at) : null;
  const verifie = document.verified_at ? f.date(document.verified_at) : null;
  const ajoutePar = nomDe(document.uploaded_by_person);
  const verifiePar = nomDe(document.verified_by_person);
  const categorie = document.type
    ? DOCUMENT_TYPE_ORDER.includes(document.type as DocumentType)
      ? tTypes(document.type)
      : document.type
    : null;

  /* ── Légende de l'aperçu, au bureau ── */
  const version = document.active_version;
  const dateDuFichier = version?.created_at ? f.date(version.created_at) : ajoute;
  // TCK-2773 — l'auteur du fichier affiché : celui de la version active, sinon celui du document.
  const auteurDuFichier = nomDe(version?.uploaded_by_id != null ? version.uploaded_by_person : document.uploaded_by_person);
  const legende = [
    version ? t('legende.version', { n: version.version_number }) : null,
    fichier || null,
    dateDuFichier
      ? moi(version?.uploaded_by_id ?? document.uploaded_by)
        ? t('legende.ajouteeParVous', { date: dateDuFichier })
        : auteurDuFichier
          ? t('legende.ajouteePar', { date: dateDuFichier, qui: auteurDuFichier })
          : t('legende.ajoutee', { date: dateDuFichier })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const telecharger = (classe?: string) =>
    document.file_url ? (
      <a href={document.file_url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline' }), classe)}>
        <Download data-icon="inline-start" aria-hidden="true" />
        {tLib('download')}
      </a>
    ) : null;

  const boutonPartager = (
    <Button type="button" onClick={() => setPartage(true)}>
      <Share2 data-icon="inline-start" aria-hidden="true" />
      {tLib('share')}
    </Button>
  );

  return (
    <PagePleineLargeur className="flex flex-col pb-8 md:pb-0 xl:flex-row xl:flex-wrap xl:items-start xl:gap-x-6">
      {/* Au téléphone, l'en-tête dit « Document » ; le nom est le titre de la page, sous l'aperçu. */}
      <DeclarerEnTete titre={t('titreCourt')} />

      <div className="order-2 px-4 pt-4 md:order-1 md:px-0 md:pt-0 xl:basis-full">
        <PageHeader
          fil={{ label: tConsole('breadcrumb'), etapes: [{ label: tPages('documents.title'), href: '/app/documents' }, { label: document.name }] }}
          title={<span className="break-words">{document.name}</span>}
          description={marques}
          actions={
            bureau && (peutSupprimer || document.file_url || peutPartager) ? (
              <>
                {peutSupprimer ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label={t('plusDActions')} render={<Button type="button" variant="outline" size="icon" />}>
                      <MoreHorizontal aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-destructive data-highlighted:text-destructive" onClick={() => setSuppression(true)}>
                        <Trash2 aria-hidden="true" />
                        {t('supprimer')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                {telecharger()}
                {peutPartager ? (
                  <PartagerParLien open={partage} onOpenChange={setPartage} document={document} suivi={suivi} bureau declencheur={boutonPartager} />
                ) : null}
              </>
            ) : undefined
          }
        />
      </div>

      <div className="order-1 md:order-2 md:mt-6 xl:min-w-0 xl:flex-1">
        <ApercuDuDocument document={document} className="min-h-56 py-6 md:h-[calc(var(--spacing)*144)] md:rounded-xl md:py-0" />
        {legende ? <p className="mt-2 hidden px-1 text-ui text-muted-foreground md:block">{legende}</p> : null}
      </div>

      <aside aria-label={t('aPropos')} className="order-3 mt-4 space-y-6 px-4 md:mt-6 md:px-0 xl:w-[calc(var(--spacing)*111)] xl:flex-none">
        <Carte className="px-4">
          <dl className="divide-y divide-border">
            {categorie ? <Paire libelle={t('meta.categorie')}>{categorie}</Paire> : null}
            {ajoute ? (
              moi(document.uploaded_by) ? (
                <Paire libelle={t('meta.ajoutePar')}>{t('meta.vousLe', { date: ajoute })}</Paire>
              ) : ajoutePar ? (
                <Paire libelle={t('meta.ajoutePar')}>{t('meta.quiLe', { qui: ajoutePar, date: ajoute })}</Paire>
              ) : (
                <Paire libelle={t('meta.ajouteLe')}>{ajoute}</Paire>
              )
            ) : null}
            {document.is_verified && verifie ? (
              moi(document.verified_by) ? (
                <Paire libelle={t('meta.verifiePar')}>{t('meta.vousLe', { date: verifie })}</Paire>
              ) : verifiePar ? (
                <Paire libelle={t('meta.verifiePar')}>{t('meta.quiLe', { qui: verifiePar, date: verifie })}</Paire>
              ) : (
                <Paire libelle={t('meta.verifieLe')}>{verifie}</Paire>
              )
            ) : null}
            {fichier ? <Paire libelle={t('meta.fichier')}>{fichier}</Paire> : null}
            {document.description ? <Paire libelle={t('meta.precision')}>{document.description}</Paire> : null}
          </dl>
        </Carte>

        <VersionsDuDocument documentId={document.id} peutAjouter={seVersionne(document)} peutRestaurer={peutRestaurer} echeanceActuelle={document.expiry_date} />

        {peutPartager || sesLiensSeuls ? <LiensDePartage document={document} suivi={suivi} lesSiens={sesLiensSeuls} /> : null}

        {peutSupprimer ? (
          <button
            type="button"
            onClick={() => setSuppression(true)}
            className="flex min-h-11 w-full items-center justify-center text-sm font-medium text-destructive md:hidden"
          >
            {t('supprimerCeDocument')}
          </button>
        ) : null}
      </aside>

      {/* Téléphone : la barre collante ; « Partager » ouvre la feuille du bas. */}
      {document.file_url || peutPartager ? (
        <BarreDAction>
          {telecharger()}
          {peutPartager ? (
            <Button type="button" onClick={() => setPartage(true)}>
              <Share2 data-icon="inline-start" aria-hidden="true" />
              {tLib('share')}
            </Button>
          ) : null}
        </BarreDAction>
      ) : null}
      {peutPartager && !bureau ? <PartagerParLien open={partage} onOpenChange={setPartage} document={document} suivi={suivi} bureau={false} /> : null}

      {peutSupprimer ? <SuppressionDuDocument document={document} open={suppression} onOpenChange={setSuppression} /> : null}
    </PagePleineLargeur>
  );
}
