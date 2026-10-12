'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { accepterInvitationAction } from '@/app/actions/invitations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useCurrentLocale } from '@/i18n/hooks';
import { isTwoFactorChallenge, login } from '@/lib/auth';
import { destinationDInvitation } from '@/lib/invitation-destination';
import { avecRedirection } from '@/lib/redirection-interne';

/**
 * TCK-626 — accepter une invitation, connecté ou non.
 *
 * - **Connecté** : un bouton. Le compte courant est rattaché à l'invitation.
 * - **Déconnecté** : prénom, nom, mot de passe — le compte naît de l'invitation, puis la session
 *   s'ouvre avec ce mot de passe. « J'ai déjà un compte » passe par la connexion, qui ramène ici.
 *
 * Dans les deux cas, on finit dans l'assistant du profil que l'invitation active.
 */
export function AccepterInvitation({ jeton, connecte }: { readonly jeton: string; readonly connecte: boolean }) {
  const t = useTranslations('invitationAccept');
  const router = useRouter();
  const locale = useCurrentLocale();
  const { openSession } = useAuth();
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [aConnecter, setAConnecter] = useState(false);
  const [enCours, demarrer] = useTransition();

  const ici = `/invitations/accept?token=${encodeURIComponent(jeton)}`;
  const lienConnexion = avecRedirection('/auth/login', ici);

  function accepter(champs?: { first_name: string; last_name: string; password: string }) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await accepterInvitationAction(jeton, champs);
      if (!resultat.ok) {
        setErreur(resultat.message);
        setAConnecter(resultat.seConnecter);
        return;
      }
      const destination = destinationDInvitation(resultat.invitation.role, resultat.invitation.invitable_id);
      if (connecte) {
        router.push(destination);
        return;
      }
      // Le compte vient de naître avec ce mot de passe : on ouvre la session. Une invitation par
      // SMS ne porte pas d'e-mail — la connexion par téléphone prend le relais.
      const email = resultat.invitation.email;
      if (email && champs) {
        try {
          const session = await login({ email, password: champs.password }, locale);
          if (!isTwoFactorChallenge(session)) {
            await openSession(session.token, session.user, session.expires_at);
            router.push(destination);
            return;
          }
        } catch {
          // la connexion explicite ci-dessous reste possible
        }
      }
      router.push(avecRedirection('/auth/login', destination));
    });
  }

  function envoyer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (prenom.trim() === '' || motDePasse === '') {
      setErreur(t('required'));
      return;
    }
    accepter({ first_name: prenom.trim(), last_name: nom.trim(), password: motDePasse });
  }

  const alerte = erreur ? (
    <div role="alert" className="flex flex-col gap-1 text-sm text-destructive">
      <p>{erreur}</p>
      {aConnecter ? (
        <Link href={lienConnexion} className="font-medium text-primary underline-offset-4 hover:underline">
          {t('signIn')}
        </Link>
      ) : null}
    </div>
  ) : null;

  if (connecte) {
    return (
      <div className="flex flex-col gap-4">
        {alerte}
        <Button type="button" size="lg" className="h-11 px-6 sm:self-start" disabled={enCours} onClick={() => accepter()}>
          {enCours ? t('accepting') : t('accept')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={envoyer} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invitation-prenom">{t('firstName')}</Label>
          <Input id="invitation-prenom" autoComplete="given-name" maxLength={100} value={prenom}
            onChange={(e) => setPrenom(e.target.value)} disabled={enCours} className="h-11" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invitation-nom">{t('lastName')}</Label>
          <Input id="invitation-nom" autoComplete="family-name" maxLength={100} value={nom}
            onChange={(e) => setNom(e.target.value)} disabled={enCours} className="h-11" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invitation-mot-de-passe">{t('password')}</Label>
        <Input id="invitation-mot-de-passe" type="password" autoComplete="new-password" maxLength={72}
          value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} disabled={enCours}
          aria-describedby="invitation-mot-de-passe-aide" className="h-11" />
        <p id="invitation-mot-de-passe-aide" className="text-xs text-muted-foreground">{t('passwordHint')}</p>
      </div>
      {alerte}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-6">
        <Button type="submit" size="lg" className="h-11 px-6" disabled={enCours}>
          {enCours ? t('accepting') : t('create')}
        </Button>
        <Link href={lienConnexion}
          className="flex min-h-11 items-center justify-center rounded-lg px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t('haveAccount')}
        </Link>
      </div>
    </form>
  );
}
