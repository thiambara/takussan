import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { TeamConsole } from '@/components/admin/TeamConsole';
import { InviteMemberButton } from '@/components/admin/InviteMemberButton';
import { EmptyState } from '@/components/feedback';
import { PageHeader } from '@/components/console';
import { buttonVariants } from '@/components/ui/button';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';

/**
 * TCK-277 — unified team console (fusion of TCK-065 `/admin/team` and
 * TCK-133 `/admin/users`). Single screen with segmented tabs for the
 * different role typologies plus a single «&nbsp;Inviter&nbsp;» CTA.
 *
 * Super-admins without an `agency_id` see a stub directing them to pick
 * an agency from the dedicated section. Hosts on `kind=individual` are
 * bounced to `/app` by `ensureStandardAgencyOrRedirect`.
 */
export default async function TeamPage() {
  const tPage = await getTranslations('admin.pages.team');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);

  if (!user.agency_id) {
    const t = await getTranslations('team.page');
    return (
      <div className="space-y-6">
        <PageHeader title={tPage('shortTitle')} description={tPage('shortSubtitle')} />
        <EmptyState
          icon={<Building2 className="size-8" aria-hidden="true" />}
          title={t('no_agency_title')}
          description={t('no_agency_description')}
          action={
            <Link href="/admin/agency" className={buttonVariants()}>
              {t('no_agency_cta')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={tPage('title')}
        description={tPage('subtitle')}
        actions={<InviteMemberButton agencyId={user.agency_id} />}
      />
      <TeamConsole agencyId={user.agency_id} currentUserId={user.id} />
    </div>
  );
}
