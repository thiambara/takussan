import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { isLocale } from '@/i18n/config';

import { ErrorState } from '@/components/feedback';
import { Footer } from '@/components/home/Footer';
import { Navbar } from '@/components/home/Navbar';
import { alternatesPubliques } from '@/lib/alternates';
import { DonneesStructurees } from '@/lib/jsonld';
import { jsonLdFilDAriane, maillonsDeFiche } from '@/lib/fil-d-ariane';
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
  const brut = await getLocale();
  const locale = isLocale(brut) ? brut : 'fr';
  const resultat = await getProperty(slug, locale);

  // ⚠️ **Cet appel ne porte AUCUN code HTTP** — c'est le `notFound()` du CORPS DE PAGE qui le
  // porte. La mesure de TCK-335 (2026-08-21) portait sur une sonde qui appelait `notFound()`
  // AUX DEUX endroits : elle n'avait jamais séparé leurs effets. Désagrégé le 2026-08-28 —
  //     generateMetadata seul → 200  |  corps seul → 404  |  les deux → 404
  // Ce que le corps produit ne survit qu'en l'absence de TOUTE frontière de suspension au-dessus
  // de lui ; c'est `[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts` qui le
  // verrouille. Cette ligne reste parce qu'elle est PORTEUSE POUR LES TYPES : `notFound()` rend
  // `never` et retire `introuvable` de l'union avant la lecture de `resultat.bien`.
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
    // Canonique + hreflang — ADR-0026 §1, TCK-433. C'est l'objectif utilisateur de TCK-434 rendu
    // vérifiable : un lien partagé porte sa langue, et les deux autres versions de LA MÊME fiche
    // sont nommées. La canonique désigne cette fiche-ci, dans la langue servie : une fiche n'a pas
    // de variante d'URL à replier, mais sans canonique explicite Next n'en émet aucune.
    alternates: alternatesPubliques(`/properties/${slug}`, locale),
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

/*
 * ⚠️ `scriptJsonLd` vivait ICI, en copie privée (TCK-335). Il est passé dans `@/lib/jsonld`
 * (TCK-435) : trois surfaces de plus émettent désormais du JSON-LD, et un échappement recopié
 * quatre fois est un échappement qu'on oublie une fois. Un `</script>` oublié n'est pas un
 * balisage invalide — c'est une balise HTML fermée au milieu du document.
 */

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
  const brut = await getLocale();
  const locale = isLocale(brut) ? brut : 'fr';
  const resultat = await getProperty(slug, locale);

  // Un 404 amont produit un VRAI 404 — statut compris. C'est la seule panne dont on sache
  // qu'elle signifie « ce bien n'existe pas ».
  if (resultat.etat === 'introuvable') notFound();

  const corps =
    resultat.etat === 'indisponible' ? (
      await bienIndisponible()
    ) : (
      <>
        <DonneesStructurees donnees={jsonLdRealEstateListing(resultat.bien, locale)} />
        {/*
          Le fil d'Ariane BALISÉ (TCK-435 · AC1) — mêmes maillons, même ordre que celui affiché
          par `PropertyBreadcrumb`, parce que les deux appellent `maillonsDeFiche`. Le traducteur
          est celui du serveur ; le composant passe le sien, côté client.
        */}
        <DonneesStructurees
          donnees={jsonLdFilDAriane(
            maillonsDeFiche(resultat.bien, await getTranslations('property.detail')),
            locale,
          )}
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
