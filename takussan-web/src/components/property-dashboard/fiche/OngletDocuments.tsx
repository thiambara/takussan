'use client';

import { useTranslations } from 'next-intl';
import { FileText, Sparkles } from 'lucide-react';

import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { ErreurDeLecture } from '@/components/feedback';
import { useDocuments, useDocumentsGeneres, type DocumentGenere } from '@/lib/queries/documents';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { erreurAMontrer } from '@/lib/nature-de-l-erreur';
import type { Document } from '@/types/document';
import type { PropertyDetail } from '@/types/property';

import { Carte } from './PiecesDeLaLocation';

/** Les pièces d'une cible lues d'un coup : au-delà, le coffre (`/app/documents`) les pagine. */
const PIECES_LUES = 100;

/**
 * TCK-2639 (ADR-0099) — les documents du bien ET de ses baux, comme l'onglet les montre et comme son
 * compteur les compte (AC4) :
 *  · les pièces déposées sur le bien (`GET /api/documents?filter[documentable_type]=property…`) et sur
 *    son bail en cours (`…=lease`) — la liste suit la lecture (§ 1) : tout ce que l'appelant ouvrirait ;
 *  · les documents que la plateforme génère pour le bien et tous ses baux (contrats, états des lieux),
 *    listés depuis leur source (`GET /api/documents/generated?target=property:{id}`, § 3).
 */
export function useDocumentsDuBien(property: PropertyDetail) {
  const bailId = property.occupancy?.lease?.id ?? null;
  const duBien = useDocuments({ documentable_type: 'property', documentable_id: property.id, per_page: PIECES_LUES });
  const duBail = useDocuments({
    documentable_type: 'lease',
    documentable_id: bailId ?? undefined,
    per_page: PIECES_LUES,
    enabled: bailId !== null,
  });
  const generes = useDocumentsGeneres({ type: 'property', id: property.id });
  const deposes: readonly Document[] = [...(duBien.data?.data ?? []), ...(duBail.data?.data ?? [])];
  const generesLus: readonly DocumentGenere[] = generes.data?.data ?? [];
  const lu = duBien.isSuccess && generes.isSuccess && (bailId === null || duBail.isSuccess);
  return {
    deposes,
    generes: generesLus,
    /** Le compte de ce que l'onglet rend ; `null` tant que tout n'est pas lu. */
    total: lu ? deposes.length + generesLus.length : null,
    enChargement: duBien.isPending || generes.isPending || (bailId !== null && duBail.isPending),
    enEchec: duBien.isError || generes.isError || duBail.isError,
    /** TCK-2814 — l'erreur brute à montrer : elle décide de la reprise (`erreurAMontrer`). */
    erreur: erreurAMontrer(duBien.error, generes.error, duBail.error),
    relire: () => {
      void duBien.refetch();
      void generes.refetch();
      if (bailId !== null) void duBail.refetch();
    },
  };
}

export type DocumentsDuBien = ReturnType<typeof useDocumentsDuBien>;

/** Le libellé d'un document généré, par sa catégorie (`DocumentVault`). */
function useLibelleGenere() {
  const t = useTranslations('propertyDashboard.fiche.documents.generes');
  return (doc: DocumentGenere) => {
    if (doc.category === 'lease_contract') return doc.title ? t('contratRef', { reference: doc.title }) : t('contrat');
    if (doc.category === 'inventory_move_in') return t('edlEntree');
    if (doc.category === 'inventory_move_out') return t('edlSortie');
    return doc.title ?? t('autre');
  };
}

export function OngletDocuments({ property, documents }: { readonly property: PropertyDetail; readonly documents: DocumentsDuBien }) {
  const t = useTranslations('propertyDashboard.fiche.documents');
  const tTypes = useTranslations('documents.types');
  const tRacine = useTranslations();
  const f = useFormatteurs();
  const libelleGenere = useLibelleGenere();
  const vide = documents.total === 0;

  return (
    <Carte>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-corps leading-normal font-semibold">{t('titre')}</h2>
          <p className="text-ui text-muted-foreground">{t('aide')}</p>
        </div>
        {/* Préattaché au bien : le dialogue ne demande ni type ni identifiant de cible (AC3). */}
        <AddDocumentButton documentableType="property" documentableId={property.id} displayLabel={property.title} onUploaded={documents.relire} />
      </div>
      {documents.enEchec ? (
        <ErreurDeLecture className="m-4" erreur={documents.erreur} message={t('echec')} onRetry={documents.relire} retryLabel={tRacine('common.actions.retry')} />
      ) : documents.enChargement ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t('chargement')}</p>
      ) : vide ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t('vide')}</p>
      ) : (
        <ul className="divide-y divide-border" aria-label={t('titre')}>
          {documents.generes.map((doc) => (
            <li key={doc.download_path} data-testid="document-du-bien" className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <span className="flex size-9 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Sparkles className="size-icone" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 leading-snug">
                <span className="block truncate text-corps font-medium">{libelleGenere(doc)}</span>
                <span className="block truncate text-ui text-muted-foreground">
                  {doc.date ? t('genereLe', { date: f.date(doc.date) }) : t('genere')}
                </span>
              </span>
              <BoutonTelechargement chemin={doc.download_path} nomFichier={`${libelleGenere(doc)}.pdf`} size="sm">
                {t('telecharger')}
              </BoutonTelechargement>
            </li>
          ))}
          {documents.deposes.map((doc) => (
            <li key={doc.id} data-testid="document-du-bien" className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText className="size-icone" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 leading-snug">
                <span className="block truncate text-corps font-medium">{doc.name}</span>
                <span className="block truncate text-ui text-muted-foreground">
                  {[doc.type && tTypes.has(doc.type) ? tTypes(doc.type) : null, doc.created_at ? t('deposeLe', { date: f.date(doc.created_at) }) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {doc.file_url ? (
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
                >
                  {t('ouvrir')}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Carte>
  );
}
