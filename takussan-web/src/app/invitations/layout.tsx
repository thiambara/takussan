import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * TCK-626 — frontière de dictionnaire du sous-arbre `/invitations`, sur le modèle de `/publish`.
 *
 * Sans elle, la page d'acceptation relevait du provider RACINE : `invitationAccept` et
 * `onboarding` (par `OnboardingShell`) auraient été servis à toutes les pages du produit, pour un
 * écran de passage. Ce fichier n'ajoute aucune chrome.
 */
/**
 * TCK-907 (P31.07) — le modèle de titre commun aux autres groupes (`(public)`, `(auth)`,
 * `(dashboard)`) : sans lui, l'onglet de `/invitations/accept` portait « Accepter une invitation »
 * seul, sans « — Takussan ».
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.home');
  return { title: { template: '%s — Takussan', default: t('title') } };
}

export default async function InvitationsLayout({ children }: { children: ReactNode }) {
  return <IntlProvider messages={await messagesPour('invitations')}>{children}</IntlProvider>;
}
