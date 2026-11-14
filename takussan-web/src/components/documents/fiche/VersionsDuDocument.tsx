'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileText, UploadCloud, X } from 'lucide-react';

import { ErreurDeLecture } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  DOCUMENT_MAX_SIZE_BYTES,
  DOCUMENT_MIME_ACCEPT,
  useDocumentVersions,
  useRestoreDocumentVersion,
  useUploadDocumentVersion,
} from '@/lib/queries/documents';
import type { DocumentVersion } from '@/types/document';

import { useNomDAuteur } from './auteur';
import { Carte, TitreDeBloc } from './blocs';

/**
 * TCK-2656 (lot 3) — « Versions (n) » de la fiche : chaque version (« Actuelle »), son commentaire,
 * son auteur et sa date ; « Restaurer » et « Ajouter une version » au seul verdict de l'API.
 *
 * Maquette : `BlocVersions` (`app-documents-a.tsx`). Remplace l'accordéon `DocumentVersionsList`
 * (TCK-097), dont rien ne se perd : liste, téléchargement de chaque version, restauration confirmée,
 * nouvelle version avec commentaire — et désormais son échéance (`expiry_date`), que l'API vide quand
 * la requête n'en porte pas (TCK-2300).
 *
 * L'auteur : « Vous » quand c'est l'appelant ; sinon le nom ou le rôle que l'API sert au lecteur
 * (`uploaded_by_person`, TCK-2773 — « Ousmane Niang · 28 juin », « L’agence · 28 juin ») ; la date seule
 * quand l'API ne le nomme pas.
 */
