import { notFound } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { PropertyCard } from '@/components/property';
import type { PropertyListItem } from '@/types/property';

interface AgentDto {
  id: number;
  slug: string;
  full_name: string;
  email: string | null;
  phone: string | null;
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
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await loadAgent(slug);
  if (!agent) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-stone-200 bg-white p-6">
        <div className="size-16 shrink-0 overflow-hidden rounded-full bg-stone-200">
          {agent.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.avatar_url} alt={agent.full_name} className="size-full object-cover" />
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-stone-900">{agent.full_name}</h1>
          {agent.agency && (
            <p className="mt-1 text-sm text-stone-600">
              Agent chez{' '}
              <Link
                href={`/agencies/${agent.agency.slug}`}
                className="font-medium text-app-accent hover:underline"
              >
                {agent.agency.name}
              </Link>
            </p>
          )}
          <p className="mt-2 text-sm text-stone-500">
            {agent.portfolio_count} bien{agent.portfolio_count > 1 ? 's' : ''} en portefeuille
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {agent.email && (
            <a
              href={`mailto:${agent.email}`}
              className="inline-flex h-9 items-center rounded-full bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800"
            >
              Envoyer un email
            </a>
          )}
          {agent.phone && (
            <a
              href={`tel:${agent.phone}`}
              className="inline-flex h-9 items-center rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              Appeler
            </a>
          )}
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Portefeuille</h2>
        {agent.portfolio.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-500">
            Cet agent n&apos;a pas encore de bien public à l&apos;affiche.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {agent.portfolio.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
