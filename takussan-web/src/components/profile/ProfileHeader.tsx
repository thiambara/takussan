'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { User, UserRole } from '@/types/user';
import { getPrimaryRole } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, ChevronRight } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
import { useAuth } from '@/context/AuthContext';
import { reduirePhotoSousPlafond } from '@/lib/reduire-photo';
import { initialesDe, libelleDe } from '@/lib/identite';

/** La donnée porte la CLÉ de `profile.roles.*` ; le libellé est résolu au rendu. */
/** `max:2048` d'`UpdateProfileRequest`. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

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
  /**
   * TCK-2635 — ce que la personne est, et où (« Agent · Dakar Immo ») : lu des profils par la page.
   * Absent : le rôle principal du compte.
   */
  readonly fonction?: string | null;
  /** Le chemin de SA fiche publique (`/agents/{slug}`), quand elle existe. */
  readonly fiche?: string | null;
}

export function ProfileHeader({ user, fonction, fiche }: ProfileHeaderProps) {
  const t = useTranslations('profile.header');
  const tRoles = useTranslations('profile.roles');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common.actions');
  const router = useRouter();
  const { user: contextUser, setUser } = useAuth();
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

  // TCK-623 — un compte ouvert par téléphone n'a pas encore de nom.
  const initials = initialesDe(currentUser) ?? '';
  const libelle = libelleDe(currentUser) ?? tNav('accountFallback');
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

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0] ?? null;
    setAvatarError(null);

    if (!file) {
      setAvatar(null);
      setAvatarPreview(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setAvatarError(t('invalidImage'));
      input.value = '';
      return;
    }

    // TCK-1887 (P195.03) — réduite AVANT de juger la taille, comme `MediaDropzone` (TCK-596) :
    // une photo de téléphone de 5 Mo qui tombe sous les 2 Mo de l'API n'a pas à être refusée.
    const reduit = await reduirePhotoSousPlafond(file, AVATAR_MAX_BYTES);
    if (reduit.size > AVATAR_MAX_BYTES) {
      setAvatarError(t('imageTooLarge'));
      input.value = '';
      return;
    }

    setAvatar(reduit);
    setRemoveAvatar(false);
    setAvatarPreview(URL.createObjectURL(reduit));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append('first_name', firstName);
    fd.append('last_name', lastName);
    fd.append('bio', bio);
    // Déjà réduit dans le navigateur au choix (TCK-542, TCK-1887).
    if (avatar) fd.append('avatar', avatar);
    if (removeAvatar) fd.append('avatar_remove', '1');
    const result = await updateProfileAction(fd);
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? t('saveError'));
      return;
    }
    setCurrentUser(result.user);
    // TCK-2046 (P202.06) — comme `EtapePrenom` : la `Navbar` publique lit le nom et la photo dans
    // le contexte, que `router.refresh()` ne change pas.
    if (contextUser) setUser({ ...contextUser, ...result.user });
    setAvatar(null);
    setAvatarPreview(null);
    setRemoveAvatar(false);
    setOpen(false);
    router.refresh();
  }

  const ligne = fonction ?? (primaryRole ? tRoles(ROLE_KEYS[primaryRole]) : null);
  const courriel = currentUser.email && currentUser.email !== libelle ? currentUser.email : null;

  // TCK-2635 — l'identité du sommaire (maquette `app-profil`, `IdentiteMobile` et la carte de
  // `ASommaireBureau`) : la photo et son badge « appareil photo », qui ouvre « Modifier le profil »
  // (photo, prénom, nom, bio) ; le nom ; « Agent · Dakar Immo » (au bureau, suivi du courriel) ;
  // « Voir ma fiche publique », en lien au téléphone, en bouton au bureau.
  return (
    <section
      data-slot="identite-du-profil"
      className="flex items-center gap-4 md:gap-5 md:rounded-2xl md:border md:border-border md:bg-card md:p-5"
    >
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) resetDraft();
          setOpen(nextOpen);
        }}
      >
        <span className="relative flex-none">
          <Avatar className="size-16 lg:size-20">
            {currentUser.avatar_url ? <AvatarImage src={currentUser.avatar_url} alt={libelle} /> : null}
            <AvatarFallback className="text-2xl lg:text-3xl">{initials}</AvatarFallback>
          </Avatar>
          <DialogTrigger
            render={
              <button
                type="button"
                aria-label={t('edit')}
                className="absolute -right-1 -bottom-1 inline-flex size-7 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-background outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                <Camera className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              </button>
            }
          />
        </span>
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
      <div className="min-w-0 flex-1">
        {/* TCK-2635 — `h2` : le titre de la page est « Profil » (bureau) ou celui de l'en-tête (téléphone). */}
        <h2 className="truncate font-display text-xl font-semibold tracking-titre text-foreground">{libelle}</h2>
        {ligne || courriel ? (
          <p className="text-sm text-muted-foreground max-md:truncate md:break-words">
            {ligne}
            {courriel ? (
              <span className="max-md:hidden">
                {ligne ? ' · ' : null}
                {courriel}
              </span>
            ) : null}
          </p>
        ) : null}
        {fiche ? (
          <a href={fiche} className="mt-1 inline-flex items-center text-sm font-medium text-primary md:hidden">
            {t('voirMaFiche')}
            <ChevronRight className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {fiche ? (
        <a href={fiche} className={cn(buttonVariants({ variant: 'outline' }), 'max-md:hidden')}>
          {t('voirMaFiche')}
        </a>
      ) : null}
    </section>
  );
}
