'use client';

import { ChevronRight, Phone } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { buttonVariants } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { formaterTelephone } from '@/lib/phone';
import type { ResumeDuLoyer } from '@/types/invoice';

import { MoyensDeLAgence, telephoneDeLAgence } from './CommentPayerALAgence';

/**
 * TCK-2650 — la colonne « Mon bail » du bureau (maquette `app-paiements`, `MonBail`) : le bien, le loyer,
 * le jour d'échéance, la référence et la caution versée, puis l'agence, ses contacts et ses moyens de
 * paiement hors ligne. Tout vient du résumé (`lease`, `next_rent`, `offline_payment`) et de la caution
 * lue dans l'historique : ce que l'API ne sert pas (adresse, photo, période, gestionnaire) n'a pas de ligne.
 */
const BOUTON_PETIT = buttonVariants({ variant: 'outline', size: 'sm' });

function Paire({ libelle, valeur }: { readonly libelle: string; readonly valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{libelle}</dt>
      <dd className="flex-none text-right tabular-nums">{valeur}</dd>
    </div>
  );
}

export function MonBail({ resume, caution }: { readonly resume: ResumeDuLoyer; readonly caution: number | null }) {
  const t = useTranslations('payments.locataire.monBail');
  const f = useFormatteurs();
  const bail = resume.lease;
  if (!bail) return null;
  const devise = bail.currency ?? resume.currency;
  const agence = bail.agency;
  const telephone = telephoneDeLAgence(resume);
  const jour = resume.next_rent ? Number(resume.next_rent.due_date.slice(8, 10)) : null;
  const echeance = resume.schedule_state === 'none' ? t('pasEncoreEmise') : jour ? t('leJour', { jour }) : null;

  return (
    <aside aria-label={t('titre')} className="hidden w-full flex-none space-y-4 lg:block xl:w-[21.25rem]" data-slot="mon-bail">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">{t('titre')}</p>
        {bail.property ? <p className="text-corps font-semibold text-foreground">{bail.property.title}</p> : null}
        <dl className="mt-3 divide-y divide-border border-t border-border">
          {bail.monthly_rent != null ? <Paire libelle={t('loyer')} valeur={t('parMois', { montant: f.montantCourt(bail.monthly_rent, devise) })} /> : null}
          {echeance ? <Paire libelle={t('echeance')} valeur={echeance} /> : null}
          {bail.reference_number ? <Paire libelle={t('bail')} valeur={bail.reference_number} /> : null}
          {caution !== null ? <Paire libelle={t('cautionVersee')} valeur={f.montantCourt(caution, devise)} /> : null}
        </dl>
        <Link href={`/app/leases/${bail.id}`} className="mt-2 flex h-9 items-center gap-1 text-sm font-medium text-primary-deep hover:underline">
          {t('voirMonBail')}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {agence ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t('monAgence')}</p>
          <p className="text-corps font-semibold text-foreground">{agence.name}</p>
          {telephone ? <p className="text-ui tabular-nums text-muted-foreground">{formaterTelephone(telephone)}</p> : null}
          {isReachable(telephone) ? (
            <div className="mt-3 flex gap-2">
              <a href={telHref(telephone)} className={BOUTON_PETIT}>
                <Phone className="size-3.5" aria-hidden="true" />
                {t('appeler')}
              </a>
              <a href={whatsappHref(telephone, t('messageWhatsApp', { reference: bail.reference_number ?? '' }))} target="_blank" rel="noopener noreferrer" className={BOUTON_PETIT}>
                <IconeWhatsApp className="size-3.5" />
                {t('whatsapp')}
              </a>
            </div>
          ) : null}
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-ui font-semibold text-foreground">{t('payerALAgence')}</p>
            <MoyensDeLAgence resume={resume} className="mt-2" />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
