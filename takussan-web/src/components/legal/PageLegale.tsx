import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { FileText } from 'lucide-react';

import { Footer } from '@/components/home/Footer';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { TexteJuridique } from '@/components/legal/TexteJuridique';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';
import { contenuLegal } from '@/lib/legal-content';
import { DOCUMENTS_LEGAUX, ROUTES_LEGALES, type DocumentLegal } from '@/lib/legal-routes';

async function localeCourante(): Promise<Locale> {
  const brut = await getLocale();
  return isLocale(brut) ? brut : DEFAULT_LOCALE;
}

/**
 * Titre et description d'une page juridique.
 *
 * ⚠ `robots` n'est PAS ici : chaque `page.tsx` l'écrit lui-même, en clair, parce que
 * `src/lib/__tests__/sitemap-couverture.test.ts` lit la déclaration DANS le fichier de route et
 * fait rougir une métadonnée importée qu'il ne peut pas classer.
 */
export async function metadonneesLegales(document: DocumentLegal): Promise<Metadata> {
  const t = await getTranslations('legal.documents');
  return {
    title: t(`${document}.title`),
    description: t(`${document}.description`),
  };
}

export interface PageLegaleProps {
  readonly document: DocumentLegal;
}

/**
 * Une page juridique publique, en mode lecture — TCK-531.
 *
 * Le texte vient de `src/content/legal/`, fourni par le porteur. Tant qu'il manque, la page
 * répond quand même (200) avec le titre du document et un état explicite : une case de
 * consentement qui mène à une page honnête vaut mieux qu'un 404, et infiniment mieux qu'un texte
 * provisoire qu'on prendrait pour le vrai.
 */
export async function PageLegale({ document }: PageLegaleProps) {
  const locale = await localeCourante();
  const t = await getTranslations('legal');
  const contenu = contenuLegal(document, locale);
  const autres = DOCUMENTS_LEGAUX.filter((d) => d !== document);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <NavbarSpacer />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6 md:px-8">
        <header className="mb-8 border-b border-border pb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t('eyebrow')}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight text-foreground text-balance md:text-4xl">
            {t(`documents.${document}.title`)}
          </h1>
        </header>

        {contenu.etat === 'a-fournir' ? (
          <section
            aria-labelledby="document-a-fournir"
            className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-12 text-center"
          >
            <FileText aria-hidden="true" className="size-8 text-muted-foreground" />
            <h2 id="document-a-fournir" className="mt-4 font-display text-xl font-semibold text-foreground">
              {t('pending.heading')}
            </h2>
            <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground text-pretty">
              {t('pending.body')}
            </p>
          </section>
        ) : (
          <article lang={contenu.langue}>
            {contenu.mention ? (
              <p className="mb-8 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                {contenu.mention === 'traduction' ? t('notices.translation') : t('notices.frenchOnly')}
              </p>
            ) : null}
            <TexteJuridique source={contenu.texte} />
          </article>
        )}

        <nav aria-labelledby="autres-documents" className="mt-12 border-t border-border pt-8">
          <h2 id="autres-documents" className="font-display text-lg font-semibold text-foreground">
            {t('otherDocuments')}
          </h2>
          <ul className="mt-3 flex flex-col gap-1 sm:flex-row sm:gap-6">
            {autres.map((d) => (
              <li key={d}>
                <LienLocalise
                  href={ROUTES_LEGALES[d]}
                  className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline sm:min-h-0"
                >
                  {t(`documents.${d}.title`)}
                </LienLocalise>
              </li>
            ))}
          </ul>
        </nav>
      </main>

      <Footer />
    </div>
  );
}
