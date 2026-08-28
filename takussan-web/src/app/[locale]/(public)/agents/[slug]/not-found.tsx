import { useTranslations } from 'next-intl';

import { Footer } from '@/components/home/Footer';
import { Navbar } from '@/components/home/Navbar';
import { LienLocalise } from '@/components/shared/LienLocalise';

/**
 * L'écran d'un agent qui n'existe pas (TCK-438).
 *
 * ⚠️ **Il n'attrape le `notFound()` de la page que parce que la décision reste DANS la page.**
 * Mesuré le 2026-08-27 sur `next dev` 16.3.1 : un `notFound()` levé depuis un `layout.tsx` de ce
 * même segment est attrapé par la frontière du segment **parent** (`agents/not-found.tsx`), pas
 * par celle-ci — ce fichier deviendrait alors du code mort qu'aucun type et aucun test de rendu
 * ne signalerait. Le lien entre l'emplacement de la décision et l'emplacement de l'écran est donc
 * une contrainte, pas une coïncidence ; le docblock de `pas-de-frontiere-de-suspension.test.ts`
 * porte le relevé complet.
 */
export default function NotFound() {
  const t = useTranslations('agents.publicPage');

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {/* Spacer : navbar fixed (~65px) + ligne catégories (~68px) */}
      <div className="h-[133px]" />
      <main className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <h1 className="mb-3 font-display text-3xl font-semibold text-foreground">
          {t('notFoundTitle')}
        </h1>
        <p className="mb-8 text-muted-foreground">{t('notFoundBody')}</p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <LienLocalise
            href="/properties"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t('notFoundBrowse')}
          </LienLocalise>
          <LienLocalise
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {t('notFoundHome')}
          </LienLocalise>
        </div>
      </main>
      <Footer />
    </div>
  );
}
