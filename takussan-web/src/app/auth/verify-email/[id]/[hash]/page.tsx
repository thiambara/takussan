import { getToken } from '@/lib/session';
import { apiRequest } from '@/lib/api';
import Link from 'next/link';

type Props = {
  params: Promise<{ id: string; hash: string }>;
  searchParams: Promise<Record<string, string>>;
};

export default async function VerifyEmailHashPage({ params, searchParams }: Props) {
  const { id, hash } = await params;
  const query = await searchParams;
  const token = await getToken();

  let success = false;
  let message = 'Verification failed or link has expired.';

  if (token) {
    try {
      const queryString = new URLSearchParams(query).toString();
      const path = `/api/auth/verify-email/${id}/${hash}${queryString ? `?${queryString}` : ''}`;
      const result = await apiRequest<{ message: string }>(path, { token });
      success = true;
      message = result.message;
    } catch {
      // message stays as default error
    }
  }

  return (
    <div className="bg-white shadow rounded-lg p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Email verification</h1>

      {success ? (
        <>
          <p className="text-green-600 mb-6">{message}</p>
          <Link href="/dashboard" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            Go to dashboard
          </Link>
        </>
      ) : (
        <>
          <p className="text-red-600 mb-6">{message}</p>
          <Link href="/auth/verify-email" className="text-sm text-blue-600 hover:underline">
            Request a new verification email
          </Link>
        </>
      )}
    </div>
  );
}
