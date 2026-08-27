'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

/** La donnée porte la CLÉ de `profile.roles.*` ; le libellé est résolu au rendu. */
const ROLE_KEYS: Record<UserRole, string> = {
  customer: 'customer',
  tenant: 'tenant',
  agent: 'agent',
  owner: 'owner',
  agency_admin: 'agency_admin',
  super_admin: 'super_admin',
  service_provider: 'service_provider',
};

interface ProfileHeaderProps {
  user: User;
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
  const t = useTranslations('profile.header');
  const tRoles = useTranslations('profile.roles');
  const tCommon = useTranslations('common.actions');
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
      setAvatarError(t('invalidImage'));
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError(t('imageTooLarge'));
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
      setError(result.message ?? t('saveError'));
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
        <AvatarFallback className="bg-foreground text-2xl text-primary-foreground">{initials}</AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{currentUser.full_name}</h1>
        <p className="text-sm text-muted-foreground">{currentUser.email}</p>
        {primaryRole ? (
          <span className="inline-block rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground">
            {tRoles(ROLE_KEYS[primaryRole])}
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
              {t('edit')}
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edit')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="avatar" className="text-xs font-semibold text-muted-foreground">
                {t('avatarLabel')}
              </label>
              <Input
                id="avatar"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
              />
              {avatarError ? (
                <p role="alert" className="text-sm text-destructive">
                  {avatarError}
                </p>
              ) : null}
              {dialogAvatarSrc ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarImage src={dialogAvatarSrc} alt={currentUser.full_name} />
                      <AvatarFallback className="bg-foreground text-xs text-primary-foreground">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">
                      {avatar ? avatar.name : t('currentAvatar')}
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
                    {tCommon('delete')}
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="space-y-1">
              <label htmlFor="first_name" className="text-xs font-semibold text-muted-foreground">
                {t('firstName')}
              </label>
              <Input
                id="first_name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="last_name" className="text-xs font-semibold text-muted-foreground">
                {t('lastName')}
              </label>
              <Input
                id="last_name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="bio" className="text-xs font-semibold text-muted-foreground">
                {t('bioLabel')}
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
              <p role="alert" className="text-sm text-destructive">
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
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? t('saving') : tCommon('save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
