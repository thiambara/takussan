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
 * Un `not-found.tsx` entièrement `'use client'` **n'est pas rendu dans le HTML initial**. Mesuré
 * le 2026-08-27, sonde jetable, sur `next dev` ET sur un `next build` + `next start` :
 *
 *     not-found.tsx composant SERVEUR   → son texte est DANS le HTML de la réponse 404
 *     not-found.tsx composant CLIENT    → absent du HTML ; l'écran est vide jusqu'à l'hydratation
 *     hybride (serveur + enfant client) → le serveur est dans le HTML, l'enfant client non
 *
 * L'écran porte donc son message et son chemin de retour principal côté serveur, et ne confie au
 * client que ce qui exige l'URL demandée : le raccourci vers la liste. Ce raccourci apparaît à
 * l'hydratation ; ce qui manque avant elle est un raccourci, plus jamais l'explication.
 *
 * ⚠ Mesuré le 2026-11-11 (TCK-2619, build de production) : une 404 de `/app` est servie en document
 * d'erreur de Next, corps vide — rien de l'écran, serveur ou client, n'est dans le HTML. Pourquoi le
 * relevé ci-dessus disait autre chose n'est pas établi (docblock de `not-found.tsx`).
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
