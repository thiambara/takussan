'use client';

import { ApiError } from '@/lib/api';
import { login } from '@/lib/auth';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get('redirect') ?? '/dashboard';
  const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError('');
    setLoading(true);

    try {
      const { token } = await login({ email, password });

      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      router.push(redirectTo);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422 && err.data && typeof err.data === 'object' && 'errors' in err.data) {
          setErrors((err.data as { errors: Record<string, string[]> }).errors);
        } else {
          setGlobalError((err.data as { message?: string })?.message ?? 'Login failed.');
        }
      } else {
        setGlobalError('An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white shadow rounded-lg p-8">
      <h1 className="text-2xl font-bold mb-6 text-center">Sign in</h1>

      {globalError && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{globalError}</p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.email?.map((msg) => (
            <p key={msg} className="text-xs text-red-600 mt-1">{msg}</p>
          ))}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.password?.map((msg) => (
            <p key={msg} className="text-xs text-red-600 mt-1">{msg}</p>
          ))}
        </div>

        <div className="text-right">
          <Link href="/auth/forgot-password" className="text-sm text-blue-600 hover:underline">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600">
        No account?{' '}
        <Link href="/auth/register" className="text-blue-600 hover:underline">
          Register
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
