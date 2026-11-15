'use client';

import { useTranslations } from 'next-intl';
import { FileText, History, Sparkles } from 'lucide-react';

import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { ErreurDeLecture } from '@/components/feedback';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { erreurAMontrer } from '@/lib/nature-de-l-erreur';
import { useDocuments, useDocumentsGeneres, type DocumentGenere } from '@/lib/queries/documents';
import type { LeaseWithRelations } from '@/lib/queries/leases';

import { Carte } from './PiecesDuBail';

/**
 * TCK-2645 — les onglets « Documents » et « Historique » de la fiche d'un bail (maquette `app-baux`
 * a, bureau ; au téléphone, par la ligne « Documents » du dossier).
 *
 * Locaux à la frontière i18n des baux : l'onglet du bien (`property-dashboard`) lit `property.*`, et
 * la piste d'audit de l'administration lit `admin.*`, que cette frontière ne sert pas.
 */

/** Les pièces d'un bail lues d'un coup : au-delà, le coffre (`/app/documents`) les pagine. */
const PIECES_LUES = 100;

const CATEGORIES_CONNUES = new Set(['lease_contract', 'inventory_move_in', 'inventory_move_out', 'receipt_rent']);

export function useDocumentsDuBail(leaseId: number) {
  const deposes = useDocuments({ documentable_type: 'lease', documentable_id: leaseId, per_page: PIECES_LUES });
  const generes = useDocumentsGeneres({ type: 'lease', id: leaseId });
  return {
    deposes: deposes.data?.data ?? [],
    generes: generes.data?.data ?? [],
    enChargement: deposes.isPending || generes.isPending,
    enEchec: deposes.isError || generes.isError,
    /** TCK-2814 — l'erreur brute à montrer : elle décide de la reprise (`erreurAMontrer`). */
    erreur: erreurAMontrer(deposes.error, generes.error),
    relire: () => {
      void deposes.refetch();
      void generes.refetch();
    },
  };
}

