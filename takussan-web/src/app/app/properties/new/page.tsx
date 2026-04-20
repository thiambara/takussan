import { getMeAction } from '@/app/actions/auth';
import { StubPlaceholder } from '@/components/shared/StubPlaceholder';

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1f1b17]">Publier un bien</h1>
        <p className="mt-1 text-sm text-[#43474e]">Ajoutez un nouveau bien</p>
      </div>
      <StubPlaceholder label="Publier un bien" />
    </div>
  );
}
