'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { DeclarerEntree } from '@/components/entree/CoqueDEntree';

/**
 * TCK-2613 — le cadre des deux écrans d'un assistant d'invité, dans la coque d'entrée (TCK-2598) : la barre dit
 * « Rejoindre {agence} » et l'avancement « Étape 1 sur 2 » / « Étape 2 sur 2 » ; l'écran porte son titre et son
 * geste (collé en bas au téléphone, `BoutonCollant`).
 *
 * Les deux écrans sont TOUJOURS deux, numéro vérifié ou non : l'écran 2 d'un numéro déjà vérifié se dit
 * « Étape 2 sur 2 » — l'étape 1 est faite, pas absente.
 */
export const ETAPES_D_INVITE = 2;

/**
 * L'écran où s'ouvre l'assistant (`WizardReprenable.etapeImposee`) : le numéro vérifié ouvre l'écran 2, quel que
 * soit l'écran que disait un brouillon (un assistant d'avant en avait quatre) ; un numéro non vérifié, l'écran 1,
 * toujours.
 */
export function etapeDInvite(data: { readonly phone?: { readonly verified?: boolean } }): number {
  return data.phone?.verified ? 1 : 0;
}

export function AssistantDInvite({
  etape,
  agence,
  pret,
  children,
}: {
  readonly etape: number;
  readonly agence: string | null;
  /** Faux tant que le brouillon n'est pas relu : l'écran attend, l'avancement aussi. */
  readonly pret: boolean;
  readonly children: ReactNode;
}) {
  const t = useTranslations('onboarding.invite.barre');
  const tAssistant = useTranslations('wizardDrafts.component');
  return (
    <>
      <DeclarerEntree
        titre={agence ? t('intention', { agence }) : t('intentionSans')}
        {...(pret ? { pas: etape + 1, total: ETAPES_D_INVITE, avancementEcrit: true } : {})}
      />
      {pret ? (
        <div data-etape-d-invite={etape + 1}>{children}</div>
      ) : (
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          <span className="sr-only">{tAssistant('loading')}</span>
          <div className="h-8 w-2/3 rounded-lg bg-muted motion-safe:animate-pulse" />
          <div className="h-11 w-full rounded-xl bg-muted motion-safe:animate-pulse" />
        </div>
      )}
    </>
  );
}
