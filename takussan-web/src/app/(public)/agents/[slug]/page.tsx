import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Building2, Mail, Phone } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { PropertyCardListing } from '@/components/property/cards/PropertyCardListing';
import type { PropertyListItem } from '@/types/property';

interface AgentDto {
  id: number;
  slug: string;
  full_name: string;
  bio?: string | null;
  email: string | null;
  phone: string | null;
  whatsapp?: string | null;
  city?: string | null;
  languages?: string[] | null;
  years_of_experience?: number | null;
  avatar_url: string | null;
  agency: { id: number; name: string; slug: string } | null;
  portfolio_count: number;
  portfolio: PropertyListItem[];
}

interface ApiEnvelope<T> {
  data: T;
}

async function loadAgent(slug: string): Promise<AgentDto | null> {
  try {
    const res = await apiFetch<ApiEnvelope<AgentDto>>(`/public/agents/${encodeURIComponent(slug)}`);
    return res.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await loadAgent(slug);
  return {
    title: agent ? `${agent.full_name} — Agent immobilier` : 'Agent introuvable',
    description: agent?.bio ?? undefined,
    openGraph: agent
      ? {
          title: `${agent.full_name} — Agent immobilier`,
          description: agent.bio ?? undefined,
          images: agent.avatar_url ? [agent.avatar_url] : undefined,
        }
      : undefined,
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

function whatsappLink(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await loadAgent(slug);
  if (!agent) notFound();

  const eyebrowParts: string[] = [];
  if (agent.city) eyebrowParts.push(agent.city);
  if (agent.years_of_experience && agent.years_of_experience > 0) {
    eyebrowParts.push(
      `${agent.years_of_experience} an${agent.years_of_experience > 1 ? 's' : ''} d'expérience`,
    );
  }
  if (agent.languages && agent.languages.length > 0) {
    eyebrowParts.push(agent.languages.join(' · '));
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Spacer : 1ère ligne navbar (~65px) + ligne catégories (~68px). */}
      <div className="h-[133px]" />

      <main className="max-w-[1200px] mx-auto px-6 md:px-12 pt-10 pb-24 space-y-16">
        <section className="relative">
          <div className="absolute inset-x-[-12px] inset-y-[-32px] md:inset-x-[-24px] md:inset-y-[-48px] -z-10 rounded-[28px] overflow-hidden bg-card">
            <div className="absolute inset-0 opacity-[0.04] text-foreground">
              <BogolanPattern className="w-full h-full" color="currentColor" />
            </div>
          </div>

          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="relative size-28 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                {agent.avatar_url ? (
                  <Image
                    src={agent.avatar_url}
                    alt={agent.full_name}
                    fill
                    sizes="112px"
                    className="object-cover"
                    priority
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-2xl font-display text-muted-foreground">
                    {getInitials(agent.full_name)}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                {eyebrowParts.length > 0 && (
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {eyebrowParts.join(' · ')}
                  </p>
                )}
                <h1 className="mt-2 font-display text-4xl md:text-5xl font-semibold text-foreground">
                  {agent.full_name}
                </h1>
                {agent.agency && (
                  <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="size-4" aria-hidden />
                    <span>
                      Agent chez{' '}
                      <Link
                        href={`/agencies/${agent.agency.slug}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {agent.agency.name}
                      </Link>
                    </span>
                  </p>
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  {agent.portfolio_count} bien{agent.portfolio_count > 1 ? 's' : ''} en portefeuille
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {agent.email && (
                <Button size="lg" render={<a href={`mailto:${agent.email}`} />}>
                  <Mail aria-hidden />
                  Envoyer un email
                </Button>
              )}
              {agent.phone && (
                <Button size="lg" variant="outline" render={<a href={`tel:${agent.phone}`} />}>
                  <Phone aria-hidden />
                  Appeler
                </Button>
              )}
              {agent.whatsapp && (
                <Button
                  size="lg"
                  variant="outline"
                  render={
                    <a
                      href={whatsappLink(agent.whatsapp)}
                      rel="noopener noreferrer"
                      target="_blank"
                    />
                  }
                >
                  WhatsApp
                </Button>
              )}
            </div>
          </div>

          {agent.bio && (
            <p className="mt-8 max-w-3xl text-base leading-relaxed text-muted-foreground">
              {agent.bio}
            </p>
          )}
        </section>

        <section>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Portefeuille
          </p>
          <h2 className="mt-2 font-display text-2xl md:text-3xl font-semibold text-foreground">
            Biens à l&apos;affiche
          </h2>

          {agent.portfolio.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-border bg-card p-10 text-center">
              <p className="font-display text-xl text-foreground">
                Pas encore de bien à présenter
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Cet agent prépare ses prochaines annonces — revenez bientôt.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {agent.portfolio.map((p, index) => (
                <PropertyCardListing key={p.id} property={p} index={index} />
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
