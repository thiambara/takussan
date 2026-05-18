import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Ajouter un client' };
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { CustomerForm } from '@/components/customer-form';

/**
 * TCK-042 — ajout d'un client CRM.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getMeAction();
  if (!(isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles))) {
    forbidden();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Ajouter un client</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Indiquez au minimum un prénom et un nom. Un contact peut exister sans
          compte utilisateur.
        </p>
      </header>
      <CustomerForm mode="create" />
    </div>
  );
}
