import { getMeAction, logoutAction } from '@/app/actions/auth';
import ProfileForm from '@/components/profile/ProfileForm';

export default async function ProfilePage() {
  const user = await getMeAction();

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">My profile</h1>
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-sm text-red-600 hover:underline"
          >
            Sign out
          </button>
        </form>
      </div>

      <ProfileForm
        initialFirstName={user.first_name}
        initialLastName={user.last_name}
        initialBio={user.bio ?? ''}
      />
    </div>
  );
}
