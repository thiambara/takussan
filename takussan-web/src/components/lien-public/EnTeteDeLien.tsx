import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';

/** Les initiales d'un nom d'émetteur (« Thiès Properties » → « TP »), deux lettres au plus. */
export function initialesDe(nom: string): string {
  return nom
    .split(/[\s\-–—'’]+/)
    .filter((mot) => /\p{L}/u.test(mot.charAt(0)))
    .slice(0, 2)
    .map((mot) => mot.charAt(0).toLocaleUpperCase())
    .join('');
}

/**
 * TCK-2505 — l'en-tête de la coque de lien : l'ÉMETTEUR quand on le connaît (l'agence d'un lien de
 * paiement), sinon la marque ; à droite, une mention courte (« Paiement sécurisé », « Lien
 * personnel », « Document privé »). Collé en haut au téléphone, en tête de carte en bureau — ou
 * bandeau pleine largeur dans une coque `large`.
 */
export function EnTeteDeLien({
  emetteur,
  mention,
  large = false,
  className,
}: {
  readonly emetteur?: string | null;
  readonly mention?: ReactNode;
  /** Dans une `CoqueDeLien` `large` : le bandeau de bureau, contenu centré sur 1120 px. */
  readonly large?: boolean;
  readonly className?: string;
}) {
  const tCommon = useTranslations('common');
  const nom = emetteur?.trim() ? emetteur.trim() : null;
  return (
    <header
      className={cn(
        'sticky top-0 z-10 flex h-14 flex-none border-b border-border bg-card px-4',
        large ? 'lg:h-16 lg:px-8' : 'lg:static lg:rounded-t-2xl',
        // En bureau, la carte étroite est déjà sous le bandeau de marque de la coque : sans émetteur
        // ni mention, cet en-tête n'y répéterait que le logo.
        !large && !nom && !mention && 'lg:hidden',
        className,
      )}
    >
      <div className={cn('flex w-full items-center gap-2.5', large && 'lg:mx-auto lg:max-w-[1120px]')}>
        {nom ? (
          <>
            <span
              aria-hidden="true"
              className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary-deep"
            >
              {initialesDe(nom)}
            </span>
            <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold text-foreground">{nom}</p>
          </>
        ) : (
          <span className="min-w-0 flex-1">
            {/* Même raison : en bureau, la carte étroite ne garde que la mention. */}
            <span className={cn(!large && 'lg:hidden')}>
              <Logo nom={tCommon('appName')} />
            </span>
          </span>
        )}
        {mention ? (
          <p className="inline-flex flex-none items-center gap-1.5 text-[0.8125rem] text-muted-foreground">{mention}</p>
        ) : null}
      </div>
    </header>
  );
}
