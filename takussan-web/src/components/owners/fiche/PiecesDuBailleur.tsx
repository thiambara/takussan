'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight, Eye, EyeOff, FileText, IdCard, Landmark, Loader2, Lock, ReceiptText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { DOCUMENT_LIST_FIELDS } from '@/lib/queries/documents';
import { fetchOwnerSensitive, type OwnerMandateDocument, type OwnerProfileDetail, type OwnerSensitiveData } from '@/lib/queries/owners';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import type { Document } from '@/types/document';

/**
 * TCK-2641 — « Documents » de la fiche : les pièces du bailleur (mandat, pièce, RIB…), lues au
 * coffre par cible (`GET /api/documents?filter[documentable_type]=owner_profile&…`, TCK-2655,
 * ADR-0099), puis ses identifiants sensibles (RIB, NINEA, numéro de pièce).
 *
 * TCK-601 (ADR-0044) — les identifiants sont rendus MASQUÉS par l'API ; « Afficher » les lit en clair
 * (`GET /api/owners/{id}/sensitive`, preuve récente de second facteur, JOURNALISÉ) et « Masquer » les
 * efface. Le geste est sur chaque ligne (maquette) ; une lecture rend les trois valeurs, qui
 * s'affichent ensemble. La valeur ne vit que dans l'état de ce composant : ni cache React Query, ni stockage.
 *
 * TCK-2910 — en tête, « Mandat de gestion signé » : la pièce `management_mandate` que la fiche sert
 * (`mandate_document`, TCK-2909), sa date, son format et sa taille (l'API ne compte pas les pages) ; la
 * ligne mène à la fiche du document, qui juge la lecture. Elle n'est pas répétée dans la liste du coffre.
 */
/** La clé de requête de la liste : la fiche l'invalide après un dépôt. */
export const clePiecesDuBailleur = (ownerId: number) => ['owners', ownerId, 'documents'] as const;

const ICONE: Partial<Record<string, typeof FileText>> = {
  id_card: IdCard,
  passport: IdCard,
  rib: Landmark,
  ninea: ReceiptText,
};

interface Props {
  readonly owner: OwnerProfileDetail;
  /** L'admin de l'agence (`OwnerProfilePolicy::viewSensitive`) ; l'API tranche de toute façon. */
  readonly peutAfficher: boolean;
  readonly compact?: boolean;
}

