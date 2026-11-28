'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { origineApi } from '@/lib/config-publique';
import { cheminApi } from '@/lib/chemin-api';
import type { ArchivePreparee } from '@/lib/documents/coffre';
import { useArchivesPreparees, useDemanderLArchive } from '@/lib/queries/coffre';
import { cn } from '@/lib/utils';

/** TCK-2916 — le dossier VIRTUEL de toutes les quittances de l'appelant, quelle que soit leur année (TCK-2915). */
export const DOSSIER_DES_QUITTANCES = 'receipts:all';

type Echec = 'vide' | 'interdit' | 'echec' | 'demande';
export type EtatDeLArchiveDesQuittances = 'pret' | 'telechargement' | 'preparation' | 'prete' | 'echec';

/**
 * TCK-2916 — « Tout télécharger » de l'historique du locataire : toutes ses quittances en une archive,
 * servie par l'API (`receipts:all`, TCK-2915), jamais construite dans le navigateur.
 *
 * Le parcours du coffre (TCK-2770, TCK-2812), sans en connaître le compte : la page ne sait pas combien de
 * quittances l'API réunira (l'historique est paginé et compte aussi ce qui n'en a pas). D'où :
 * 1. l'archive DIRECTE (`GET /api/me/document-vault/archive?folder=receipts:all`) ;
 * 2. au-delà de ce que l'API bâtit pendant la requête — 422 `document.archive_too_large`, en nombre comme en
 *    octets —, l'archive PRÉPARÉE : une préparation déjà prête se télécharge, une en cours se suit, sinon elle
 *    se demande (`POST /api/me/document-vault/archives`). L'avis « prête » ramène ici (cible
 *    `receipts_archive`) : le coffre ne liste pas ce dossier.
 *
 * L'état des préparations se lit à l'ouverture (une archive prête attend d'être remise), puis toutes les 5 s
 * tant que l'une se prépare.
 */
export function useArchiveDesQuittances() {
  const { token } = useAuth();
  const locale = useLocale();
  const preparees = useArchivesPreparees();
  const demande = useDemanderLArchive();
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<Echec | null>(null);

  const preparation: ArchivePreparee | null = preparees.data?.data.find((a) => a.folder === DOSSIER_DES_QUITTANCES) ?? null;
  const etat: EtatDeLArchiveDesQuittances = enCours
    ? 'telechargement'
    : preparation?.status === 'pending' || demande.isPending
      ? 'preparation'
      : preparation?.status === 'ready'
        ? 'prete'
        : preparation?.status === 'failed'
          ? 'echec'
          : 'pret';

  /** Le fichier de l'API, porteur du jeton ; rend la réponse refusée pour qu'on en lise le code. */
  const recevoir = async (chemin: string, nomDuFichier: string): Promise<Response | null> => {
    const reponse = await fetch(`${origineApi()}${chemin}`, {
      headers: { Accept: 'application/zip', 'Accept-Language': locale, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!reponse.ok) return reponse;
    const url = URL.createObjectURL(await reponse.blob());
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomDuFichier;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    URL.revokeObjectURL(url);
    return null;
  };

  const preparer = async () => {
    // Une préparation lancée ailleurs (ou avant) : la relire avant d'en demander une autre.
    const lue = (await preparees.refetch()).data?.data.find((a) => a.folder === DOSSIER_DES_QUITTANCES) ?? null;
    if (lue?.status === 'ready' && lue.download_path !== null) {
      return lue.download_path;
    }
    if (lue?.status !== 'pending') {
      demande.mutate({ folder: DOSSIER_DES_QUITTANCES }, { onError: () => setEchec('demande') });
    }
    return null;
  };

  const lancer = async (nomDuFichier: string) => {
    if (enCours || etat === 'preparation') return;
    setEchec(null);
    setEnCours(true);
    try {
      const chemin =
        preparation?.status === 'ready' && preparation.download_path !== null
          ? preparation.download_path
          : cheminApi`/api/me/document-vault/archive${new URLSearchParams({ folder: DOSSIER_DES_QUITTANCES })}`;
      const refus = await recevoir(chemin, nomDuFichier);
      if (refus === null) return;
      // Un `fetch` nu (le fichier se télécharge) : son refus se lit comme une `ApiError` (TCK-3008).
      const code = refus.status === 422 ? new ApiError(refus.status, await refus.json().catch(() => null)).codeMetier : undefined;
      if (code === 'document.archive_too_large') {
        const pret = await preparer();
        if (pret !== null) {
          const refusDuPret = await recevoir(pret, nomDuFichier);
          if (refusDuPret !== null) setEchec('echec');
        }
        return;
      }
      setEchec(code === 'document.archive_empty' ? 'vide' : refus.status === 401 || refus.status === 403 ? 'interdit' : 'echec');
    } catch {
      setEchec('echec');
    } finally {
      setEnCours(false);
    }
  };

  return { etat, echec, lancer };
}

/**
 * TCK-2916 (maquette `app-paiements`, approche A, e0 et e2 : l'action du titre « Historique ») — « Tout
 * télécharger » au téléphone, « Tout télécharger (.zip) » au bureau, et ce que devient une archive préparée.
 */
export function ToutTelechargerLesQuittances({ className }: { readonly className?: string }) {
  const t = useTranslations('payments.locataire.historique.archive');
  const { etat, echec, lancer } = useArchiveDesQuittances();
  const occupe = etat === 'telechargement' || etat === 'preparation';
  const libelle = (bureau: boolean) =>
    etat === 'telechargement'
      ? t('enCours')
      : etat === 'preparation'
        ? t('enPreparation')
        : etat === 'prete'
          ? t('telechargerLArchive')
          : etat === 'echec'
            ? t('reessayer')
            : bureau
              ? t('toutTelechargerZip')
              : t('toutTelecharger');
  const note = etat === 'preparation' || etat === 'prete' || etat === 'echec' ? t(`notes.${etat}`) : null;
  // Un refus du geste, ou une préparation échouée : la note se lit comme une alerte.
  const alerte = echec !== null || etat === 'echec';

  return (
    <>
      <button
        type="button"
        onClick={() => void lancer(t('nomDuFichier'))}
        disabled={occupe}
        aria-busy={occupe}
        aria-label={occupe ? undefined : t('aria')}
        data-testid="tout-telecharger-les-quittances"
        className={cn(
          '-my-2 inline-flex min-h-11 flex-none items-center rounded-md text-sm font-medium text-primary-deep outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-progress disabled:opacity-70',
          className,
        )}
      >
        <span className="lg:hidden">{libelle(false)}</span>
        <span className="hidden lg:inline">{libelle(true)}</span>
      </button>
      {note || echec ? (
        <p
          role={alerte ? 'alert' : 'status'}
          data-testid="note-de-l-archive-des-quittances"
          className={cn('order-last basis-full text-ui leading-snug', alerte ? 'text-destructive' : 'text-muted-foreground')}
        >
          {echec ? t(`errors.${echec}`) : note}
        </p>
      ) : null}
    </>
  );
}
