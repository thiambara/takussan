import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { natureDeLErreur } from '@/lib/nature-de-l-erreur';

import { ErrorState } from './ErrorState';

interface ErreurDeLectureProps {
  /** L'erreur BRUTE de la lecture (`query.error`) : son statut décide de la reprise. */
  readonly erreur: unknown;
  /** Le texte de la panne, déjà traduit. Seul cas où « Réessayer » est proposé. */
  readonly message: ReactNode;
  /** Le refus (403). Par défaut, la phrase neutre du profil actif (`common.status.forbidden`). */
  readonly refus?: ReactNode;
  /** L'objet introuvable (404). Par défaut `common.status.notFound`. */
  readonly introuvable?: ReactNode;
  readonly onRetry: () => void;
  readonly retryLabel: string;
  readonly className?: string;
}

/**
 * TCK-2814 — le bloc d'erreur d'une lecture d'objet : trois états, trois phrases.
 *
 * Une panne (5xx, réseau, délai) dit son texte et propose « Réessayer » ; un 403 dit le refus, un 404
 * dit l'absence, et ni l'un ni l'autre ne propose une reprise qui n'y changerait rien. Le statut se
 * lit dans `natureDeLErreur`, jamais ici. Il compose `ErrorState`, l'unique bloc d'erreur inline.
 */
export function ErreurDeLecture({ erreur, message, refus, introuvable, onRetry, retryLabel, className }: ErreurDeLectureProps) {
  const t = useTranslations('common.status');
  const nature = natureDeLErreur(erreur);
  if (nature === 'panne') {
    return <ErrorState className={className} message={message} onRetry={onRetry} retryLabel={retryLabel} />;
  }
  return <ErrorState className={className} message={nature === 'refus' ? (refus ?? t('forbidden')) : (introuvable ?? t('notFound'))} />;
}

export type { ErreurDeLectureProps };
