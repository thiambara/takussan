import { getMeAction } from '@/app/actions/auth';
import { StubPlaceholder } from '@/components/shared/StubPlaceholder';

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1f1b17]">Finances</h1>
        <p className="mt-1 text-sm text-[#43474e]">Vue comptable de l&apos;agence</p>
      </div>
      <StubPlaceholder label="Finances" />
    </div>
  );
}
