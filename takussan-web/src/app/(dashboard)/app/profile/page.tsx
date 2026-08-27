import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getMeAction } from '@/app/actions/auth';

import { isAgent, isOwner, isCustomer, isAdmin } from '@/lib/roles';
import { ProfileLayout } from '@/components/profile/ProfileLayout';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileContactSection } from '@/components/profile/ProfileContactSection';
import { ProfileCustomerSection } from '@/components/profile/ProfileCustomerSection';
import { ProfileAgentSection } from '@/components/profile/ProfileAgentSection';
import { ProfileOwnerSection } from '@/components/profile/ProfileOwnerSection';
import { ProfileAdminSection } from '@/components/profile/ProfileAdminSection';
import { ProfileSecuritySection } from '@/components/profile/ProfileSecuritySection';
import { MyProfilesSection } from '@/components/profile/MyProfilesSection';
// `buttonVariants()` sur un `<Link>`, et non le wrapper polymorphe de shadcn/Radix que le ticket
// prescrivait : ce dépôt n'a aucune dépendance Radix, cette API n'existe pas ici.
import { buttonVariants } from '@/components/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.profile');
  return { title: t('metaTitle') };
}

export default async function ProfilePage() {
  const t = await getTranslations('dashboard.profile');
  const user = await getMeAction();
  return (
    <ProfileLayout>
      <ProfileHeader user={user} />
      <ProfileContactSection user={user} />
      <MyProfilesSection />
      {isCustomer(user.roles) && <ProfileCustomerSection user={user} />}
      {isAgent(user.roles) && <ProfileAgentSection user={user} />}
      {isOwner(user.roles) && <ProfileOwnerSection user={user} />}
      {isAdmin(user.roles) && <ProfileAdminSection user={user} />}
      <ProfileSecuritySection />

      {/*
        TCK-379 — `/app/account/privacy` (portabilité RGPD) n'avait AUCUN lien entrant dans tout
        le front : ni la barre latérale, ni le menu utilisateur, ni cette page. L'écran existait,
        il était injoignable. Il est posé ici et pas ailleurs parce que l'export de ses données
        est le PENDANT de la suppression de compte, qui vit dans `ProfileSecuritySection`
        juste au-dessus : les deux droits RGPD se lisent au même endroit.
      */}
      <section className="rounded-2xl bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t('privacy')}</h2>
            <p className="text-sm text-muted-foreground">{t('privacyBody')}</p>
          </div>
          <Link
            href="/app/account/privacy"
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('managePrivacy')}
          </Link>
        </div>
      </section>

      <section className="rounded-2xl bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t('notifications')}</h2>
            <p className="text-sm text-muted-foreground">{t('notificationsBody')}</p>
          </div>
          <Link
            href="/app/profile/notifications"
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('managePrefs')}
          </Link>
        </div>
      </section>

      {isCustomer(user.roles) && (
        <section className="rounded-2xl bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('reviews')}</h2>
              <p className="text-sm text-muted-foreground">{t('reviewsBody')}</p>
            </div>
            <Link
              href="/app/profile/reviews"
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('seeReviews')}
            </Link>
          </div>
        </section>
      )}
    </ProfileLayout>
  );
}
