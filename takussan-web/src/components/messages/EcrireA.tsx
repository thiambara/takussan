'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquare } from 'lucide-react';

import { BrouillonDirect } from '@/components/messages/BrouillonDirect';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { useTrouverLeFilDirect } from '@/lib/queries/conversations';
import { cn } from '@/lib/utils';

export interface EcrireAProps {
  /** Le compte à qui écrire : sans compte (`id` nul), ou soi-même, le geste ne se rend pas. */
  readonly personne: { readonly id: number | null; readonly nom: string };
  /** Le libellé du bouton (« Message » au carnet des bailleurs, « Écrire » à la fiche client). */
  readonly libelle: string;
  /** Le titre, lu par les lecteurs d'écran, du brouillon (« Message à {nom} »). */
  readonly titre: string;
  readonly className?: string;
  readonly iconeClassName?: string;
  readonly 'data-slot'?: string;
}

/**
 * « Écrire à » quelqu'un (extrait de la fiche du bailleur, TCK-2641, pour la fiche client, TCK-2589) :
 * le fil à deux qui existe déjà (TCK-2632 : jamais un second), sinon le brouillon de `BrouillonDirect`
 * — rien n'est en base avant le premier envoi.
 *
 * Jamais vers soi-même : on ne s'écrit pas, et `filter[participant]=<soi>` rend 422 depuis TCK-2632 —
 * le geste ouvrirait un brouillon vers son propre compte.
 *
 * Les libellés viennent de l'appelant : chaque page a son dictionnaire (`src/i18n/namespaces.json`),
 * et ce composant n'en suppose aucun. Il peut être passé aux `actions` de `DeclarerEnTete`, qui les
 * enveloppe du dictionnaire de la page depuis a2b05c307 (TCK-2639).
 */
export function EcrireA({ personne, libelle, titre, className, iconeClassName = 'size-4', 'data-slot': slot }: EcrireAProps) {
  const router = useRouter();
  const { user } = useAuth();
  const trouver = useTrouverLeFilDirect();
  const [brouillon, setBrouillon] = useState(false);
  const [cherche, setCherche] = useState(false);
  const userId = personne.id;
  if (userId === null || user?.id === userId) return null;
  const ouvrir = async () => {
    setCherche(true);
    try {
      const fil = await trouver({ id: userId, name: personne.nom });
      if (fil !== null) router.push(`/app/messages?conversation=${fil}`);
      else setBrouillon(true);
    } catch {
      setBrouillon(true);
    } finally {
      setCherche(false);
    }
  };
  return (
    <>
      <button type="button" onClick={() => void ouvrir()} disabled={cherche} data-slot={slot} className={className}>
        {cherche ? (
          <Loader2 className={cn(iconeClassName, 'flex-none animate-spin')} aria-hidden="true" />
        ) : (
          <MessageSquare className={cn(iconeClassName, 'flex-none')} strokeWidth={1.75} aria-hidden="true" />
        )}
        {libelle}
      </button>
      <Dialog open={brouillon} onOpenChange={setBrouillon}>
        <DialogContent className="h-[min(calc(var(--spacing)*160),90dvh)] p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">{titre}</DialogTitle>
          <BrouillonDirect
            personne={{ id: userId, name: personne.nom, avatar_url: null } as never}
            onCreated={(id) => router.push(`/app/messages?conversation=${id}`)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
