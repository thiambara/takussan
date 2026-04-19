'use client';

import { ApiError } from '@/lib/api';
import { register } from '@/lib/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirmation: '',
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      const { token } = await register(form);

      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      router.push('/auth/verify-email');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.data && typeof err.data === 'object' && 'errors' in err.data) {
        setErrors((err.data as { errors: Record<string, string[]> }).errors);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white shadow rounded-lg p-8">
      <h1 className="text-2xl font-bold mb-6 text-center">Create account</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
              First name
            </label>
            <Input
              id="first_name"
              type="text"
              required
              value={form.first_name}
              onChange={update('first_name')}
              className="rounded"
            />
            {errors.first_name?.map((msg) => (
              <p key={msg} className="text-xs text-red-600 mt-1">{msg}</p>
            ))}
          </div>
          <div>
            <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
              Last name
            </label>
            <Input
              id="last_name"
              type="text"
              required
              value={form.last_name}
              onChange={update('last_name')}
              className="rounded"
            />
            {errors.last_name?.map((msg) => (
              <p key={msg} className="text-xs text-red-600 mt-1">{msg}</p>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update('email')}
            className="rounded"
          />
          {errors.email?.map((msg) => (
            <p key={msg} className="text-xs text-red-600 mt-1">{msg}</p>
          ))}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={update('password')}
            className="rounded"
          />
          {errors.password?.map((msg) => (
            <p key={msg} className="text-xs text-red-600 mt-1">{msg}</p>
          ))}
        </div>

        <div>
          <label htmlFor="password_confirmation" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm password
          </label>
          <Input
            id="password_confirmation"
            type="password"
            autoComplete="new-password"
            required
            value={form.password_confirmation}
            onChange={update('password_confirmation')}
            className="rounded"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full rounded h-auto py-2"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
