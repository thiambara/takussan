/**
 * TCK-626 — où mène une invitation acceptée : l'assistant du profil qu'elle vient d'activer.
 *
 * ⚠ Le paramètre (`?owner=`, `?agent=`, `?sp=`) n'est pas un confort : l'acceptation a déjà passé
 * le profil à `active`, et sans lui les assistants cherchent un profil encore en `draft` ou
 * `pending` (`lib/onboarding-reprise.ts`), n'en trouvent pas, et renvoient à `/app` — l'invité
 * n'aurait jamais vu son assistant.
 */
export function destinationDInvitation(role: string, invitableId: number | null): string {
  const avec = (chemin: string, cle: string) =>
    invitableId === null ? chemin : `${chemin}?${cle}=${invitableId}`;
  switch (role) {
    case 'owner':
      return avec('/onboarding/owner', 'owner');
    case 'agent':
    case 'agent_senior':
    case 'agent_manager':
    // TCK-2365 (P242.01) — l'administrateur invité est aussi agent : l'invitation cible son profil
    // d'agent, que l'assistant d'agent complète.
    case 'agency_admin':
      return avec('/onboarding/agent', 'agent');
    case 'service_provider':
      return avec('/onboarding/service-provider', 'sp');
    case 'super_admin':
      return '/onboarding/super-admin';
    default:
      return '/app';
  }
}
