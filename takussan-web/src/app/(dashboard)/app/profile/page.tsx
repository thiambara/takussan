import type { Metadata } from 'next';
import Link from 'next/link';
import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Mon profil' };
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

export default async function ProfilePage() {
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

      <section className="rounded-2xl bg-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Notifications</h2>
            <p className="text-sm text-muted-foreground">
              Choisissez les canaux utilisés pour chaque type d&apos;événement.
            </p>
          </div>
          <Link
            href="/app/profile/notifications"
            className="rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Gérer les préférences
          </Link>
        </div>
      </section>

      {isCustomer(user.roles) && (
        <section className="rounded-2xl bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">Avis</h2>
              <p className="text-sm text-muted-foreground">
                Séjours et baux sur lesquels vous pouvez laisser un avis public.
              </p>
            </div>
            <Link
              href="/app/profile/reviews"
              className="rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Voir mes avis
            </Link>
          </div>
        </section>
      )}
    </ProfileLayout>
  );
}
