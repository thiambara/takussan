import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Building2 } from 'lucide-react';
import { ErrorState } from '@/components/feedback';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { ContactSheet } from '@/components/public/profile/ContactSheet';
import { PortfolioTabs } from '@/components/public/profile/PortfolioTabs';
import { ReviewsSection } from '@/components/public/profile/ReviewsSection';
import { alternatesLangues } from '@/lib/alternates';
import { getAgent } from '@/lib/queries/public-agent';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations('agents.publicPage');
  const resultat = await getAgent(slug, await getLocale());

  // ⚠️ **Cet appel ne porte AUCUN code HTTP** — le 404 vient du `notFound()` du corps de page.
  // Désagrégé le 2026-08-28 : `notFound()` dans le seul `generateMetadata` rend **200**, dans le
  // seul corps de page **404**. La mesure complète, et la raison pour laquelle cette ligne reste
  // malgré tout — elle est load-bearing pour les TYPES, `never` retirant `introuvable` de l'union
  // avant la lecture de `resultat.agent` —, sont écrites une seule fois, dans le commentaire
  // jumeau de `agencies/[slug]/page.tsx`.
  if (resultat.etat === 'introuvable') notFound();

  if (resultat.etat === 'indisponible') {
    return {
      title: t('unavailableTitle'),
      description: t('unavailableMetaDescription'),
      robots: { index: false },
    };
  }

  const agent = resultat.agent;
  const summary = agent.city
    ? t('metaSummaryInCity', { count: agent.portfolio_count, city: agent.city })
    : t('metaSummary', { count: agent.portfolio_count });
  const title = t('metaTitle', { name: agent.full_name });
  return {
    title,
    description: agent.bio ?? summary,
    alternates: alternatesLangues(`/agents/${slug}`),
    openGraph: {
      title,
      description: agent.bio ?? summary,
      images: agent.avatar_url ? [agent.avatar_url] : undefined,
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

/**
 * L'API n'a pas répondu — **et on ne dit surtout pas que l'agent n'existe pas.**
 *
 * ⚠️ Une FONCTION qui rend du JSX, non un composant asynchrone : sous jsdom, un composant `async`
 * imbriqué ne serait pas rendu, et le test d'AC2 ne verrait jamais cette branche.
 */
async function agentIndisponible() {
  const t = await getTranslations('agents.publicPage');

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {/* Spacer : navbar fixed (~65px) + ligne catégories (~68px) */}
      <div className="h-[133px]" />
      <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <h1 className="mb-6 font-display text-2xl font-semibold text-foreground sm:text-3xl">
          {t('unavailableTitle')}
        </h1>
        <ErrorState message={t('unavailableBody')} />
      </main>
      <Footer />
    </div>
  );
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTranslations('agents.publicPage');
  const { slug } = await params;
  const resultat = await getAgent(slug, await getLocale());

  // Un 404 amont produit un VRAI 404 — statut compris.
  if (resultat.etat === 'introuvable') notFound();
  if (resultat.etat === 'indisponible') return agentIndisponible();

  const agent = resultat.agent;
  const stats = agent.stats;
  const reviews = agent.reviews;

  const eyebrowParts: string[] = [];
  if (agent.city) eyebrowParts.push(agent.city);
  if (agent.specialty) eyebrowParts.push(agent.specialty);
  if (agent.years_of_experience && agent.years_of_experience > 0) {
    eyebrowParts.push(t('experience', { count: agent.years_of_experience }));
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="h-[133px]" />

      <main className="max-w-[1200px] mx-auto px-6 md:px-12 pt-10 pb-24 space-y-16">
        {/* Hero asymétrique */}
        <section className="relative">
          <div className="absolute inset-x-[-12px] inset-y-[-32px] md:inset-x-[-24px] md:inset-y-[-48px] -z-10 rounded-[28px] overflow-hidden bg-card">
            <div className="absolute inset-0 opacity-[0.04] text-foreground">
              <BogolanPattern className="w-full h-full" color="currentColor" />
            </div>
          </div>

          <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-12 md:items-start">
            <div className="flex flex-col gap-6">
              <div className="relative size-36 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                {agent.avatar_url ? (
                  <Image
                    src={agent.avatar_url}
                    alt={agent.full_name}
                    fill
                    sizes="144px"
                    className="object-cover"
                    priority
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-3xl font-display text-muted-foreground">
                    {getInitials(agent.full_name)}
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
                  {agent.full_name}
                </h1>
                {agent.agency && (
                  <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="size-4" aria-hidden />
                    <span>
                      {t('agentAt')}{' '}
                      <LienLocalise
                        href={`/agencies/${agent.agency.slug}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {agent.agency.name}
                      </LienLocalise>
                    </span>
                  </p>
                )}
                {stats && agent.portfolio_total > 0 && (
                  <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>{t('propertiesCount', { count: agent.portfolio_total })}</span>
                    {stats.rent_count > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          <span className="tabular-nums">{stats.rent_count}</span> {t('forRent')}
                        </span>
                      </>
                    )}
                    {stats.sale_count > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          <span className="tabular-nums">{stats.sale_count}</span> {t('forSale')}
                        </span>
                      </>
                    )}
                    {stats.cities > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{t('citiesCount', { count: stats.cities })}</span>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {agent.bio && (
                <p className="text-base md:text-lg leading-relaxed text-muted-foreground max-w-prose">
                  {agent.bio}
                </p>
              )}
              <ContactSheet
                name={agent.full_name}
                agentSlug={agent.slug}
                phone={agent.phone}
                subject={t('contactSubject', { name: agent.full_name })}
              />
            </div>
          </div>
        </section>

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

          {agent.portfolio.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <Building2 className="mx-auto size-6 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-display text-xl text-foreground">{t('emptyTitle')}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t('emptyBody')}</p>
            </div>
          ) : (
            <PortfolioTabs
              portfolio={agent.portfolio}
              source={{ kind: 'agent', slug: agent.slug }}
              totals={{
                all: agent.portfolio_total,
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
