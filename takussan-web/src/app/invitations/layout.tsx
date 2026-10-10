import type { ReactNode } from 'react';

import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * TCK-626 — frontière de dictionnaire du sous-arbre `/invitations`, sur le modèle de `/publish`.
 *
 * Sans elle, la page d'acceptation relevait du provider RACINE : `invitationAccept` et
 * `onboarding` (par `OnboardingShell`) auraient été servis à toutes les pages du produit, pour un
 * écran de passage. Ce fichier n'ajoute aucune chrome.
 */
export default async function InvitationsLayout({ children }: { children: ReactNode }) {
  return <IntlProvider messages={await messagesPour('invitations')}>{children}</IntlProvider>;
}
