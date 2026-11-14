import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { getTranslations } from 'next-intl/server';


import { getToken } from '@/lib/session';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgencyAdmin, isAgent, isSuperAdmin } from '@/lib/roles';
import { ApiError } from '@/lib/api';
import { exigerRessource, lireClientDuRendu } from '@/lib/detail/ressource-de-detail';
import {
  fetchCrmTags,
  fetchCustomerNotes,
  fetchCustomerRelationships,
} from '@/lib/queries/customers';
import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { FicheDuClient } from '@/components/customer-dashboard/fiche/FicheDuClient';

/**
 * TCK-042 — la fiche client. TCK-2589 — résumé, fil et dossier (`FicheDuClient`, maquette `app-clients-fiche` a) ;
 * la lecture est celle de la sonde du layout (`lireClientDuRendu`) : une requête par rendu.
 */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  // TCK-2831 — la sonde du layout (mémoïsée) : une fiche absente garde le titre de l'introuvable.
  await exigerRessource('customers', (await params).id);
  const t = await getTranslations('dashboard.pages.customerDetail');
  return { title: t('metaTitle') };
}

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.

  const { id } = await params;
  const token = await getToken();
  // TCK-426 — NARROWING DE TYPE, PAS UNE DÉCISION. Le `layout.tsx` de ce segment a déjà refusé
  // l'absence de jeton, au-dessus de la frontière de suspension ; et `getMeAction()` redirige
  // vers `/auth/login` bien avant, depuis `(dashboard)/layout.tsx`. Cette branche est donc
  // inatteignable — mais `getToken()` rend `string | null` et le typage exige qu'on le dise.
  // *Ce qu'elle ne fait SURTOUT pas, c'est rediriger : sous un `loading.tsx`, un `redirect()` de
  // page rend 200 + le squelette au lieu du 307.*
  if (!token) return null;
  // TCK-955 — le geste « Afficher » du numéro de pièce. `getMeAction` est mémoïsé par requête : le
  // layout l'a déjà appelé.
  const { roles } = await getMeAction();
  const canRevealIdNumber = isAdmin(roles);
  // P15.01 (TCK-2351) — inviter le client à créer son compte : un geste du personnel de l'agence
  // de la fiche, que l'API juge (`CustomerPolicy::invite`) ; le bailleur ne le voit pas.
  const canInviteToAccount = isAgent(roles) || isAgencyAdmin(roles) || isSuperAdmin(roles);

  const t = await getTranslations('crm.customerDetail');

  const customerId = Number.parseInt(id, 10);
  // TCK-442 — la validité de l'identifiant ET l'existence de la ressource sont tranchées par
  // `[id]/layout.tsx`, strictement au-dessus du `loading.tsx` de ce segment : un `notFound()`
  // écrit ici rendrait 200, avec l'écran introuvable affiché quand même. La décision n'a pas
  // changé de nature — un identifiant illisible reste un INTROUVABLE, jamais une panne — elle
  // a changé d'étage, et elle couvre désormais aussi le 404 de l'API.

  let customer;
  let notes;
  let relationships;
  let crmTagSuggestions: Awaited<ReturnType<typeof fetchCrmTags>> = [];
  try {
    [customer, notes, relationships, crmTagSuggestions] = await Promise.all([
      // TCK-1384 (P138.04) — la lecture que la sonde du layout a déjà faite : une requête par rendu.
      lireClientDuRendu(token, customerId),
      fetchCustomerNotes(token, customerId),
      fetchCustomerRelationships(token, customerId),
      fetchCrmTags(token).catch(() => []),
    ]);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      return (
        <CustomerDetailUnavailable
          title={t('forbidden_title')}
          message={t('forbidden_message')}
          backLabel={t('back_cta')}
        />
      );
    }
    throw e;
  }

  return (
    <FicheDuClient
      customer={customer}
      relationships={relationships}
      suggestionsDEtiquettes={crmTagSuggestions}
      notes={notes}
      peutInviter={canInviteToAccount}
      peutReveler={canRevealIdNumber}
    />
  );
}

/**
 * `CustomerDetailError` était son nom, et il décrivait mal ce qu'il fait : les trois cas qu'il
 * rend — identifiant invalide, 404, 403 — ne sont pas des erreurs à réessayer mais une fiche
 * qu'on ne peut pas ouvrir. C'est un état vide, pas un bloc d'erreur : d'où `EmptyState` et non
 * `ErrorState`, et d'où le nom (TCK-291).
 */
function CustomerDetailUnavailable({
  title,
  message,
  backLabel,
}: {
  readonly title: string;
  readonly message: string;
  readonly backLabel: string;
}) {
  return (
    <>
      {/* Cet état n'avait AUCUN `h1` : son titre en tient lieu, pour les lecteurs d'écran. */}
      <h1 className="sr-only">{title}</h1>
      <EmptyState
        icon={<AlertTriangle className="size-8" aria-hidden="true" />}
        title={title}
        description={message}
        action={
          <Link href="/app/customers" className={buttonVariants()}>
            {backLabel}
          </Link>
        }
      />
    </>
  );
}