export function PiecesDuBailleur({ owner, peutAfficher, compact = false }: Props) {
  const t = useTranslations('owners.fiche.pieces');
  const tTypes = useTranslations('documents.types');
  const f = useFormatteurs();
  const { token } = useAuth();
  const garde = useGardeDoubleFacteur();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const [clair, setClair] = useState<OwnerSensitiveData | null>(null);
  const [lecture, setLecture] = useState(false);

  const documents = useApiQuery<PaginatedResponse<Document>>([...clePiecesDuBailleur(owner.id)], '/api/documents', {
    params: {
      fields: { documents: DOCUMENT_LIST_FIELDS },
      filter: { documentable_type: 'owner_profile', documentable_id: owner.id },
      sort: '-created_at',
      per_page: 20,
    },
  });

  async function afficher() {
    if (!token) return;
    setLecture(true);
    try {
      const res = await avecGardeDoubleFacteur(() => fetchOwnerSensitive(token, owner.id), garde);
      setClair(res.data);
    } catch (error) {
      toast.add({ title: t('erreurAffichage'), description: messageErreur(error), type: 'error' });
    } finally {
      setLecture(false);
    }
  }

  const identifiants = [
    { cle: 'id_document_number', icone: IdCard, titre: t('piece'), masque: owner.id_document_number_masked, valeur: clair?.id_document_number },
    { cle: 'rib', icone: Landmark, titre: t('rib'), masque: owner.rib_masked, valeur: clair?.rib },
    { cle: 'tax_id', icone: ReceiptText, titre: t('ninea'), masque: owner.tax_id_masked, valeur: clair?.tax_id },
  ].filter((l) => l.masque);

  const ligne = cn('flex min-h-14 items-center gap-3 py-2', compact ? 'px-0' : 'px-4');
  const geste = 'inline-flex h-11 flex-none items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50';
  const mandat = owner.mandate_document ?? null;
  const lignes = (documents.data?.data ?? []).filter((doc) => doc.id !== mandat?.id);

  return (
    <div data-slot="pieces-du-bailleur">
      <ul className="divide-y divide-border">
        {mandat ? <LigneDuMandat mandat={mandat} className={ligne} /> : null}
        {lignes.map((doc) => {
          const Icone = (doc.type ? ICONE[doc.type] : undefined) ?? FileText;
          return (
            <li key={doc.id} className={ligne}>
              <Icone className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1 leading-snug">
                {doc.file_url ? (
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium text-foreground underline-offset-4 hover:underline">
                    {doc.name}
                  </a>
                ) : (
                  <span className="block truncate font-medium">{doc.name}</span>
                )}
                <span className="block truncate text-ui text-muted-foreground">
                  {[doc.type && tTypes.has(doc.type) ? tTypes(doc.type) : null, doc.created_at ? f.date(doc.created_at) : null].filter(Boolean).join(' · ')}
                </span>
              </span>
            </li>
          );
        })}
        {identifiants.map((l) => (
          <li key={l.cle} className={ligne} data-slot={`identifiant-${l.cle}`}>
            <l.icone className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block truncate font-medium">{l.titre}</span>
              <span className="block truncate font-mono text-ui text-muted-foreground tabular-nums">{clair ? (l.valeur ?? '—') : l.masque}</span>
            </span>
            {peutAfficher ? (
              clair ? (
                <button type="button" onClick={() => setClair(null)} aria-label={t('masquerAria', { quoi: l.titre })} className={geste}>
                  <EyeOff className="size-4 lg:hidden" aria-hidden="true" />
                  {t('masquer')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={lecture}
                  onClick={() => void afficher()}
                  aria-label={t('afficherAria', { quoi: l.titre })}
                  aria-describedby="mention-du-journal"
                  className={geste}
                >
                  {lecture ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Eye className="size-4 lg:hidden" aria-hidden="true" />}
                  {t('afficher')}
                </button>
              )
            ) : null}
          </li>
        ))}
        {!mandat && lignes.length === 0 && identifiants.length === 0 && !documents.isLoading ? (
          <li className={cn(ligne, 'text-sm text-muted-foreground')}>{t('aucune')}</li>
        ) : null}
      </ul>
      <p id="mention-du-journal" className={cn('flex gap-2 text-ui leading-snug text-muted-foreground', compact ? 'pt-3' : 'border-t border-border px-4 py-3')}>
        <Lock className="mt-0.5 size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
        {t('mention')}
      </p>
    </div>
  );
}

/** TCK-2910 — « PDF », « JPEG »… : le sous-type du fichier qui fait foi. */
function formatDu(mime: string | null): string | null {
  const sous = mime?.split('/')[1]?.split('+')[0];
  return sous ? sous.toUpperCase() : null;
}

/** TCK-2910 — « Mandat de gestion signé — 12 mars 2025 · PDF, 245 Ko », vers la fiche du document. */
function LigneDuMandat({ mandat, className }: { readonly mandat: OwnerMandateDocument; readonly className: string }) {
  const t = useTranslations('owners.fiche.pieces');
  const tTaille = useTranslations('documents.coffre.ajout');
  const f = useFormatteurs();
  const octets = mandat.file_size;
  const taille =
    octets === null
      ? null
      : octets >= 1024 * 1024
        ? tTaille('tailleMo', { n: f.nombre(octets / (1024 * 1024), { maximumFractionDigits: 1, minimumFractionDigits: 1 }) })
        : tTaille('tailleKo', { n: f.nombre(Math.max(1, Math.round(octets / 1024))) });
  const fichier = [formatDu(mandat.mime_type), taille].filter(Boolean).join(', ');
  const detail = [mandat.created_at ? f.date(mandat.created_at, { day: 'numeric', month: 'long', year: 'numeric' }) : null, fichier || null].filter(Boolean).join(' · ');
  return (
    <li className={cn(className, 'relative')} data-slot="mandat-signe">
      <FileText className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1 leading-snug">
        <Link href={`/app/documents/${mandat.id}`} className="block truncate font-medium text-foreground outline-none after:absolute after:inset-0 focus-visible:underline">
          {t('mandat')}
        </Link>
        {detail ? <span className="block truncate text-ui text-muted-foreground">{detail}</span> : null}
      </span>
      <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
    </li>
  );
}
