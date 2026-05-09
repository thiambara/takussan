import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Mail, Phone, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { PropertyCardListing } from '@/components/property/cards/PropertyCardListing';
import type { PropertyListItem } from '@/types/property';

interface AgencyAgentDto {
  id: number;
  slug: string | null;
  full_name: string;
  email?: string | null;
  avatar_url: string | null;
}

interface AgencyDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  license_number: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  logo_url: string | null;
  agents: AgencyAgentDto[];
  portfolio_count: number;
  portfolio: PropertyListItem[];
}

interface ApiEnvelope<T> {
  data: T;
}

async function loadAgency(slug: string): Promise<AgencyDto | null> {
  try {
    const res = await apiFetch<ApiEnvelope<AgencyDto>>(
      `/public/agencies/${encodeURIComponent(slug)}`,
    );
    return res.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agency = await loadAgency(slug);
  return {
    title: agency ? `${agency.name} — Agence immobilière` : 'Agence introuvable',
    description: agency?.description ?? undefined,
    openGraph: agency
      ? {
          title: `${agency.name} — Agence immobilière`,
          description: agency.description ?? undefined,
          images: agency.logo_url ? [agency.logo_url] : undefined,
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
  const agency = await loadAgency(slug);
  if (!agency) notFound();

  const eyebrowParts = [
    agency.city,
    `${agency.portfolio_count} bien${agency.portfolio_count > 1 ? 's' : ''}`,
  ].filter(Boolean) as string[];

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
              <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
                {agency.logo_url ? (
                  <Image
                    src={agency.logo_url}
                    alt={agency.name}
                    fill
                    sizes="96px"
                    className="object-cover"
                    priority
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-2xl font-display text-muted-foreground">
                    {getInitials(agency.name)}
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
                  {agency.name}
                </h1>
                {agency.license_number && (
                  <p className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="size-4" aria-hidden />
                    <span>
                      <address className="not-italic inline">
                        Licence n° {agency.license_number}
                      </address>
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {agency.email && (
                <Button size="lg" render={<a href={`mailto:${agency.email}`} />}>
                  <Mail aria-hidden />
                  Envoyer un email
                </Button>
              )}
              {agency.phone && (
                <Button size="lg" variant="outline" render={<a href={`tel:${agency.phone}`} />}>
                  <Phone aria-hidden />
                  Appeler
                </Button>
              )}
              {agency.whatsapp && (
                <Button
                  size="lg"
                  variant="outline"
                  render={
                    <a
                      href={whatsappLink(agency.whatsapp)}
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

          {agency.description && (
            <p className="mt-8 max-w-3xl text-base leading-relaxed text-muted-foreground">
              {agency.description}
            </p>
          )}
        </section>

        {agency.agents.length > 0 && (
          <section>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              L&apos;équipe
            </p>
            <h2 className="mt-2 font-display text-2xl md:text-3xl font-semibold text-foreground">
              {agency.agents.length} agent{agency.agents.length > 1 ? 's' : ''} pour vous accompagner
            </h2>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {agency.agents.map((a) => {
                const Inner = (
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/40">
                    <Avatar size="lg">
                      {a.avatar_url && <AvatarImage src={a.avatar_url} alt={a.full_name} />}
                      <AvatarFallback>{getInitials(a.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{a.full_name}</p>
                      {a.email && (
                        <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                      )}
                    </div>
                  </div>
                );
                return (
                  <li key={a.id}>
                    {a.slug ? (
                      <Link href={`/agents/${a.slug}`} className="block">
                        {Inner}
                      </Link>
                    ) : (
                      Inner
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Portefeuille
          </p>
          <h2 className="mt-2 font-display text-2xl md:text-3xl font-semibold text-foreground">
            Biens à l&apos;affiche
          </h2>

          {agency.portfolio.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-border bg-card p-10 text-center">
              <p className="font-display text-xl text-foreground">
                Pas encore de bien à présenter
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Cette agence prépare ses prochaines annonces — revenez bientôt.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {agency.portfolio.map((p, index) => (
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
