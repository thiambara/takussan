import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { Building2, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { ContactSheet } from '@/components/public/profile/ContactSheet';
import { StatsBar } from '@/components/public/profile/StatsBar';
import { PortfolioTabs } from '@/components/public/profile/PortfolioTabs';
import {
  ReviewsSection,
  type PublicReview,
} from '@/components/public/profile/ReviewsSection';
import { TeamStrip } from '@/components/public/profile/TeamStrip';
import type { PropertyListItem } from '@/types/property';

interface AgencyAgentDto {
  id: number;
  slug: string | null;
  full_name: string;
  email?: string | null;
  avatar_url: string | null;
  specialty?: string | null;
  portfolio_count?: number;
}

interface AgencyStats {
  rent_count: number;
  sale_count: number;
  cities: number;
  agents: number;
}

interface AgencyDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  license_number: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  logo_url: string | null;
  agents: AgencyAgentDto[];
  portfolio_count: number;
  portfolio_total: number;
  portfolio: PropertyListItem[];
  stats?: AgencyStats;
  reviews?: {
    average: number | null;
    count: number;
    recent: PublicReview[];
  };
}

interface ApiEnvelope<T> {
  data: T;
}

async function loadAgency(slug: string): Promise<AgencyDto | null> {
  try {
    const res = await apiFetch<ApiEnvelope<AgencyDto>>(
      `/public/agencies/${encodeURIComponent(slug)}`,
      undefined,
      { locale: await getLocale() },
    );
    return res.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations('agency.publicPage');
  const agency = await loadAgency(slug);
  if (!agency) {
    return { title: t('notFound') };
  }
  const summary = agency.stats
    ? agency.city
      ? t('metaSummaryInCity', { count: agency.portfolio_count, city: agency.city })
      : t('metaSummary', { count: agency.portfolio_count })
    : null;
  const title = t('metaTitle', { name: agency.name });
  return {
    title,
    description: agency.description ?? summary ?? undefined,
    openGraph: {
      title,
      description: agency.description ?? summary ?? undefined,
      images: agency.logo_url ? [agency.logo_url] : undefined,
    },
  };
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTranslations('agency.publicPage');
  const { slug } = await params;
  const agency = await loadAgency(slug);
  if (!agency) notFound();

  const stats = agency.stats;
  const reviews = agency.reviews;

  const eyebrowParts = [agency.city, agency.license_number ? null : null].filter(Boolean) as string[];

  const statsItems = stats
    ? [
        { label: t('statsRent'), value: stats.rent_count },
        { label: t('statsSale'), value: stats.sale_count },
        { label: t('statsCities'), value: stats.cities },
        { label: t('statsAgents'), value: stats.agents },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="h-[133px]" />

      <main className="max-w-[1200px] mx-auto px-6 md:px-12 pt-10 pb-24 space-y-16">
        {/* Hero asymétrique avec watermark bogolan */}
        <section className="relative">
          <div className="absolute inset-x-[-12px] inset-y-[-32px] md:inset-x-[-24px] md:inset-y-[-48px] -z-10 rounded-[28px] overflow-hidden bg-card">
            <div className="absolute inset-0 opacity-[0.04] text-foreground">
              <BogolanPattern className="w-full h-full" color="currentColor" />
            </div>
          </div>

          <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-12 md:items-start">
            {/* Colonne identité */}
            <div className="flex flex-col gap-6">
              <div className="relative size-32 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
                {agency.logo_url ? (
                  <Image
                    src={agency.logo_url}
                    alt={agency.name}
                    fill
                    sizes="128px"
                    className="object-cover"
                    priority
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-3xl font-display text-muted-foreground">
                    {getInitials(agency.name)}
                  </span>
                )}
              </div>

              <div>
                {eyebrowParts.length > 0 && (
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {eyebrowParts.join(' · ')}
                  </p>
                )}
                <h1 className="mt-2 font-display text-4xl md:text-5xl font-semibold leading-tight tracking-tight text-foreground">
                  {agency.name}
                </h1>
                {agency.license_number && (
                  <address className="not-italic mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="size-4" aria-hidden />
                    <span>{t('license', { number: agency.license_number })}</span>
                  </address>
                )}
              </div>
            </div>

            {/* Colonne contenu */}
            <div className="flex flex-col gap-6">
              {agency.description && (
                <p className="text-base md:text-lg leading-relaxed text-muted-foreground max-w-prose">
                  {agency.description}
                </p>
              )}

              <ContactSheet
                name={agency.name}
                email={agency.email}
                phone={agency.phone}
                subject={t('contactSubject', { name: agency.name })}
              />
            </div>
          </div>
        </section>

        {/* Bandeau de stats */}
        {stats && <StatsBar items={statsItems} />}

        {/* Équipe — strip horizontal scrollable */}
        {agency.agents.length > 0 && (
          <section aria-labelledby="team-heading">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t('teamEyebrow')}
            </p>
            <h2
              id="team-heading"
              className="mt-2 font-display text-2xl md:text-3xl font-semibold text-foreground"
            >
              {t('teamHeading', { count: agency.agents.length })}
            </h2>

            <div className="mt-6">
              <TeamStrip agents={agency.agents} />
            </div>
          </section>
        )}

        {/* Portefeuille avec onglets */}
        <section aria-labelledby="portfolio-heading">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t('portfolioEyebrow')}
          </p>
          <h2
            id="portfolio-heading"
            className="mt-2 mb-6 font-display text-2xl md:text-3xl font-semibold text-foreground"
          >
            {t('portfolioHeading')}
          </h2>

          {agency.portfolio.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <Building2 className="mx-auto size-6 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-display text-xl text-foreground">{t('emptyTitle')}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t('emptyBody')}</p>
            </div>
          ) : (
            <PortfolioTabs
              portfolio={agency.portfolio}
              source={{ kind: 'agency', slug: agency.slug }}
              totals={{
                all: agency.portfolio_total,
                rent: stats?.rent_count ?? 0,
                sale: stats?.sale_count ?? 0,
              }}
            />
          )}
        </section>

        {/* Avis */}
        {reviews && (
          <ReviewsSection
            average={reviews.average}
            count={reviews.count}
            reviews={reviews.recent}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