export function OngletDocumentsDuBail({ lease, nom }: { readonly lease: LeaseWithRelations; readonly nom: string }) {
  const t = useTranslations('lease.fiche.documents');
  const tTypes = useTranslations('documents.types');
  const tRacine = useTranslations();
  const f = useFormatteurs();
  const documents = useDocumentsDuBail(lease.id);
  const libelle = (doc: DocumentGenere) => t(`generes.${CATEGORIES_CONNUES.has(doc.category) ? doc.category : 'autre'}`);
  const vide = !documents.enChargement && documents.deposes.length + documents.generes.length === 0;

  return (
    <Carte
      titre={tRacine('lease.fiche.onglets.documents')}
      action={
        lease.abilities?.add_document ? (
          <AddDocumentButton documentableType="lease" documentableId={lease.id} displayLabel={nom} size="sm" variant="ghost" onUploaded={documents.relire} />
        ) : undefined
      }
      data-testid="onglet-documents"
    >
      {documents.enEchec ? (
        <ErreurDeLecture className="m-4" erreur={documents.erreur} message={t('erreur')} onRetry={documents.relire} retryLabel={tRacine('common.actions.retry')} />
      ) : documents.enChargement ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t('chargement')}</p>
      ) : vide ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t('vide')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {documents.generes.map((doc) => (
            <li key={doc.download_path} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <span className="flex size-9 flex-none items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Sparkles className="size-icone" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 leading-snug">
                <span className="block truncate text-corps font-medium">{libelle(doc)}</span>
                {doc.date ? <span className="block truncate text-ui text-muted-foreground">{t('genereLe', { date: f.jourMois(doc.date) })}</span> : null}
              </span>
              <BoutonTelechargement chemin={doc.download_path} nomFichier={`${libelle(doc)}.pdf`} size="sm">
                {t('telecharger')}
              </BoutonTelechargement>
            </li>
          ))}
          {documents.deposes.map((doc) => (
            <li key={doc.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileText className="size-icone" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 leading-snug">
                <span className="block truncate text-corps font-medium">{doc.name}</span>
                <span className="block truncate text-ui text-muted-foreground">
                  {[doc.type && tTypes.has(doc.type) ? tTypes(doc.type) : null, doc.created_at ? t('deposeLe', { date: f.jourMois(doc.created_at) }) : null]
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

interface EvenementDuBail {
  readonly id: number;
  readonly event: string | null;
  readonly properties: Record<string, unknown> | null;
  readonly created_at: string | null;
  /** TCK-2763 — l'auteur de l'événement ; `null` pour un acte système ou un auteur supprimé. */
  readonly causer?: { readonly id: number; readonly name: string | null } | null;
}

/** Les événements que l'API journalise sur un bail (modèle et services `Lease*`), relevés le 2026-11-12. */
const EVENEMENTS_CONNUS = new Set([
  'created',
  'updated',
  'deleted',
  'lease_rent_reviewed',
  'lease_expired',
  'tenant_welcomed',
  'deposit_refunded',
  'deposit_refund_reversed',
  'lease_termination_schedule_cancelled',
  'lease_early_termination_requested',
  'lease_early_termination_confirmed',
  'lease_early_termination_cancelled',
]);

/**
 * L'historique du bail : `GET /api/audit-log/lease/{id}`, sous `ActivityLogPolicy::viewAny` (la même
 * règle qui ouvre la piste d'audit de l'agence) et borné à l'agence du lecteur. La fiche ne monte
 * l'onglet qu'à qui le serveur l'ouvre (décision 11). Le libellé est celui du FRONT, par le code de
 * l'événement — jamais la `description` du journal.
 */
export function OngletHistoriqueDuBail({ lease }: { readonly lease: LeaseWithRelations }) {
  const t = useTranslations('lease.fiche.historique');
  const tRacine = useTranslations();
  const f = useFormatteurs();
  const requete = useApiQuery<{ data: EvenementDuBail[] }>(['leases', 'historique', lease.id], `/api/audit-log/lease/${lease.id}`, {
    params: { per_page: 50 },
  });
  const evenements = requete.data?.data ?? [];

  return (
    <Carte titre={tRacine('lease.fiche.onglets.historique')} data-testid="onglet-historique">
      {requete.isError ? (
        <ErreurDeLecture
          className="m-4"
          erreur={requete.error}
          message={t('erreur')}
          onRetry={() => void requete.refetch()}
          retryLabel={tRacine('common.actions.retry')}
        />
      ) : requete.isPending ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t('chargement')}</p>
      ) : evenements.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t('vide')}</p>
      ) : (
        <ol className="divide-y divide-border">
          {evenements.map((e) => {
            const code = e.event && EVENEMENTS_CONNUS.has(e.event) ? e.event : 'autre';
            const ancien = e.properties?.old_rent;
            const nouveau = e.properties?.new_rent;
            const revision =
              code === 'lease_rent_reviewed' && typeof ancien === 'number' && typeof nouveau === 'number'
                ? t('revise', { ancien: f.montantCourt(ancien, lease.currency), nouveau: f.montantCourt(nouveau, lease.currency) })
                : null;
            // TCK-2763 — qui : le nom de l'auteur, « Automatique » pour un acte sans auteur (`causer: null`).
            // Un auteur sans nom (compte sans prénom ni nom) ne se dit pas : ce n'est pas un acte système.
            const auteur = e.causer === null ? t('automatique') : (e.causer?.name ?? null);
            return (
              <li key={e.id} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                <History className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block truncate text-sm">
                    <span className="font-medium">{t(`events.${code}`)}</span>
                    {auteur ? <span className="text-muted-foreground"> · {auteur}</span> : null}
                  </span>
                  {revision ? <span className="block truncate text-ui text-muted-foreground tabular-nums">{revision}</span> : null}
                </span>
                {e.created_at ? <span className="flex-none text-ui text-muted-foreground tabular-nums">{f.jourMois(e.created_at)}</span> : null}
              </li>
            );
          })}
        </ol>
      )}
    </Carte>
  );
}
