'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { listePour } from '@/lib/navigation/app-sections';
import { cn } from '@/lib/utils';

/**
 * Le seul morceau CLIENT de l'écran introuvable — et il est isolé ici pour une raison mesurée.
 *
 * Il ne porte que ce qui exige l'URL demandée : le raccourci vers la liste. Le message et le retour
 * principal sont rendus par le composant serveur `CorpsDeLIntrouvable`.
 *
 * ⚠ Aucun des deux n'est dans le HTML de la réponse 404, serveur ou client. Un relevé du 2026-08-27
 * affirmait qu'un `not-found.tsx` serveur y était ; mesuré le 2026-11-14 sur `next build` +
 * `next start` (TCK-2740), y compris sur une sonde hors de `/app` : Next 16 sert une 404 de
 * `notFound()` en document d'erreur au corps vide, et tout l'écran arrive à l'hydratation
 * (docblock de `not-found.tsx`).
 *
 * `usePathname()` rend bien l'URL DEMANDÉE, y compris sur une navigation douce — vérifié au
 * navigateur sur la sonde (clic depuis une autre page, `pathname` lu dans la frontière :
 * `/sonde-nf/leases/abc`, l'URL cible et non celle d'origine). C'était la dernière affirmation
 * du lot qui restait une déduction.
 */
export function RetourVersLaListe() {
  const t = useTranslations('dashboard.notFound');
  const liste = listePour(usePathname());
  if (!liste) return null;

  return (
    // TCK-2619 — le retour de la maquette (« Page introuvable », bureau) : contour, en tête des deux.
    <Link href={liste} data-slot="retour-a-la-liste" className={cn(buttonVariants({ variant: 'outline' }), 'max-md:h-12 max-md:w-full max-md:text-corps')}>
      {t('backToList')}
    </Link>
  );
}
