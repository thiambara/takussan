import type { Metadata } from 'next';

import { getMeAction } from '@/app/actions/auth';
import { exigerRessource } from '@/lib/detail/ressource-de-detail';

import { InventoryDetail } from '@/components/inventory/InventoryDetail';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  // TCK-2831 — la sonde du layout (mémoïsée) : une fiche absente garde le titre de l'introuvable.
  await exigerRessource('inventories', (await params).id);
  const t = await getTranslations('dashboard.inventoryDetail');
  return { title: t('metaTitle') };
}

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  await getMeAction();
  const { id } = await params;
  const numericId = Number(id);

  // TCK-442 — la validité de l'identifiant ET l'existence de la ressource sont tranchées par
  // `[id]/layout.tsx`, strictement au-dessus du `loading.tsx` de ce segment : un `notFound()`
  // écrit ici rendrait 200, avec l'écran introuvable affiché quand même. La décision n'a pas
  // changé de nature — un identifiant illisible reste un INTROUVABLE, jamais une panne — elle
  // a changé d'étage, et elle couvre désormais aussi le 404 de l'API.
  //
  // TCK-2648 (AC4) — l'en-tête n'est plus écrit ici : son titre nomme le logement (« État des lieux
  // d'entrée — Appartement F3 · Mermoz »), que seule la réponse de l'API connaît. Le serveur n'avait
  // que l'identifiant, et titrait « État des lieux #25 ».
  return <InventoryDetail id={numericId} />;
}
