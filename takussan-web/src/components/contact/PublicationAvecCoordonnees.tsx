'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import {
  changePropertyStatusAction,
  publishPropertyAction,
  type ResultatPublication,
} from '@/app/actions/publish-property';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { CoordonneesPublication } from './CoordonneesPublication';

/**
 * Le geste qui met en ligne, rejoué tel quel depuis la boîte : « Publier » (`POST …/publish`) ou
 * un changement de statut (`PUT …/status`), qui REMET EN LIGNE un bien public retiré par son
 * statut et que l'API garde de la même façon (correction du lot C, tour 2).
 */
export type GesteDeMiseEnLigne = { readonly type: 'publier' } | { readonly type: 'statut'; readonly statut: string };

interface Rappels {
  /** Le geste a abouti : le statut rendu (`pending_review` quand l'agence modère) et le geste. */
  readonly onPublie: (statut: string | null, geste: GesteDeMiseEnLigne) => void;
  /** Un refus qui n'est PAS un manque de coordonnées (quota, droits) : à dire par l'appelant. */
  readonly onEchec: (message: string) => void;
}

/**
 * TCK-633 (lot C, décision 3 du porteur) — « Publier » depuis la liste ou l'en-tête d'un bien.
 *
 * Le premier geste tente la publication SANS accepter les CGU : un compte qui les a déjà
 * acceptées, et dont le contact est complet, publie aussitôt — rien ne s'interpose. Sinon l'API
 * refuse (`property.publish_contact_incomplete`, avec `missing` et `contact_is_self`) SANS rien
 * écrire, et la boîte de dialogue s'ouvre sur « Vos coordonnées pour les intéressés » et la phrase
 * des CGU ; son bouton « Publier » rejoue la publication avec l'acceptation que la phrase annonce.
 * L'API reste seule juge : l'écran ne publie jamais sur la foi de ce qu'il croit savoir.
 */
export function usePublicationAvecCoordonnees(
  propertyId: number,
  { onPublie, onEchec }: Rappels,
): {
  readonly publier: () => void;
  readonly changerStatut: (statut: string) => void;
  readonly enCours: boolean;
  readonly dialogue: ReactNode;
} {
  const t = useTranslations('property.form.publishContact');
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [manquants, setManquants] = useState<string[] | null>(null);
  const [contactEstSoi, setContactEstSoi] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  // Le geste que le bouton de la boîte rejoue : celui qui l'a ouverte.
  const [geste, setGeste] = useState<GesteDeMiseEnLigne>({ type: 'publier' });

  const envoyer = (g: GesteDeMiseEnLigne, acceptTerms: boolean): Promise<ResultatPublication> =>
    g.type === 'publier'
      ? publishPropertyAction(propertyId, { acceptTerms })
      : changePropertyStatusAction(propertyId, g.statut, { acceptTerms });

  const tenter = (g: GesteDeMiseEnLigne, depuisLeDialogue: boolean) => {
    setErreur(null);
    setGeste(g);
    demarrer(async () => {
      const r = await envoyer(g, depuisLeDialogue);
      if (r.ok) {
        setOuvert(false);
        setManquants(null);
        onPublie(r.data?.status ?? null, g);
        return;
      }
      if (r.missing) {
        setManquants(r.missing);
        setContactEstSoi(r.contactIsSelf);
        // `dialogIncomplete`, pas `incomplete` : celle-ci parle du brouillon de l'assistant, et
        // aucun brouillon n'est en jeu depuis la liste ou l'en-tête d'un bien.
        if (depuisLeDialogue) setErreur(t('dialogIncomplete'));
        setOuvert(true);
        return;
      }
      if (depuisLeDialogue) setErreur(r.message);
      else onEchec(r.message);
    });
  };

  const dialogue = (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
        </DialogHeader>
        <CoordonneesPublication manquantsServeur={manquants} contactEstSoi={contactEstSoi} />
        {erreur ? (
          <p role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOuvert(false)} disabled={enCours}>
            {t('dialogCancel')}
          </Button>
          <Button onClick={() => tenter(geste, true)} disabled={enCours} data-testid="publication-confirmer">
            {enCours ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t('dialogPublish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return {
    publier: () => tenter({ type: 'publier' }, false),
    changerStatut: (statut) => tenter({ type: 'statut', statut }, false),
    enCours,
    dialogue,
  };
}
