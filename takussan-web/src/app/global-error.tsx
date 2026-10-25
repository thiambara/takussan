'use client';

import { EcranErreurGlobale } from '@/components/shared/EcranErreurGlobale';
import { DEFAULT_LOCALE } from '@/i18n/config';
import './globals.css';

/**
 * TCK-2356 (P14.07) — la frontière du layout RACINE, que `src/app/error.tsx` ne couvre pas : une
 * frontière n'attrape jamais ce que lève le layout de son propre segment. Sans ce fichier, une
 * erreur du layout racine rendait la page par défaut de Next, hors i18n et hors design, et ne
 * laissait aucune trace.
 *
 * Elle REMPLACE le layout racine : elle porte donc `<html>`, `<body>` et la feuille de styles.
 * La langue réelle est posée par l'écran une fois lue dans l'URL ; le texte, le dictionnaire et le
 * journal sont expliqués dans `EcranErreurGlobale`. La ligne serveur de la même erreur est celle
 * d'`onRequestError` (`src/instrumentation.ts`).
 */
export default function GlobalError({
  error,
  retry,
}: {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="font-sans antialiased">
        <EcranErreurGlobale error={error} retry={retry} />
      </body>
    </html>
  );
}
