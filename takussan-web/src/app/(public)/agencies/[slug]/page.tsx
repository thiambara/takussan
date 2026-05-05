import { notFound } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PropertyCard } from '@/components/property';
import type { PropertyListItem } from '@/types/property';

interface AgencyAgentDto {
  id: number;
  slug: string | null;
  full_name: string;
  avatar_url: string | null;
}

interface AgencyDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  license_number: string | null;
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
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agency = await loadAgency(slug);
  if (!agency) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-stone-200 bg-white p-6">
        <div className="size-16 shrink-0 overflow-hidden rounded-2xl bg-stone-200">
          {agency.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agency.logo_url} alt={agency.name} className="size-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-stone-900">{agency.name}</h1>
          {agency.license_number && (
            <p className="mt-1 text-xs text-stone-500">N° licence : {agency.license_number}</p>
          )}
          {agency.description && (
            <p className="mt-2 max-w-prose text-sm text-stone-600">{agency.description}</p>
          )}
        </div>
      </header>

      {agency.agents.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-stone-900">Équipe</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {agency.agents.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3"
              >
                <div className="size-10 shrink-0 overflow-hidden rounded-full bg-stone-200">
                  {a.avatar_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatar_url} alt={a.full_name} className="size-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {a.slug ? (
                    <Link href={`/agents/${a.slug}`} className="font-medium text-stone-900 hover:underline">
                      {a.full_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-stone-900">{a.full_name}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Portefeuille</h2>
        {agency.portfolio.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-500">
            Cette agence n&apos;a pas encore de bien public à l&apos;affiche.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {agency.portfolio.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
