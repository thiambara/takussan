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
  const [bio, setBio] = useState(user.bio ?? '');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const verified = Boolean(user.email_verified_at);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);
    const fd = new FormData();
    fd.append('first_name', user.first_name);
    fd.append('last_name', user.last_name);
    fd.append('bio', bio);
    const result = await updateProfileAction(fd);
    setLoading(false);
    setFeedback({
      ok: result.ok,
      message: result.ok
        ? 'Modifications enregistrées.'
        : result.message ?? 'Échec de la mise à jour du profil.',
    });
  }

  return (
    <section className="space-y-4 rounded-2xl bg-app-surface-1 p-6">
      <div>
        <h2 className="text-lg font-bold text-app-ink">Coordonnées</h2>
        <p className="text-sm text-app-ink-muted">Gérez vos informations de contact.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-app-ink-muted">Email</label>
          <div className="flex items-center gap-2">
            <Input value={user.email} disabled className="bg-white/60" />
            <span
              className={
                'rounded-full px-2 py-1 text-xs font-semibold ' +
                (verified
                  ? 'bg-app-surface-3 text-app-topbar'
                  : 'bg-white text-app-accent')
              }
            >
              {verified ? 'Vérifié' : 'Non vérifié'}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="phone" className="text-xs font-semibold text-app-ink-muted">
            Téléphone
          </label>
          <Input
            id="phone"
            value={user.phone ?? ''}
            disabled
            placeholder="+221 77 000 00 00"
            className="bg-white/60"
          />
          <p className="text-xs text-app-ink-muted">Bientôt disponible.</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="contact-bio" className="text-xs font-semibold text-app-ink-muted">
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
          <p className="text-right text-xs text-app-ink-muted">{bio.length}/500</p>
        </div>
        {feedback ? (
          <p
            role={feedback.ok ? 'status' : 'alert'}
            className={
              'text-sm ' +
              (feedback.ok ? 'text-emerald-700' : 'text-red-600')
            }
          >
            {feedback.message}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={loading}>
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </section>
  );
}
