'use client';

import { resendVerificationEmailAction } from '@/app/actions/auth';
import { useState } from 'react';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [loading, setLoading] = useState(false);

  async function handleResend() {
    setLoading(true);
    setStatus('idle');

    const result = await resendVerificationEmailAction();
    setStatus(result.ok ? 'sent' : 'error');
    setLoading(false);
  }

  return (
    <div className="bg-white shadow rounded-lg p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Verify your email</h1>
      <p className="text-gray-600 text-sm mb-6">
        We&apos;ve sent a verification link to your email address. Please check your inbox and click
        the link to activate your account.
      </p>

      {status === 'sent' && (
        <p className="mb-4 text-sm text-green-600 bg-green-50 p-3 rounded">
          Verification email resent. Please check your inbox.
        </p>
      )}
      {status === 'error' && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">
          Failed to resend. Please try again.
        </p>
      )}

      <button
        onClick={handleResend}
        disabled={loading}
        className="text-sm text-blue-600 hover:underline disabled:opacity-50"
      >
        {loading ? 'Sending…' : 'Resend verification email'}
      </button>
    </div>
  );
}
