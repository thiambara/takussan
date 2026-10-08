import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import { ModerationWorkspace } from '@/components/admin/ModerationWorkspace';
import { PageHeader } from '@/components/console';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-067 — file de modération des avis.
 *
 * TCK-597 (ADR-0043 §1) — ouverte à l'admin d'agence `standard`, plus seulement au super-admin.
 * L'API cloisonne la liste à l'agence du profil actif (`ReviewController::index`) : la page ne
 * filtre rien côté client. Un avis SUR l'agence elle-même est listé mais tranché par la
 * plateforme — l'écran le dit (`platform`).
 */
export default async function ModerationPage() {
  const t = await getTranslations('admin.pages.moderation');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ModerationWorkspace platform={isSuperAdmin(user.roles)} />
    </div>
  );
}
