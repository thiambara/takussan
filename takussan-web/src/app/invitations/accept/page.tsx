/**
 * TCK-626 — `/invitations/accept?token=…`, la page que l'e-mail et le SMS d'invitation ouvrent.
 *
 * Elle n'existait pas : le lien (`InvitationMailable`) menait à une 404, et l'acceptation
 * (`POST /api/invitations/{token}/accept`, publique depuis TCK-249) n'avait aucun appelant.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { getToken } from '@/lib/session';

import { AccepterInvitation } from './AccepterInvitation';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('invitationAccept');
  return { title: t('metaTitle') };
}

export default async function PageAccepterInvitation({
  searchParams,
}: {
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations('invitationAccept');
  const { token: jeton } = await searchParams;
  const connecte = Boolean(await getToken());

  if (!jeton) {
    return (
      <OnboardingShell title={t('title')}>
        <p role="alert" className="text-sm text-destructive">{t('missingToken')}</p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell title={t('title')} subtitle={connecte ? t('subtitleSignedIn') : t('subtitleSignedOut')}>
      <AccepterInvitation jeton={jeton} connecte={connecte} />
    </OnboardingShell>
  );
}
