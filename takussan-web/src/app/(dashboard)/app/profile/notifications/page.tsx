import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NotificationPreferencesMatrix } from '@/components/profile/NotificationPreferencesMatrix';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';
import { personaDuProfil } from '@/lib/profil/persona-du-profil';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.notificationPrefs');
  return { title: t('metaTitle') };
}

/**
 * TCK-2636 — les préférences de notification, par événement. TCK-2635 — une section du profil : son
 * titre au bureau à droite du sommaire, au téléphone l'en-tête de détail et sa flèche unique.
 *
 * TCK-2864 — l'écran ne montre que les événements que la persona de la coque reçoit (catalogue de
 * l'API). Le super-admin (`plateforme`) voit tout : la table de l'API ne lui en attribue presque
 * aucun, et un écran vide ne lui dirait rien de vrai.
 */
export default async function ProfileNotificationsPage() {
  const persona = personaDuProfil(await faitsDuSommaire());
  return (
    <SectionDuProfil section="notifications">
      <NotificationPreferencesMatrix persona={persona === 'plateforme' ? null : persona} />
    </SectionDuProfil>
  );
}
