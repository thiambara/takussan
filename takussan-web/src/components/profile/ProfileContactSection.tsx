'use client';

import { useState } from 'react';
import type { User } from '@/types/user';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { updateProfileAction } from '@/app/actions/auth';

interface ProfileContactSectionProps {
  user: User;
}

export function ProfileContactSection({ user }: ProfileContactSectionProps) {
  const [phone, setPhone] = useState(user.phone ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [loading, setLoading] = useState(false);
  const verified = Boolean(user.email_verified_at);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const fd = new FormData();
    fd.append('first_name', user.first_name);
    fd.append('last_name', user.last_name);
    fd.append('phone', phone);
    fd.append('bio', bio);
    await updateProfileAction(fd);
    setLoading(false);
  }

  return (
    <section className="space-y-4 rounded-2xl bg-[#fcf2eb] p-6">
      <div>
        <h2 className="text-lg font-bold text-[#1f1b17]">Coordonnées</h2>
        <p className="text-sm text-[#43474e]">Gérez vos informations de contact.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-[#43474e]">Email</label>
          <div className="flex items-center gap-2">
            <Input value={user.email} disabled className="bg-white/60" />
            <span
              className={
                'rounded-full px-2 py-1 text-xs font-semibold ' +
                (verified
                  ? 'bg-[#eae1da] text-[#022448]'
                  : 'bg-white text-[#7d5630]')
              }
            >
              {verified ? 'Vérifié' : 'Non vérifié'}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="phone" className="text-xs font-semibold text-[#43474e]">
            Téléphone
          </label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+221 77 000 00 00"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="contact-bio" className="text-xs font-semibold text-[#43474e]">
            Bio
          </label>
          <Textarea
            id="contact-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Parlez-nous un peu de vous..."
          />
          <p className="text-right text-xs text-[#43474e]">{bio.length}/500</p>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={loading}>
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </section>
  );
}
