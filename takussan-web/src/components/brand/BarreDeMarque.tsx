import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';

export interface BarreDeMarqueProps {
  /** Largeur de la rangée intérieure — celle du contenu qu'elle surplombe. */
  readonly largeur?: 'max-w-lg' | 'max-w-2xl' | 'max-w-4xl';
  readonly className?: string;
}

/**
 * TCK-621 — la barre d'identité des écrans servis HORS de toute coque : frontières d'erreur,
 * maintenance, redirection de publication, enrôlement du second facteur, accueil du super-admin.
 * Ils n'héritaient d'aucune chrome, et l'on y arrivait depuis un site marqué sur une page sans
 * logo ni issue — le motif qu'`OnboardingShell` avait déjà corrigé pour les assistants.
 *
 * Le lien mène à l'accueil : c'est la seule issue que ces écrans peuvent promettre sans rien
 * savoir de qui les voit. Pas de texte propre : le nom vient de `common.appName`.
 */
export function BarreDeMarque({ largeur = 'max-w-4xl', className }: BarreDeMarqueProps) {
  const t = useTranslations('common');

  return (
    <header className={cn('shrink-0 border-b border-border bg-card', className)}>
      <div className={cn('mx-auto flex h-14 w-full items-center px-4 sm:px-6', largeur)}>
        <Link
          href="/"
          className="inline-flex rounded-md py-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Logo nom={t('appName')} />
        </Link>
      </div>
    </header>
  );
}
