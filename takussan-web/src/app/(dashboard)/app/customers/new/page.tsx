import type { Metadata } from 'next';


import { CustomerForm } from '@/components/customer-form';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.customerNew');
  return { title: t('metaTitle') };
}

/**
 * TCK-042 — ajout d'un client CRM.
 */

export const dynamic = 'force-dynamic';

/** TCK-2581 — `?prenom=&nom=&telephone=` : la fiche d'un visiteur qui n'en avait pas, préremplie depuis sa visite. */
function premier(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim().slice(0, 120) : undefined;
}

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const q = (await searchParams) ?? {};
  const initial = { first_name: premier(q.prenom), last_name: premier(q.nom), phone: premier(q.telephone) };
  const prerempli = Object.values(initial).some(Boolean);
  const t = await getTranslations('dashboard.pages.customerNew');
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.

  return (
    // `max-w-3xl` : sur 1366, des champs de 500 px chacun étiraient la saisie d'un nom sur toute
    // la largeur de l'écran.
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CustomerForm mode="create" initial={prerempli ? initial : undefined} />
    </div>
  );
}
