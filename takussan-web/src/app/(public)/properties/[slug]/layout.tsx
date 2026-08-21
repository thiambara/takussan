import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api';
import type { PropertyDetail } from '@/types/property';

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

const fields = [
  'id',
  'slug',
  'title',
  'description',
  'price',
  'currency',
  'main_photo_url',
  'location',
  'type_label',
].join(',');

async function getProperty(slug: string, locale: string): Promise<PropertyDetail | null> {
  try {
    // TCK-335 — la locale est passée EXPLICITEMENT : `apiFetch` la déduit sinon du cookie
    // du navigateur, qui n'existe pas en rendu serveur. Sans elle, `<title>` et
    // `og:description` d'une fiche sortiraient dans la langue du serveur.
    const res = await apiFetch<{ data: PropertyDetail }>(
      `/public/properties/${slug}?fields[properties]=${fields}`,
      undefined,
      { locale },
    );
    return res.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const property = await getProperty(slug, await getLocale());

  if (!property) {
    const t = await getTranslations('meta.propertyMissing');
    return {
      title: t('title'),
      description: t('description'),
    };
  }

  // Bare title — the (public) layout's title.template adds the
  // "— Takussan" suffix exactly once (TCK-166). Social cards keep the
  // full app name explicitly since they don't go through the template.
  const title = property.title;
  const socialTitle = `${property.title} — Takussan`;
  const tMeta = await getTranslations('meta.property');
  // `String(…)` sur quarter/city : ces deux champs sont `string | null`, et le gabarit qui
  // occupait cette place avant TCK-292 rendait littéralement « null » quand ils l'étaient.
  // TCK-292 déplace le texte, il ne corrige aucun rendu (AC3) — le défaut est donc reproduit
  // À L'IDENTIQUE et signalé comme dette, plutôt que réparé en passant.
  const description =
    property.description?.slice(0, 160) ??
    tMeta('descriptionFallback', {
      type: property.type_label,
      quarter: String(property.location.quarter),
      city: String(property.location.city),
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

export default function PropertyDetailLayout({ children }: Props) {
  return children;
}
