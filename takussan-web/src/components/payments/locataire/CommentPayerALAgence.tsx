'use client';

import { Building2, Phone, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { isReachable, telHref } from '@/components/crm/contact';
import { buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { formaterTelephone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import type { ResumeDuLoyer } from '@/types/invoice';

/**
 * TCK-2650 — « Comment payer à l'agence » : les moyens hors ligne que l'agence DÉCLARE
 * (`offline_payment`, `OfflinePaymentMeans` : Wave, Orange Money, virement, téléphone) et le montant
 * qui s'y règle (`parts.payable_at_agency`). Un moyen non déclaré ne s'invente pas : il n'a pas de ligne.
 * Feuille du bas au téléphone, panneau à droite dès `md` (`FeuilleDuBas`).
 */
const LIEN_CONTOUR = buttonVariants({ variant: 'outline', size: 'lg' });

export function CommentPayerALAgence({
  resume,
  open,
  onOpenChange,
}: {
  readonly resume: ResumeDuLoyer;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('payments.locataire.agence');
  const f = useFormatteurs();
  const agence = resume.lease?.agency?.name ?? null;
  const telephone = telephoneDeLAgence(resume);
  const montant = resume.parts.payable_at_agency;

  return (
    <FeuilleDuBas open={open} onOpenChange={onOpenChange} titre={t('titre')}>
      <div className="space-y-4" data-slot="comment-payer-a-l-agence">
        {montant > 0 ? (
          <p className="text-corps text-foreground">
            {agence ? t('montantNomme', { montant: f.montantCourt(montant, resume.currency), agence }) : t('montant', { montant: f.montantCourt(montant, resume.currency) })}
          </p>
        ) : null}
        <MoyensDeLAgence resume={resume} />
        {isReachable(telephone) ? (
          <a href={telHref(telephone)} className={cn(LIEN_CONTOUR, 'w-full')}>
            <Phone className="size-4" aria-hidden="true" />
            {t('appeler')}
          </a>
        ) : null}
      </div>
    </FeuilleDuBas>
  );
}

/** Le téléphone de l'agence : celui de ses moyens hors ligne, sinon celui de sa fiche. */
export function telephoneDeLAgence(resume: ResumeDuLoyer): string | null {
  return resume.offline_payment?.agency_phone ?? resume.lease?.agency?.phone ?? null;
}

/** Les moyens hors ligne déclarés, un par ligne ; aucun moyen à distance : la phrase qui le dit. */
export function MoyensDeLAgence({ resume, className }: { readonly resume: ResumeDuLoyer; readonly className?: string }) {
  const t = useTranslations('payments.locataire.agence');
  const moyens = resume.offline_payment;
  const telephone = telephoneDeLAgence(resume);
  return (
    <div className={cn('space-y-3', className)}>
      <ul className="space-y-3 text-ui">
        {moyens?.wave_number ? (
          <li className="flex gap-2">
            <Smartphone className="mt-0.5 size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span>{t('wave', { numero: formaterTelephone(moyens.wave_number) })}</span>
          </li>
        ) : null}
        {moyens?.orange_money_number ? (
          <li className="flex gap-2">
            <Smartphone className="mt-0.5 size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span>{t('orangeMoney', { numero: formaterTelephone(moyens.orange_money_number) })}</span>
          </li>
        ) : null}
        {moyens?.bank_details ? (
          <li className="flex gap-2">
            <Building2 className="mt-0.5 size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span className="whitespace-pre-line">{t('virement', { coordonnees: moyens.bank_details })}</span>
          </li>
        ) : null}
        {telephone ? (
          <li className="flex gap-2">
            <Phone className="mt-0.5 size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <span>{t('telephone', { numero: formaterTelephone(telephone) })}</span>
          </li>
        ) : null}
      </ul>
      {!moyens?.wave_number && !moyens?.orange_money_number && !moyens?.bank_details ? <p className="text-ui text-muted-foreground">{t('aucunMoyenDeclare')}</p> : null}
    </div>
  );
}
