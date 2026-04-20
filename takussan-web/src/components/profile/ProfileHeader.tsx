'use client';

import { useState } from 'react';
import type { User, UserRole } from '@/types/user';
import { getPrimaryRole } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateProfileAction } from '@/app/actions/auth';

const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Locataire / Acheteur',
  agent: 'Agent immobilier',
  owner: 'Propriétaire bailleur',
  agency_admin: 'Admin agence',
  super_admin: 'Super administrateur',
  service_provider: 'Prestataire',
};

interface ProfileHeaderProps {
  user: User;
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [bio, setBio] = useState(user.bio ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();
  const primaryRole = getPrimaryRole(user.roles);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append('first_name', firstName);
    fd.append('last_name', lastName);
    fd.append('bio', bio);
    const result = await updateProfileAction(fd);
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? 'Échec de la mise à jour du profil.');
      return;
    }
    setOpen(false);
  }

  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <Avatar className="size-24">
        {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={user.full_name} /> : null}
        <AvatarFallback className="bg-app-topbar text-2xl text-white">{initials}</AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-app-ink">{user.full_name}</h1>
        <p className="text-sm text-app-ink-muted">{user.email}</p>
        {primaryRole ? (
          <span className="inline-block rounded-full bg-app-surface-1 px-3 py-1 text-xs font-semibold text-app-topbar">
            {ROLE_LABELS[primaryRole]}
          </span>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button variant="outline" className="rounded-md">
              Modifier le profil
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le profil</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="first_name" className="text-xs font-semibold text-app-ink-muted">
                Prénom
              </label>
              <Input
                id="first_name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="last_name" className="text-xs font-semibold text-app-ink-muted">
                Nom
              </label>
              <Input
                id="last_name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="bio" className="text-xs font-semibold text-app-ink-muted">
                Bio
              </label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                rows={4}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
