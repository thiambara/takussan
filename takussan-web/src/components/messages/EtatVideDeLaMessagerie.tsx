'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MessagesSquare } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/feedback';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { isAgencyAdmin, isAgent, isOwner, isServiceProvider } from '@/lib/roles';

interface EtatVideDeLaMessagerieProps {
  /** « Écrire à un client » — l'action du personnel d'agence ; sans elle, pas de bouton. */
  readonly onNouvelle?: () => void;
  /**
   * Au bureau, l'état vide occupe le PANNEAU du fil, centré, avec « ou voir les demandes de
   * contact » sous lui (maquette `app-messagerie`, a-4 bureau) ; au téléphone, il occupe la liste,
   * posé à 96 px du haut (a-4 téléphone), avec l'action pleine largeur de pouce (48 px).
   */
  readonly bureau?: boolean;
}

/**
 * TCK-2632 (AC6, écran a-4 « Aucune conversation ») — l'état vide d'une messagerie qui n'a encore
 * aucun fil. Il est propre à la personne : l'agent et l'admin écrivent à un client (« Nouvelle
 * conversation ») et, au bureau, peuvent aller aux demandes de contact, d'où naissent la plupart
 * des fils ; le client garde « Parcourir les annonces » ; le prestataire et le bailleur, dont les
 * fils naissent des interventions et des baux, lisent une phrase, sans bouton.
 *
 * La forme est celle de l'`EtatVide` des maquettes (`EmptyState variant="nue"`) : disque de 48 px,
 * icône de 24 px au trait de 1,5.
 */
export function EtatVideDeLaMessagerie({ onNouvelle, bureau = false }: EtatVideDeLaMessagerieProps) {
  const t = useTranslations('messaging');
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const personnel = (isAgent(roles) || isAgencyAdmin(roles)) && onNouvelle !== undefined;
  const metier = !personnel && (isServiceProvider(roles) || isOwner(roles));

  const etat = (
    <EmptyState
      variant="nue"
      data-testid="conversations-vide"
      className={bureau ? undefined : 'pt-24'}
      icon={<MessagesSquare className="size-6" strokeWidth={1.5} aria-hidden="true" />}
      title={personnel || metier ? t('list.videPersonnel') : t('list.empty')}
      description={
        personnel ? t('list.videPersonnelAide') : metier ? t('list.videMetierAide') : t('list.emptyHint')
      }
      action={
        metier ? undefined : personnel ? (
          <button type="button" onClick={onNouvelle} className={bureau ? buttonVariants() : buttonVariants({ size: 'xl' })}>
            {t('list.ecrireAUnClient')}
          </button>
        ) : (
          <Link href="/properties" className={cn(buttonVariants({ variant: 'outline' }))}>
            {t('list.emptyCta')}
          </Link>
        )
      }
    />
  );

  if (!bureau) return etat;

  return (
    <div data-testid="messagerie-panneau-vide" className="flex flex-1 items-center justify-center bg-background">
      <div>
        {etat}
        {personnel ? (
          <p className="-mt-6 text-center text-sm text-muted-foreground">
            {t.rich('list.ouVoirLesDemandes', {
              lien: (morceau) => (
                <Link href="/app/leads" className="font-medium text-primary underline-offset-4 hover:underline">
                  {morceau}
                </Link>
              ),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
