'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { origineApi } from '@/lib/config-publique';

/**
 * Le PDF du devis est servi derrière le jeton : on le récupère en blob (patron d'`InventoryPdfButton`),
 * plutôt que d'ouvrir un onglet qui recevrait un 401. À monter seulement sous `abilities.can_view_quote_pdf`.
 *
 * TCK-2654 (L3b) — sorti de `QuoteActions.tsx` pour que la décision du devis (`DecisionDuDevis`, liste du
 * bailleur et accueil) le monte sans tirer le motif de refus et son schéma zod dans un écran de lecture
 * (`zod-hors-des-ecrans-de-lecture.test.ts`). `forme="lien"` : le lien sous le rappel du plafond, icône de
 * téléchargement en tête (maquette a-6) ; `bouton` : le geste discret de la fiche.
 */
export function QuotePdfButton({ id, forme = 'bouton' }: { readonly id: number; readonly forme?: 'bouton' | 'lien' }) {
  const t = useTranslations('maintenance.intervention.quote');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const url = `${origineApi()}/api/maintenance-requests/${id}/quote/pdf`;

  const download = async () => {
    setDownloading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/pdf',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(t('pdf_failed'));
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `devis-intervention-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setErrorMessage(messageErreur(err, t('pdf_failed')));
    } finally {
      setDownloading(false);
    }
  };

  const libelle = downloading ? t('pdf_downloading') : t('pdf');

  if (forme === 'lien') {
    return (
      <div data-slot="pdf-du-devis">
        <Button
          type="button"
          variant="link"
          size="lg"
          className="px-0 font-semibold text-primary-deep has-data-[icon=inline-start]:pl-0"
          disabled={downloading}
          onClick={() => void download()}
        >
          <Download data-icon="inline-start" aria-hidden="true" />
          {libelle}
        </Button>
        {errorMessage ? (
          <p role="alert" className="text-xs text-destructive">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="ghost" className="h-11 sm:h-9" disabled={downloading} onClick={() => void download()}>
        {libelle}
      </Button>
      {errorMessage ? <span className="self-center text-xs text-destructive">{errorMessage}</span> : null}
    </>
  );
}
