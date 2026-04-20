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
    </ProfileLayout>
  );
}
