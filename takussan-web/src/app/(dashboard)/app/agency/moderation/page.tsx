import { getMeAction } from '@/app/actions/auth';
import { isSuperAdmin } from '@/lib/roles';
import { ModerationWorkspace } from '@/components/admin/ModerationWorkspace';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.pages.moderation');
  return { title: t('title') };
}

/**
 * TCK-067 — file de modération des avis.
 *
 * TCK-597 (ADR-0043 §1) — ouverte à l'admin d'agence `standard`, plus seulement au super-admin.
 * L'API cloisonne la liste à l'agence du profil actif (`ReviewController::index`) : la page ne
 * filtre rien côté client. Un avis SUR l'agence elle-même est listé mais tranché par la
 * plateforme — l'écran le dit (`platform`).
 *
 * TCK-2673 — la tête de page (titre, comptes, onglets « Avis · Biens à valider ») est celle de la
 * file, qui connaît ses comptes ; la page lit le nom de l'agence qui signe les réponses publiques.
 */
export default async function ModerationPage() {
  await garderPageAdmin('/app/agency/moderation');
  const user = await getMeAction();
  const token = await getToken();
  // Pour peindre une signature : une agence illisible rend « au nom de votre agence », pas une erreur.
  const agence = token && user.agency_id ? await resolveAgencyOrNull(token, user.agency_id, 'agency/moderation', 'affichage') : null;

  return <ModerationWorkspace platform={isSuperAdmin(user.roles)} agencyName={agence?.name ?? null} />;
}
