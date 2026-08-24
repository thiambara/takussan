import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { ErrorState } from '@/components/feedback';
import { Footer } from '@/components/home/Footer';
import { Navbar } from '@/components/home/Navbar';
import { jsonLdRealEstateListing } from '@/lib/jsonld-property';
import { getProperty } from '@/lib/queries/public-property';

import { PropertyDetailContent } from './PropertyDetailContent';

type Props = {
  readonly params: Promise<{ slug: string }>;
};

/**
 * ⚠️ **`generateMetadata` vivait dans un `layout.tsx` passe-plat** (`export default … => children`),
 * supprimé par TCK-335. Le layout n'existait que pour tenir cette fonction à un endroit où la page,
 * cliente, ne pouvait pas la porter. La page est serveur : la raison a disparu avec elle.
 *
 * Les deux appels à `getProperty` — celui-ci et celui de la page — **ne font qu'un aller-retour** :
 * `cache()` de React mémoïse pour la durée du rendu. L'ancienne chaîne en faisait deux, dont un
 * jeté (le layout récupérait le bien pour le `<title>` puis l'abandonnait, et le navigateur le
 * redemandait après hydratation).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const resultat = await getProperty(slug, await getLocale());

  // ⚠️ **`notFound()` est appelé ICI, et pas seulement dans la page — c'est ce qui décide du
  // CODE HTTP.** Mesuré le 2026-08-21 sur `next start` ET sur `next dev` : avec l'appel dans le
  // seul corps de la page, un slug inexistant rendait le bon écran… en **HTTP 200**. La racine du
  // layout (`await cookies()`) se résout avant `getProperty()` (un aller-retour HTTP vers l'API),
  // Next valide alors le statut de la réponse, et le `notFound()` de la page arrive trop tard.
  // `generateMetadata`, lui, est attendu AVANT que la coque ne parte.
  //
  // Ablation faite : sans cette ligne, `curl -o /dev/null -w '%{http_code}'` rend **200** ; avec,
  // **404**. Le `notFound()` du corps de page reste — il porte le rendu, celui-ci porte le statut.
  if (resultat.etat === 'introuvable') notFound();

  if (resultat.etat === 'indisponible') {
    // ⚠️ **`robots: { index: false }`, et c'est le cœur du correctif.** Mesuré en production le
    // 2026-08-21 : la fiche `/properties/studio-meuble-a-parcelles-assainies-5Kyslt` répondait
    // **200** avec `<title>Bien introuvable</title>`, sans `<h1>` ni JSON-LD — un soft-404 offert
    // à l'indexation, sur toute la surface du catalogue.
    //
    // Le cas `introuvable` sort désormais en VRAI 404 (ci-dessus). Celui-ci reste une 200, parce
    // qu'on ne sait PAS que le bien n'existe pas — l'API n'a simplement pas répondu — mais il ne
    // s'offre plus à l'index, et il ne prétend plus que le bien est introuvable.
    const t = await getTranslations('meta.propertyUnavailable');
    return {
      title: t('title'),
      description: t('description'),
      robots: { index: false },
    };
  }

  const property = resultat.bien;

  // Bare title — the (public) layout's title.template adds the
  // "— Takussan" suffix exactly once (TCK-166). Social cards keep the
  // full app name explicitly since they don't go through the template.
  const title = property.title;
  const socialTitle = `${property.title} — Takussan`;
  const tMeta = await getTranslations('meta.property');
  // `quarter` et `city` sont `string | null`. Le gabarit qui occupait cette place avant TCK-292
  // rendait littéralement « null » quand ils l'étaient, et TCK-292 a reproduit le défaut à
  // l'identique plutôt que de le réparer en passant. **Il est réparé ici** : un repli qui n'a pas
  // de lieu à donner n'en invente pas, il n'en met pas.
  const description =
    property.description?.slice(0, 160) ??
    tMeta('descriptionFallback', {
      type: property.type_label,
      quarter: property.location.quarter ?? '',
      city: property.location.city ?? '',
    });
  const image = property.main_photo_url ?? undefined;

  return {
    title,
    description,
    openGraph: {
      title: socialTitle,
      description,
      type: 'website',
      images: image ? [{ url: image, alt: property.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: image ? [image] : undefined,
    },
  };
}

/**
 * Sérialisation d'un JSON-LD destiné à `dangerouslySetInnerHTML`.
 *
 * `</script>` dans une description de bien terminerait la balise ; `<` est donc échappé en
 * `\u003c`, une séquence que JSON comprend et que l'analyseur HTML ne voit pas.
 */
function scriptJsonLd(donnees: unknown): string {
  return JSON.stringify(donnees).replace(/</g, '\\u003c');
}

/**
 * L'API n'a pas répondu — **et on ne dit surtout pas que le bien n'existe pas.**
 *
 * C'est la distinction que l'ancien `try { … } catch { return null }` effaçait : il rendait
 * « Bien introuvable » pour une API éteinte comme pour un slug supprimé, c'est-à-dire une
 * affirmation fausse servie en HTTP 200.
 *
 * ⚠️ Une FONCTION qui rend du JSX, et non un composant asynchrone. Un composant `async` imbriqué
 * dans l'arbre rendu n'est rendu que par le moteur serveur ; le laisser tel quel rendrait cette
 * branche — la seule qui compte ici — non testable sous jsdom.
 */
async function bienIndisponible() {
  const t = await getTranslations('property.detail');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-6">{t('unavailableTitle')}</h1>
      <ErrorState message={t('unavailableBody')} />
    </div>
  );
}

export default async function PropertyDetailPage({ params }: Props) {
  const { slug } = await params;
  const resultat = await getProperty(slug, await getLocale());

  // Un 404 amont produit un VRAI 404 — statut compris. C'est la seule panne dont on sache
  // qu'elle signifie « ce bien n'existe pas ».
  if (resultat.etat === 'introuvable') notFound();

  const corps =
    resultat.etat === 'indisponible' ? (
      await bienIndisponible()
    ) : (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: scriptJsonLd(jsonLdRealEstateListing(resultat.bien)) }}
        />
        <PropertyDetailContent property={resultat.bien} />
      </>
    );

  return (
    <>
      <Navbar />
      {/* Spacer : navbar fixed (~65px) + ligne catégories (~68px) */}
      <div className="h-[133px]" />
      {corps}
      <Footer />
    </>
  );
}
