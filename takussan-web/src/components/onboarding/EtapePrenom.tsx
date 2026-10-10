'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { updateProfileAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

/**
 * TCK-624 — le prénom, demandé une fois, à la porte de sortie de l'authentification.
 *
 * Un compte ouvert par téléphone ou par OAuth naît sans nom (TCK-623) : rien ne le lui demandait,
 * et ses annonces, ses messages, la navbar n'avaient rien à écrire. Le prénom est exigé — c'est
 * lui qu'on lit partout —, le nom est facultatif : on ne bloque pas une entrée sur ce qu'on ne lit
 * presque jamais.
 *
 * Une fois enregistré, la page se recharge côté serveur et décide de l'étape suivante (question
 * d'orientation, ou destination demandée).
 */
export function EtapePrenom() {
  const t = useTranslations('onboarding.intention.name');
  const router = useRouter();
  const { user, setUser } = useAuth();
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function envoyer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (prenom.trim() === '') {
      setErreur(t('required'));
      return;
    }
    setErreur(null);
    demarrer(async () => {
      const fd = new FormData();
      fd.append('first_name', prenom.trim());
      fd.append('last_name', nom.trim());
      const resultat = await updateProfileAction(fd);
      if (!resultat.ok) {
        setErreur(resultat.message ?? t('error'));
        return;
      }
      if (user) setUser({ ...user, ...resultat.user });
      router.refresh();
    });
  }

  return (
    <form onSubmit={envoyer} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="etape-prenom">{t('firstName')}</Label>
        <Input
          id="etape-prenom"
          name="first_name"
          autoComplete="given-name"
          autoFocus
          maxLength={100}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          aria-invalid={erreur !== null}
          aria-describedby={erreur ? 'etape-prenom-erreur' : undefined}
          disabled={enCours}
          className="h-11"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="etape-nom">{t('lastName')}</Label>
        <Input
          id="etape-nom"
          name="last_name"
          autoComplete="family-name"
          maxLength={100}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          disabled={enCours}
          className="h-11"
        />
      </div>

      {erreur ? (
        <p id="etape-prenom-erreur" role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-11 px-6 sm:self-start" disabled={enCours}>
        {enCours ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
