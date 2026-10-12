import { Footer } from '@/components/home/Footer';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useTranslations } from 'next-intl';

/**
 * TCK-621 — la fiche introuvable porte la chrome du site, comme ses voisines (`page.tsx` rend
 * `Navbar` et `Footer` autour d'un bien retiré ou indisponible) : sans elle, c'était le seul écran
 * de la fiche sans marque ni navigation.
 */

export default function NotFound() {
  const t = useTranslations('errors.propertyNotFound');

  return (
    <>
      <Navbar />
      <NavbarSpacer />
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="text-3xl font-bold text-foreground mb-3">{t('title')}</h1>
        <p className="text-muted-foreground mb-8">{t('body')}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <LienLocalise
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('browseListings')}
          </LienLocalise>
          <LienLocalise
            href="/properties"
            className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
          >
            {t('startSearch')}
          </LienLocalise>
        </div>
      </div>
      <Footer />
    </>
  );
}
