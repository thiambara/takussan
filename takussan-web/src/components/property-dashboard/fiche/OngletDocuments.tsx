'use client';

import Link from 'next/link';
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

/** Les pièces du bien et de ses baux lues d'un coup : au-delà, le coffre (`/app/documents`) les pagine. */
const PIECES_LUES = 100;

/** Les statuts d'un bail CLOS : ses pièces se rangent sous « Bail précédent ». */
const BAUX_CLOS = new Set(['expired', 'terminated', 'renewed']);

/**
 * TCK-2639, puis TCK-2841 (ADR-0099, amendement du 2026-11-14) — les documents du bien ET de tous ses
 * baux, comme l'onglet les montre et comme son compteur les compte (AC4) :
 *  · les pièces déposées sur le bien et sur ses baux hors brouillon, passés compris, en UNE lecture
 *    (`GET /api/documents?filter[property_with_leases]={id}`) — chaque pièce jugée par la lecture de sa
 *    cible, et nommée avec son bail (`lease`) ;
 *  · les documents que la plateforme génère pour le bien et tous ses baux (contrats, états des lieux),
 *    listés depuis leur source (`GET /api/documents/generated?target=property:{id}`, § 3).
 */
export function useDocumentsDuBien(property: PropertyDetail) {
  const deposesLus = useDocuments({ property_with_leases: property.id, per_page: PIECES_LUES });
  const generes = useDocumentsGeneres({ type: 'property', id: property.id });
  const deposes: readonly Document[] = deposesLus.data?.data ?? [];
  const generesLus: readonly DocumentGenere[] = generes.data?.data ?? [];
  const lu = deposesLus.isSuccess && generes.isSuccess;
  return {
    deposes,
    generes: generesLus,
    /** Le compte de ce que l'onglet rend ; `null` tant que tout n'est pas lu. */
    total: lu ? deposes.length + generesLus.length : null,
    enChargement: deposesLus.isPending || generes.isPending,
    enEchec: deposesLus.isError || generes.isError,
    /** TCK-2814 — l'erreur brute à montrer : elle décide de la reprise (`erreurAMontrer`). */
    erreur: erreurAMontrer(deposesLus.error, generes.error),
    relire: () => {
      void deposesLus.refetch();
      void generes.refetch();
    },
  };
}

type BailDUnePiece = NonNullable<Document['lease']>;

interface GroupeDePieces {
  readonly cle: string;
  /** `null` : les pièces du bien lui-même. */
  readonly bail: BailDUnePiece | null;
  readonly pieces: readonly Document[];
}

/**
 * TCK-2841 — les pièces rangées par bail : celles du bien d'abord, puis le bail en cours, puis les autres
 * du plus récent au plus ancien (identifiant décroissant). L'ordre de lecture (`-created_at`) tient dans
 * chaque groupe.
 */
export function rangerParBail(deposes: readonly Document[], bailEnCoursId: number | null): readonly GroupeDePieces[] {
  const duBien: Document[] = [];
  const parBail = new Map<number, { bail: BailDUnePiece; pieces: Document[] }>();
  for (const doc of deposes) {
    if (!doc.lease) {
      duBien.push(doc);
      continue;
    }
    const groupe = parBail.get(doc.lease.id) ?? { bail: doc.lease, pieces: [] };
    groupe.pieces.push(doc);
    parBail.set(doc.lease.id, groupe);
  }
  const rang = (bail: BailDUnePiece) => (bail.id === bailEnCoursId || bail.status === 'active' ? 0 : 1);
  const baux = [...parBail.values()].sort((a, b) => rang(a.bail) - rang(b.bail) || b.bail.id - a.bail.id);
  return [
    ...(duBien.length > 0 ? [{ cle: 'bien', bail: null, pieces: duBien }] : []),
    ...baux.map(({ bail, pieces }) => ({ cle: `bail-${bail.id}`, bail, pieces })),
  ];
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
  const tGroupes = useTranslations('propertyDashboard.fiche.documents.parBail');
  const groupes = rangerParBail(documents.deposes, property.occupancy?.lease?.id ?? null);
  const titreDuGroupe = (groupe: GroupeDePieces) => {
    if (!groupe.bail) return tGroupes('duBien');
    const reference = groupe.bail.reference_number ?? tGroupes('sansReference', { id: groupe.bail.id });
    if (groupe.bail.id === property.occupancy?.lease?.id || groupe.bail.status === 'active') return tGroupes('enCours', { reference });
    return BAUX_CLOS.has(groupe.bail.status ?? '') ? tGroupes('precedent', { reference }) : tGroupes('autre', { reference });
  };

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
          {groupes.map((groupe) => (
            <li key={groupe.cle} data-slot="groupe-de-pieces">
              <div className="flex min-h-10 items-center justify-between gap-3 bg-muted/40 px-4 py-2">
                <h3 className="truncate text-ui font-semibold text-muted-foreground">{titreDuGroupe(groupe)}</h3>
                {groupe.bail ? (
                  <Link
                    href={`/app/leases/${groupe.bail.id}?onglet=documents`}
                    className="flex-none rounded-md text-ui font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    {tGroupes('voirLeBail')}
                  </Link>
                ) : null}
              </div>
              <ul className="divide-y divide-border border-t border-border">
                {groupe.pieces.map((doc) => (
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
            </li>
          ))}
        </ul>
      )}
    </Carte>
  );
}
