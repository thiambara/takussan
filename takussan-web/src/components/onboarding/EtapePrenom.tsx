'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { updateProfileAction } from '@/app/actions/auth';
import { BOUTON_D_ENTREE } from '@/components/auth/BoutonCollant';
import { TitreDEntree } from '@/components/auth/PiecesDuCourriel';
import { DeclarerEntree } from '@/components/entree/CoqueDEntree';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fieldDensityScope } from '@/components/ui/field-density';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

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
 *
 * TCK-2608 — l'écran « Prénom » de la maquette `app-entree-orientation` (a-0) : le titre est ici (la
 * coque n'en porte plus), les deux champs côte à côte au bureau, l'aperçu de ce que le prénom devient,
 * « Continuer » collé au téléphone (pied de la coque, hors du formulaire : `form=`).
 */
const ID_FORMULAIRE = 'etape-prenom-formulaire';
/** Le libellé de la maquette a-0 : à la largeur de son texte, sur l'interligne de 20 px du texte `sm`. */
const LIBELLE = 'self-start leading-(--text-sm--line-height)';
export function EtapePrenom() {
  const t = useTranslations('onboarding.intention.name');
  const tApercu = useTranslations('onboarding.orientation.prenom');
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

  const bouton = (className?: string) => (
    <Button type="submit" form={ID_FORMULAIRE} disabled={enCours} aria-busy={enCours || undefined} className={cn(BOUTON_D_ENTREE, className)}>
      {enCours ? t('submitting') : t('submit')}
    </Button>
  );

  return (
    <form id={ID_FORMULAIRE} onSubmit={envoyer} noValidate>
      {/* TCK-2598 — un nom tapé et pas encore envoyé : « Retour au site » demande confirmation. */}
      <DeclarerEntree
        saisie={prenom.trim() !== '' || nom.trim() !== ''}
        reprise={t('reprise')}
        pied={<div className="lg:hidden">{bouton()}</div>}
      />
      <TitreDEntree sous={t('subtitle')}>{t('title')}</TitreDEntree>
      {/* Les champs de 44 px des maquettes d'entrée (`ChampE`), comme le reste de l'orientation. */}
      <div {...fieldDensityScope()} className="mt-6 grid gap-4 lg:mt-8 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="etape-prenom" className={LIBELLE}>
            {t('firstName')} <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
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
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="etape-nom" className={LIBELLE}>
            {t('nom')} <span className="font-normal text-muted-foreground">{t('facultatif')}</span>
          </Label>
          <Input
            id="etape-nom"
            name="last_name"
            autoComplete="family-name"
            maxLength={100}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            disabled={enCours}
          />
        </div>
      </div>

      {erreur ? (
        <p id="etape-prenom-erreur" role="alert" className="mt-4 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}

      {/* Ce que le prénom devient : la preuve vaut mieux que la phrase. */}
      <div aria-hidden="true" className="mt-6 rounded-xl border border-border bg-muted p-3.5">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tApercu('apercu')}</p>
        <div className="mt-3 flex items-start gap-2.5">
          <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
            {(prenom.trim()[0] ?? '?').toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-semibold">{prenom.trim() || t('firstName')}</span> <span className="text-muted-foreground">· {tApercu('instant')}</span>
            </p>
            <p className="mt-1.5 inline-block rounded-2xl rounded-tl-md border border-border bg-card px-3 py-2 text-sm leading-snug">{tApercu('message')}</p>
          </div>
        </div>
      </div>

      {bouton('mt-8 hidden lg:inline-flex')}
    </form>
  );
}