export function VersionsDuDocument({
  documentId,
  peutAjouter,
  peutRestaurer,
  echeanceActuelle = null,
  className,
}: {
  readonly documentId: number;
  /** L'échéance du document (`expiry_date`) : elle préremplit « Expire le » de la nouvelle version. */
  readonly echeanceActuelle?: string | null;
  /** `seVersionne(document)` : `abilities.update`, hors pièce de profil. */
  readonly peutAjouter: boolean;
  /** `abilities.update`. */
  readonly peutRestaurer: boolean;
  readonly className?: string;
}) {
  const t = useTranslations('documents.fiche.versions');
  const tCommon = useTranslations('common');
  const f = useFormatteurs();
  const { user } = useAuth();
  const nomDe = useNomDAuteur();
  const requete = useDocumentVersions(documentId);
  const [ajout, setAjout] = useState(false);
  const [aRestaurer, setARestaurer] = useState<DocumentVersion | null>(null);
  const versions = requete.data?.data ?? [];

  const auteur = (v: DocumentVersion) => {
    const date = v.created_at ? f.date(v.created_at) : null;
    if (user && v.uploaded_by_id === user.id) return date ? t('parVous', { date }) : t('vous');
    // TCK-2773 — le nom, ou le rôle en tête de ligne.
    const qui = nomDe(v.uploaded_by_person, true);
    if (qui) return date ? t('parQui', { qui, date }) : qui;
    return date;
  };

  return (
    <section className={className} aria-labelledby="versions-du-document">
      <TitreDeBloc
        id="versions-du-document"
        action={
          peutAjouter ? (
            <button type="button" onClick={() => setAjout(true)} className="-my-3 inline-flex min-h-11 items-center text-sm font-medium text-primary-deep">
              {t('ajouter')}
            </button>
          ) : null
        }
      >
        {requete.isSuccess ? t('titre', { n: versions.length }) : t('titreSeul')}
      </TitreDeBloc>
      <Carte className="mt-2">
        {requete.isLoading ? (
          <div className="space-y-2 p-4" aria-busy="true">
            <span className="sr-only">{tCommon('status.loading')}</span>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : requete.isError ? (
          <div className="p-4">
            <ErreurDeLecture erreur={requete.error} message={t('erreur')} onRetry={() => void requete.refetch()} retryLabel={tCommon('actions.retry')} />
          </div>
        ) : versions.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground text-pretty">{t('vide')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {versions.map((v) => {
              const parQui = auteur(v);
              return (
                <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex flex-wrap items-center gap-2 text-corps font-medium">
                      {t('nom', { n: v.version_number })}
                      {v.is_active ? (
                        <span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 text-pastille font-medium text-primary-deep">{t('actuelle')}</span>
                      ) : null}
                    </span>
                    {v.comment ? <span className="mt-0.5 block text-ui break-words text-muted-foreground">{t('commentaire', { texte: v.comment })}</span> : null}
                    {parQui ? <span className="block text-ui text-muted-foreground">{parQui}</span> : null}
                  </span>
                  {v.url ? (
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('telecharger', { n: v.version_number })}
                      className="inline-flex size-11 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Download className="size-icone" aria-hidden="true" />
                    </a>
                  ) : null}
                  {peutRestaurer && !v.is_active ? (
                    <button
                      type="button"
                      onClick={() => setARestaurer(v)}
                      aria-label={t('restaurerAria', { n: v.version_number })}
                      className="inline-flex min-h-11 flex-none items-center text-sm font-medium text-primary-deep"
                    >
                      {t('restaurer')}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Carte>

      {peutAjouter ? <AjouterUneVersion open={ajout} documentId={documentId} echeanceActuelle={echeanceActuelle} onOpenChange={setAjout} /> : null}
      <RestaurerUneVersion
        version={aRestaurer}
        documentId={documentId}
        onOpenChange={(ouvert) => {
          if (!ouvert) setARestaurer(null);
        }}
      />
    </section>
  );
}

function tailleLisible(octets: number, f: ReturnType<typeof useFormatteurs>, t: ReturnType<typeof useTranslations>) {
  const mo = octets / (1024 * 1024);
  return mo >= 1
    ? t('tailleMo', { n: f.nombre(mo, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) })
    : t('tailleKo', { n: f.nombre(Math.max(1, Math.round(octets / 1024))) });
}

/**
 * La nouvelle version : le fichier (10 Mo au plus), un commentaire, et l'échéance du NOUVEAU fichier,
 * préremplie de l'actuelle (validé par le chef d'équipe, 2026-11-13) : l'API pose celle qu'on envoie
 * et vide l'ancienne sans elle — une pièce renouvelée perdait son échéance en silence.
 */
function AjouterUneVersion({
  open,
  documentId,
  echeanceActuelle,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly documentId: number;
  readonly echeanceActuelle: string | null;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('documents.fiche.versions');
  const tFiche = useTranslations('documents.fiche');
  const tV = useTranslations('documents.versions');
  const tCommon = useTranslations('common');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const envoi = useUploadDocumentVersion();
  const entree = useRef<HTMLInputElement | null>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const echeanceInitiale = echeanceActuelle?.slice(0, 10) ?? '';
  const [expiration, setExpiration] = useState(echeanceInitiale);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);

  function choisir(liste: FileList | null) {
    const choisi = liste?.[0];
    if (!choisi) return;
    if (choisi.size > DOCUMENT_MAX_SIZE_BYTES) {
      setErreurFichier(tV('too_large'));
      return;
    }
    setErreurFichier(null);
    setFichier(choisi);
  }

  function fermer(suivant: boolean) {
    if (!suivant) {
      setFichier(null);
      setCommentaire('');
      setExpiration(echeanceInitiale);
      setErreurFichier(null);
      envoi.reset();
    }
    onOpenChange(suivant);
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!fichier) {
      setErreurFichier(tV('select_file_error'));
      return;
    }
    await envoi.mutateAsync({
      document_id: documentId,
      file: fichier,
      comment: commentaire || undefined,
      expiry_date: expiration || undefined,
    });
    fermer(false);
  }

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tV('add_title')}</DialogTitle>
          <DialogDescription>{tV('add_description')}</DialogDescription>
        </DialogHeader>
        {/* P210.04 — le refus de l'API se lit sur la mutation : le rejet est rattrapé, la boîte reste ouverte. */}
        <form onSubmit={(e) => void envoyer(e).catch(() => undefined)} className="space-y-4">
          {envoi.error ? (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-ui text-destructive">
              {messageErreur(envoi.error, tV('generic_error'))}
            </p>
          ) : null}
          <label
            htmlFor="version-upload-input"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              choisir(e.dataTransfer.files);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary"
          >
            {fichier ? (
              <>
                <FileText className="size-6 text-primary" aria-hidden="true" />
                <span className="flex max-w-full items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{fichier.name}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      setFichier(null);
                      if (entree.current) entree.current.value = '';
                    }}
                    aria-label={tV('remove_file_aria')}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </span>
                <span className="text-ui">{tailleLisible(fichier.size, f, tFiche)}</span>
              </>
            ) : (
              <>
                <UploadCloud className="size-6 text-primary" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">{tV('dropzone_title')}</span>
                <span className="text-ui">{tV('dropzone_hint')}</span>
              </>
            )}
            <input
              id="version-upload-input"
              ref={entree}
              type="file"
              accept={DOCUMENT_MIME_ACCEPT}
              className="sr-only"
              onChange={(e) => choisir(e.target.files)}
            />
          </label>
          {erreurFichier ? (
            <p role="alert" className="text-ui text-destructive">
              {erreurFichier}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="version-comment">
              {tV('comment_label')} <span className="font-normal text-muted-foreground">{tV('comment_optional')}</span>
            </Label>
            <Textarea
              id="version-comment"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={tV('comment_placeholder')}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="version-expiry">
              {t('expire')} <span className="font-normal text-muted-foreground">{tV('comment_optional')}</span>
            </Label>
            <DatePicker id="version-expiry" value={expiration} onValueChange={setExpiration} />
            <p id="version-expiry-aide" className="text-ui text-muted-foreground text-pretty">
              {t('expireAide')}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => fermer(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={envoi.isPending || !fichier}>
              {envoi.isPending ? tV('submitting') : tV('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RestaurerUneVersion({
  version,
  documentId,
  onOpenChange,
}: {
  readonly version: DocumentVersion | null;
  readonly documentId: number;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('documents.versions');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const restauration = useRestoreDocumentVersion();

  async function confirmer() {
    if (!version) return;
    await restauration.mutateAsync({ document_id: documentId, version_id: version.id });
    onOpenChange(false);
  }

  return (
    <Dialog open={version !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('restore_title', { version: version?.version_number ?? '' })}</DialogTitle>
          <DialogDescription>
            {t.rich('restore_body', {
              name: version?.file_name ?? '',
              nom: (morceaux) => <span className="font-medium text-foreground">{morceaux}</span>,
            })}
          </DialogDescription>
        </DialogHeader>
        {restauration.error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-ui text-destructive">
            {messageErreur(restauration.error, t('restore_error'))}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {tCommon('actions.cancel')}
          </Button>
          <Button type="button" onClick={() => void confirmer().catch(() => undefined)} disabled={restauration.isPending}>
            {restauration.isPending ? t('restoring') : tCommon('actions.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
