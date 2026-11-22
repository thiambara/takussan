import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { PaymentsTabs } from '@/components/payments/PaymentsTabs';
import { CustomerPayments } from '@/components/payments/CustomerPayments';
import { LoyersDuBailleur } from '@/components/payments/bailleur/LoyersDuBailleur';
import { resoudrePersona, typeDuProfilActif } from '@/lib/navigation/personas';
import type { User } from '@/types/user';
import { isAgencyAdmin, isCustomerOnly, isOwner } from '@/lib/roles';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';
import { aiguillerVersLArgent } from '@/lib/access/pages-admin-server';
import type { ParametresDeLaPage } from '@/lib/finances/depuis-les-paiements';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.payments');
  // TCK-2651 — l'onglet du navigateur dit le mot de la page : « Loyers » pour le bailleur (ADR-0100 § 3).
  return { title: estLaPersonaBailleur(await getMeAction()) ? t('ownerMetaTitle') : t('metaTitle') };
}

/**
 * TCK-2651 — la persona `bailleur` de la coque (`resoudrePersona`, sur le PROFIL ACTIF lié, jamais
 * l'union des rôles : un agent aussi bailleur garde ses onglets). Un compte qui porte `agency_admin`
 * n'arrive ici que pour une agence `individual` ou illisible — l'admin d'une agence standard est déjà
 * mené à « Argent » (`aiguillerVersLArgent`, TCK-2677/2749) : il reste l'hôte, qui garde l'écran
 * d'aujourd'hui (ADR-0100 § 5).
 *
 * SANS ATTENTE : le profil actif est celui que `/api/auth/me` a déjà résolu (`active_profile_id`), le
 * cookie lui étant transmis en `X-Active-Profile-Hint` par toute lecture serveur. Lire le cookie ici
 * (`await getActiveProfileId()`) ferait perdre à la page son exemption de repli (TCK-2677,
 * `etats-de-route.test.ts`) : elle aiguille l'admin d'agence par un 307, sous aucun `loading.tsx`.
 */
function estLaPersonaBailleur(user: User): boolean {
  if (isCustomerOnly(user.roles) || !isOwner(user.roles)) return false;
  const typeProfilActif = typeDuProfilActif(user.active_profile_id ?? null);
  return resoudrePersona({ roles: user.roles, typeProfilActif, agenceIndividuelle: isAgencyAdmin(user.roles) }) === 'bailleur';
}

/**
 * TCK-063 — page principale des paiements. Expose 3 onglets :
 *   - Historique (vue unifiée booking_payments + lease_payments)
 *   - Factures (CRUD + transitions de statut)
 *   - Payouts (reversements bailleurs)
 *
 * Filtres persistés en URL via `useSearchParams`. L'auth est vérifiée côté
 * serveur avant rendu pour cohérence avec les autres pages dashboard.
 *
 * TCK-593 — le client (locataire, acheteur) ne reçoit PAS ces onglets : `CustomerPayments` lui
 * montre ce qu'il doit, « Payer », et son historique en lecture seule — sans « reversements ».
 *
 * TCK-2677 (ADR-0100 § 4 et § 7) — l'admin de l'agence active (standard) n'a qu'une page pour
 * l'argent de l'agence : « Argent ». Un lien ancien, une notification (`?tab=payouts`,
 * `?tab=approvals`, `?tab=bills`) ou un favori l'y mène, sur l'onglet qui correspond, filtres de
 * l'historique compris (`adresseDeLArgent`) — l'admin qui est aussi bailleur compris, dont le relevé
 * de gérance est au registre « Reversements » (TCK-2749). L'agent, l'hôte, le bailleur, le locataire
 * et le client restent ici (`aiguillerVersLArgent`, `menerALArgent`) ; `/app/payments/return` n'est
 * pas concerné.
 *
 * TCK-2651 (ADR-0100 § 2, § 3 et § 5) — la persona `bailleur` (`estLaPersonaBailleur`) reçoit « Loyers »
 * (`LoyersDuBailleur`), qui porte son propre en-tête. L'hôte garde l'écran d'aujourd'hui (§ 5).
 *
 * ⚠ La redirection se décide DANS la page et n'est sous AUCUN `loading.tsx` : un repli dans ce
 * segment (il y en avait un) change son 307 en 200 : le squelette part, puis le navigateur rebondit
 * (`app/__tests__/etats-de-route.test.ts`). Un layout ne lit pas `searchParams` : il ne saurait pas
 * traduire l'onglet.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { readonly searchParams: Promise<ParametresDeLaPage> }) {
  const user = await getMeAction();
  await aiguillerVersLArgent(user, searchParams);

  const t = await getTranslations('dashboard.pages.payments');
  const client = isCustomerOnly(user.roles);
  if (estLaPersonaBailleur(user)) {
    return <LoyersDuBailleur />;
  }

  return (
    <div className="space-y-6">
      {/* TCK-2650 — au téléphone, le locataire ouvre sur ce qu'il doit (maquette `app-paiements`) : la barre du haut porte déjà « Paiements », l'en-tête n'y reste que pour les lecteurs d'écran. */}
      <PageHeader title={t('title')} description={client ? t('customerSubtitle') : t('subtitle')} className={client ? 'max-lg:sr-only' : undefined} />
      {client ? <CustomerPayments /> : <PaymentsTabs />}
    </div>
  );
}
