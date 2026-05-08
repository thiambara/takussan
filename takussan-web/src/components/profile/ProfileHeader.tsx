'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  tenant: 'Locataire',
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
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(user);
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [bio, setBio] = useState(user.bio ?? '');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const initials =
    `${currentUser.first_name[0] ?? ''}${currentUser.last_name[0] ?? ''}`.toUpperCase();
  const primaryRole = getPrimaryRole(currentUser.roles);
  const dialogAvatarSrc =
    avatarPreview ?? (removeAvatar ? null : currentUser.avatar_url);

  function resetDraft() {
    setFirstName(currentUser.first_name);
    setLastName(currentUser.last_name);
    setBio(currentUser.bio ?? '');
    setAvatar(null);
    setAvatarPreview(null);
    setRemoveAvatar(false);
    setError(null);
    setAvatarError(null);
  }

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setAvatarError(null);

    if (!file) {
      setAvatar(null);
      setAvatarPreview(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setAvatarError('Le fichier doit être une image valide.');
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('L’image ne doit pas dépasser 2 Mo.');
      event.target.value = '';
      return;
    }

    setAvatar(file);
    setRemoveAvatar(false);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append('first_name', firstName);
    fd.append('last_name', lastName);
    fd.append('bio', bio);
    if (avatar) fd.append('avatar', avatar);
    if (removeAvatar) fd.append('avatar_remove', '1');
    const result = await updateProfileAction(fd);
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? 'Échec de la mise à jour du profil.');
      return;
    }
    setCurrentUser(result.user);
    setAvatar(null);
    setAvatarPreview(null);
    setRemoveAvatar(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <Avatar className="size-24">
        {currentUser.avatar_url ? (
          <AvatarImage src={currentUser.avatar_url} alt={currentUser.full_name} />
        ) : null}
        <AvatarFallback className="bg-app-topbar text-2xl text-white">{initials}</AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-app-ink">{currentUser.full_name}</h1>
        <p className="text-sm text-app-ink-muted">{currentUser.email}</p>
        {primaryRole ? (
          <span className="inline-block rounded-full bg-app-surface-1 px-3 py-1 text-xs font-semibold text-app-topbar">
            {ROLE_LABELS[primaryRole]}
          </span>
        ) : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) resetDraft();
          setOpen(nextOpen);
        }}
      >
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
              <label htmlFor="avatar" className="text-xs font-semibold text-app-ink-muted">
                Avatar
              </label>
              <Input
                id="avatar"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
              />
              {avatarError ? (
                <p role="alert" className="text-sm text-red-600">
                  {avatarError}
                </p>
              ) : null}
              {dialogAvatarSrc ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-app-surface-3 p-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarImage src={dialogAvatarSrc} alt={currentUser.full_name} />
                      <AvatarFallback className="bg-app-topbar text-xs text-white">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-app-ink-muted">
                      {avatar ? avatar.name : 'Avatar actuel'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAvatar(null);
                      setAvatarPreview(null);
                      setRemoveAvatar(true);
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              ) : null}
            </div>
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
                onClick={() => {
                  resetDraft();
                  setOpen(false);
                }}
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
