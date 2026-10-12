import { getMeAction } from '@/app/actions/auth';
import { isSuperAdmin } from '@/lib/roles';
import { ModerationWorkspace } from '@/components/admin/ModerationWorkspace';
import { PageHeader } from '@/components/console';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
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
  await garderPageAdmin('/admin/moderation');
  const t = await getTranslations('admin.pages.moderation');
  const user = await getMeAction();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ModerationWorkspace platform={isSuperAdmin(user.roles)} />
    </div>
  );
}
