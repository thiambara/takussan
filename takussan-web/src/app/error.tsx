'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Frontière d'erreur RACINE — et son absence rendait la frontière du tableau de bord inopérante
 * dans le cas même pour lequel elle avait été écrite.
 *
 * `error.tsx` d'un segment n'attrape PAS ce que lève le `layout.tsx` du MÊME segment. Or
 * `(dashboard)/layout.tsx` appelle `getMeAction()`, qui relance toute erreur autre qu'un 401.
 * Quand l'API entière est indisponible — le scénario titre —, le jet part donc du layout et
 * échappait à `(dashboard)/error.tsx` pour atterrir sur la page d'erreur par défaut de Next :
 * une trace anglaise non stylée, hors i18n, hors design.
 *
 * Cette frontière-ci est le parent : elle attrape ce que le layout du tableau de bord laisse
 * passer. (Le `layout.tsx` racine, lui, exigerait un `global-error.tsx` — il ne fait qu'installer
 * les providers et ne lève pas.)
 *
 * *Une frontière d'erreur ne couvre pas le code qui la monte ; il faut donc toujours en avoir
 * une de plus que le segment qu'on veut protéger.*
 */
export default function RootError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const t = useTranslations('errors.boundary');

  useEffect(() => {
    console.error('[root] erreur non rattrapée', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="size-10 text-app-accent" aria-hidden />
      <h1 className="text-xl font-semibold text-app-ink">{t('title')}</h1>
      <p className="max-w-md text-sm text-app-ink-muted">{t('body')}</p>
      {error.digest && (
        <p className="text-xs text-app-ink-muted">{t('reference', { digest: error.digest })}</p>
      )}
      <Button onClick={reset}>{t('retry')}</Button>
    </div>
  );
}
