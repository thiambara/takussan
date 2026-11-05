'use client';

import Link from 'next/link';
import { ArrowRight, Home } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface CarteDeMiseEnLocationProps {
  readonly href: string;
  readonly onNavigate?: () => void;
}

/**
 * TCK-2478 (ADR-0089) — la carte basse du client et du locataire : « Mettre un bien en location »,
 * vers `/publish` (TCK-625). Elle remplace la ligne « Publier un bien » de leur menu, sur le patron
 * visuel de la carte « Passer en agence » (`ProUpgradeCard`) : même bordure, même rayon.
 *
 * Elle n'a aucune règle d'accès : c'est `composerMenu` qui la rend ou non (`menu.carte`).
 */
export function CarteDeMiseEnLocation({ href, onNavigate }: CarteDeMiseEnLocationProps) {
  const t = useTranslations('nav.sidebar.carteLocation');
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group/location mb-2 block rounded-xl border border-border bg-muted px-3.5 py-3 transition-colors hover:border-primary/30 hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Home className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] font-semibold leading-tight text-foreground">{t('titre')}</p>
          <p className="mt-0.5 text-xs leading-snug text-pretty text-muted-foreground">{t('texte')}</p>
        </div>
        <ArrowRight
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-primary transition-transform group-hover/location:translate-x-0.5"
        />
      </div>
    </Link>
  );
}
