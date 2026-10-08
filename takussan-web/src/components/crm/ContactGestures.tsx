'use client';

import { MessageCircle, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { isReachable, telHref, whatsappHref } from './contact';

interface ContactGesturesProps {
  readonly phone: string | null | undefined;
  readonly firstName: string;
  readonly fullName: string;
  /** Message WhatsApp prérempli ; à défaut, la salutation de l'agent dans la langue de l'interface. */
  readonly message?: string;
  readonly compact?: boolean;
  readonly className?: string;
}

/**
 * TCK-591 — « Appeler » et « WhatsApp », les deux gestes les plus visibles d'une fiche, d'une carte
 * de pipeline et d'une tâche rattachée à un client. Cibles de 44 px au moins, au pouce.
 *
 * Les clics ne remontent pas : posés sur une carte cliquable (pipeline), ils ouvriraient sinon la
 * fiche en même temps que l'appel.
 */
export function ContactGestures({ phone, firstName, fullName, message, compact, className }: ContactGesturesProps) {
  const t = useTranslations('agentCrm.contact');

  if (!phone) {
    return compact ? null : <p className={cn('text-xs text-muted-foreground', className)}>{t('noPhone')}</p>;
  }
  if (!isReachable(phone)) {
    return <p className={cn('text-xs text-muted-foreground', className)}>{t('unreachable', { phone })}</p>;
  }

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const size = compact ? 'sm' : 'default';

  return (
    <div className={cn('flex flex-wrap gap-2', className)} onPointerDown={stop} onKeyDown={stop}>
      <a
        href={telHref(phone)}
        onClick={stop}
        aria-label={t('callAria', { name: fullName })}
        className={cn(buttonVariants({ variant: 'outline', size }), 'min-h-11 min-w-11')}
      >
        <Phone aria-hidden="true" />
        {t('call')}
      </a>
      <a
        href={whatsappHref(phone, message ?? t('whatsappMessage', { firstName }))}
        onClick={stop}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('whatsappAria', { name: fullName })}
        className={cn(buttonVariants({ variant: 'outline', size }), 'min-h-11 min-w-11')}
      >
        <MessageCircle aria-hidden="true" />
        {t('whatsapp')}
      </a>
    </div>
  );
}
