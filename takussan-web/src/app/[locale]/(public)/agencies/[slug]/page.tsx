import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { Building2, ShieldCheck } from 'lucide-react';
import { ErrorState } from '@/components/feedback';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { ContactSheet } from '@/components/public/profile/ContactSheet';
import { StatsBar } from '@/components/public/profile/StatsBar';
import { PortfolioTabs } from '@/components/public/profile/PortfolioTabs';
import { ReviewsSection } from '@/components/public/profile/ReviewsSection';
import { TeamStrip } from '@/components/public/profile/TeamStrip';
import { alternatesLangues } from '@/lib/alternates';
import { getAgency } from '@/lib/queries/public-agency';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations('agency.publicPage');
  const resultat = await getAgency(slug, await getLocale());

  // ⚠️ **`notFound()` est appelé ICI AUSSI, et pas seulement dans la page — c'est ce qui rend le
  // CODE HTTP robuste.** `generateMetadata` est attendu avant que la coque ne parte ; un
  // `notFound()` qui n'arriverait qu'au corps de page dépend, pour fixer le statut, de ce que
  // rien n'ait encore été écrit. C'est la forme validée par TCK-335 sur la fiche de bien, dont
  // l'ablation avait rendu **200** au lieu de 404.
  if (resultat.etat === 'introuvable') notFound();

  if (resultat.etat === 'indisponible') {
    // ⚠️ **`robots: { index: false }` — une page qui ne sait pas ne s'offre pas à l'indexation.**
    // Ce cas reste une 200 parce qu'on ne sait PAS que l'agence n'existe pas : l'API n'a
    // simplement pas répondu. Servir un 404 ici graverait dans le statut une affirmation fausse
    // (c'est ce que faisait le `catch { return null }` d'avant TCK-438), et servir une 200
    // indexable offrirait un soft-404 aux moteurs — les deux défauts que TCK-335 a nommés.
    return {
      title: t('unavailableTitle'),
      description: t('unavailableMetaDescription'),
      robots: { index: false },
    };
  }

  const agency = resultat.agence;
  const summary = agency.stats
    ? agency.city
      ? t('metaSummaryInCity', { count: agency.portfolio_count, city: agency.city })
      : t('metaSummary', { count: agency.portfolio_count })
    : null;
  const title = t('metaTitle', { name: agency.name });
  return {
    title,
    description: agency.description ?? summary ?? undefined,
    alternates: alternatesLangues(`/agencies/${slug}`),
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

/**
 * L'API n'a pas répondu — **et on ne dit surtout pas que l'agence n'existe pas.**
 *
 * ⚠️ Une FONCTION qui rend du JSX, et non un composant asynchrone : un composant `async` imbriqué
 * dans l'arbre rendu n'est rendu que par le moteur serveur, ce qui rendrait cette branche — la
 * seule que le test d'AC2 regarde — non testable sous jsdom. Même raison, même forme que
 * `bienIndisponible()` sur la fiche de bien.
 */
async function agenceIndisponible() {
  const t = await getTranslations('agency.publicPage');

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
  const t = await getTranslations('agency.publicPage');
  const { slug } = await params;
  const resultat = await getAgency(slug, await getLocale());

  // Un 404 amont produit un VRAI 404 — statut compris. C'est la seule panne dont on sache qu'elle
  // signifie « cette agence n'existe pas ».
  if (resultat.etat === 'introuvable') notFound();
  if (resultat.etat === 'indisponible') return agenceIndisponible();

  const agency = resultat.agence;
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
