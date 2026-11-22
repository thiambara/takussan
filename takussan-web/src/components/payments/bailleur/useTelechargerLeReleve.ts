'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError, urlApiPublique } from '@/lib/api';

export type FormatDuReleve = 'pdf' | 'csv';

/**
 * TCK-2651 — le relevé du bailleur en PDF ou en CSV (`GET /api/owner-statements/{pdf,csv}?period=`),
 * le calcul même de l'écran (TCK-594). Le fichier part avec le jeton de session : l'URL seule rendrait
 * 401, d'où un `fetch` puis un lien de blob, comme `OwnerStatementPanel`. Aucun `landlord_id` : le
 * relevé est toujours celui du lecteur.
 */
export function useTelechargerLeReleve(messageParDefaut: string) {
  const locale = useLocale();
  const { token } = useAuth();
  const messageErreur = useMessageErreurApi();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const telecharger = async (period: string, format: FormatDuReleve) => {
    setEnCours(`${period}.${format}`);
    setErreur(null);
    try {
      const reponse = await fetch(urlApiPublique(`/owner-statements/${format}?period=${encodeURIComponent(period)}`), {
        headers: {
          Accept: format === 'pdf' ? 'application/pdf' : 'text/csv',
          'Accept-Language': locale,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!reponse.ok) {
        throw new ApiError(reponse.status, await reponse.json().catch(() => null));
      }
      const url = URL.createObjectURL(await reponse.blob());
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = `releve-${period}.${format}`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErreur(messageErreur(err, messageParDefaut));
    } finally {
      setEnCours(null);
    }
  };

  return { telecharger, enCours, erreur };
}
