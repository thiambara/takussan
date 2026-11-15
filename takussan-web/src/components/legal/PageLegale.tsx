import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ChevronDown, FileText, List } from 'lucide-react';

import { Footer } from '@/components/home/Footer';
import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { TexteJuridique, sommaireJuridique } from '@/components/legal/TexteJuridique';
import { BarreDeLecture, SommaireJuridique } from '@/components/legal/SuiviDeLecture';
import { alternatesPubliques } from '@/lib/alternates';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';
import { contenuLegal } from '@/lib/legal-content';
import { DOCUMENTS_LEGAUX, ROUTES_LEGALES, type DocumentLegal } from '@/lib/legal-routes';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

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
    // TCK-2516 — canonique et `hreflang`, du même chemin (cf. `alternatesPubliques`). La page reste
    // `noindex` : la canonique désigne la version de référence du lien qu'on partage
    // (`/fr/legal/terms#partie-17`), et les `hreflang` relient ses trois langues.
    alternates: alternatesPubliques(ROUTES_LEGALES[document], await localeCourante()),
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
 *
 * TCK-2516 — « sommaire et repères » : le sommaire se dérive des titres (`sommaireJuridique`),
 * chaque partie porte une ancre stable (`#partie-6`). Téléphone : sommaire repliable en tête, puis
 * une barre de lecture qui dit la partie en cours et rouvre le sommaire en feuille. Bureau :
 * sommaire à gauche, qui suit la lecture ; colonne à 68 caractères. **Le texte ne change pas** :
 * seule la mise en page change. Les liens et le `<details>` sont du HTML servi : sans JavaScript,
 * sommaire et ancres marchent ; le suivi est une amélioration.
 */
export async function PageLegale({ document }: PageLegaleProps) {
  const locale = await localeCourante();
  const t = await getTranslations('legal');
  const contenu = contenuLegal(document, locale);
  const autres = DOCUMENTS_LEGAUX.filter((d) => d !== document);
  // TCK-2516 — le sommaire se DÉRIVE des titres du texte rendu : aucune liste à tenir à jour.
  const sommaire = contenu.etat === 'publie' ? sommaireJuridique(contenu.texte) : [];
  const libelleAncre = t('anchorLink');

  const liensAutres = autres.map((d) => ({ cle: d, href: ROUTES_LEGALES[d], titre: t(`documents.${d}.title`) }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <NavbarSpacer />
      {sommaire.length > 0 ? (
        <BarreDeLecture
          entrees={sommaire}
          libelles={{ sommaire: t('toc.title'), fermer: t('toc.close'), partieEnCours: t('toc.current') }}
        />
      ) : null}

      <main
        id={CONTENU_PRINCIPAL_ID}
        tabIndex={-1}
        className="mx-auto max-w-[1120px] px-4 pb-24 pt-6 focus:outline-none sm:px-6 md:px-8 lg:grid lg:grid-cols-[240px_minmax(0,68ch)] lg:justify-center lg:gap-16 lg:pt-12"
      >
        {/* La colonne de lecture d'abord dans le document (le titre de la page est le premier titre
            lu), le sommaire du bureau ensuite, posé à gauche par la grille. */}
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <header>
            {/* TCK-2516 — plus de sur-titre « Informations légales » : le titre suffit. */}
            <h1 className="font-display text-[1.875rem] font-semibold leading-[1.1] tracking-[-0.03em] text-foreground text-balance md:text-4xl">
              {t(`documents.${document}.title`)}
            </h1>
          </header>

          {/* Téléphone : « Autres documents » remonte en tête, en puces. */}
          <nav aria-label={t('otherDocuments')} className="mt-4 lg:hidden">
            <ul className="flex flex-wrap gap-2">
              {liensAutres.map((lien) => (
                <li key={lien.cle}>
                  <LienLocalise
                    href={lien.href}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                    {lien.titre}
                  </LienLocalise>
                </li>
              ))}
            </ul>
          </nav>

          {/* Téléphone : le sommaire repliable. Un `<details>` natif : il s'ouvre sans JavaScript. */}
          {sommaire.length > 0 ? (
            <details className="group mt-5 rounded-2xl border border-border bg-card lg:hidden">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-2xl px-4 text-[0.9375rem] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <List className="size-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">{t('toc.summary', { count: sommaire.length })}</span>
                <ChevronDown
                  className="size-5 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <nav aria-label={t('toc.title')} className="border-t border-border px-4 pb-2">
                <SommaireJuridique entrees={sommaire} />
              </nav>
            </details>
          ) : null}

          <div className="mt-6 lg:mt-8">
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
                <TexteJuridique source={contenu.texte} libelleAncre={libelleAncre} />
              </article>
            )}
          </div>
        </div>

        {/* Bureau : le sommaire à gauche, qui suit la lecture, puis les autres documents. */}
        <aside className="hidden lg:col-start-1 lg:row-start-1 lg:block">
          <div className="sticky top-28 max-h-[calc(100dvh-var(--spacing)*32)] overflow-y-auto overscroll-contain pb-8">
            {sommaire.length > 0 ? (
              <nav aria-labelledby="sommaire-du-document">
                <h2 id="sommaire-du-document" className="px-3 text-sm font-semibold text-foreground">
                  {t('toc.title')}
                </h2>
                <div className="mt-2">
                  <SommaireJuridique entrees={sommaire} compacte />
                </div>
              </nav>
            ) : null}
            <nav
              aria-labelledby="autres-documents"
              className={sommaire.length > 0 ? 'mt-6 border-t border-border pt-4' : undefined}
            >
              <h2 id="autres-documents" className="px-3 text-sm font-semibold text-foreground">
                {t('otherDocuments')}
              </h2>
              <ul className="mt-1.5 space-y-1">
                {liensAutres.map((lien) => (
                  <li key={lien.cle}>
                    <LienLocalise
                      href={lien.href}
                      className="block rounded-lg px-3 py-1 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
                    >
                      {lien.titre}
                    </LienLocalise>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>
      </main>

      <Footer />
    </div>
  );
}
