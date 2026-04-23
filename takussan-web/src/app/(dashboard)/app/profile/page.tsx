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

export default async function ProfilePage() {
  const user = await getMeAction();
  return (
    <ProfileLayout>
      <ProfileHeader user={user} />
      <ProfileContactSection user={user} />
      {isCustomer(user.roles) && <ProfileCustomerSection user={user} />}
      {isAgent(user.roles) && <ProfileAgentSection user={user} />}
      {isOwner(user.roles) && <ProfileOwnerSection user={user} />}
      {isAdmin(user.roles) && <ProfileAdminSection user={user} />}
      <ProfileSecuritySection />

      <section className="rounded-2xl bg-app-surface-1 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-app-ink">Notifications</h2>
            <p className="text-sm text-app-ink-muted">
              Choisissez les canaux utilisés pour chaque type d&apos;événement.
            </p>
          </div>
          <Link
            href="/app/profile/notifications"
            className="rounded-md border border-app-surface-3 bg-white px-3 py-2 text-sm font-semibold text-app-ink hover:bg-app-surface-3"
          >
            Gérer les préférences
          </Link>
        </div>
      </section>
    </ProfileLayout>
  );
}
