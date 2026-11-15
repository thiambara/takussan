import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ProfileReviewsList } from '@/components/profile/ProfileReviewsList';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';
import { faitsDuSommaire } from '@/lib/profil/faits-du-sommaire';
import { noteDeLaFiche } from '@/lib/profil/note-de-la-fiche';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.profileReviews');
  return { title: t('metaTitle') };
}

/** TCK-2635 — « Mes avis », une section du profil (l'adresse d'avant le ticket l'ouvre), en trois onglets. */
export default async function ProfileReviewsPage() {
  const faits = await faitsDuSommaire();
  // AC5 — la note de l'agent est celle de sa fiche publique, lue par la même requête qu'elle.
  const note = await noteDeLaFiche(faits, await getLocale());
  return (
    <SectionDuProfil section="avis">
      <ProfileReviewsList roles={faits.user.roles} note={note} />
    </SectionDuProfil>
  );
}
