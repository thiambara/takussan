import { redirect } from 'next/navigation';

/**
 * TCK-2644 (décision famille 4 n° 3a) — `/app/leases/onboarding-pending` est devenu l'onglet « En
 * attente du locataire » de la liste des baux. La route reste parce que des liens déjà envoyés la
 * visent (notification et courriel `AgentTenantInventoryReminderNotification`).
 *
 * La redirection vit dans la PAGE, et c'est sûr ici : le segment n'a plus de `loading.tsx` (il ne
 * rend aucun document), donc aucune frontière de suspension ne la précède et elle rend 307
 * (TCK-426). Le `layout.tsx` garde le personnel avant elle, et reste transparent pour le
 * dictionnaire (`return <>{children}</>`, check-i18n-namespaces).
 */
export default async function Page() {
  redirect('/app/leases?vue=en_attente');
}
