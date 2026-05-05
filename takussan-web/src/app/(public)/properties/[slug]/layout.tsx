import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
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

async function getProperty(slug: string): Promise<PropertyDetail | null> {
  try {
    const res = await apiFetch<{ data: PropertyDetail }>(
      `/public/properties/${slug}?fields[properties]=${fields}`,
    );
    return res.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const property = await getProperty(slug);

  if (!property) {
    const t = await getTranslations('meta.propertyMissing');
    return {
      title: t('title'),
      description: t('description'),
    };
  }

  const title = `${property.title} · Takussan`;
  const description =
    property.description?.slice(0, 160) ??
    `${property.type_label} à ${property.location.quarter}, ${property.location.city}.`;
  const image = property.main_photo_url ?? undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: image ? [{ url: image, alt: property.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default function PropertyDetailLayout({ children }: Props) {
  return children;
}
