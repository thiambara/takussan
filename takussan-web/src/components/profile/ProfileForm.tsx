'use client';

import { updateProfileAction } from '@/app/actions/auth';
import { useState } from 'react';

type Props = {
  initialFirstName: string;
  initialLastName: string;
  initialBio: string;
};

export default function ProfileForm({ initialFirstName, initialLastName, initialBio }: Props) {
  const [form, setForm] = useState({
    first_name: initialFirstName,
    last_name: initialLastName,
    bio: initialBio,
  });
  const [avatar, setAvatar] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus('idle');

    const formData = new FormData();
    formData.append('first_name', form.first_name);
    formData.append('last_name', form.last_name);
    formData.append('bio', form.bio);
    if (avatar) formData.append('avatar', avatar);

    const result = await updateProfileAction(formData);
    setStatus(result.ok ? 'saved' : 'error');
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-4">
      {status === 'saved' && (
        <p className="text-sm text-green-600 bg-green-50 p-3 rounded">Profile updated successfully.</p>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded">Failed to update profile.</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
            First name
          </label>
          <input
            id="first_name"
            type="text"
            required
            value={form.first_name}
            onChange={update('first_name')}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
            Last name
          </label>
          <input
            id="last_name"
            type="text"
            required
            value={form.last_name}
            onChange={update('last_name')}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="avatar" className="block text-sm font-medium text-gray-700 mb-1">
          Avatar
        </label>
        <input
          id="avatar"
          type="file"
          accept="image/*"
          onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      <div>
        <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
        <textarea
          id="bio"
          rows={4}
          value={form.bio}
          onChange={update('bio')}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Tell us about yourself…"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
