'use client';

import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';

/** TCK-633 (lot C) — un contact sur place saisi dans l'étape Finition. */
export interface ContactSurPlace {
  label: string;
  phone: string;
  has_whatsapp: boolean;
}

export const MAX_CONTACTS_SUR_PLACE = 3;

/**
 * TCK-633 (lot C, AC12) — jusqu'à trois numéros titrés (gardien, voisin). Format joignable jugé
 * par l'API (`TelephoneJoignable`) ; ils ne sont révélés qu'au geste « Appeler ».
 *
 * TCK-635 — mise en page reprise (retour du porteur) : la grille alignait ses colonnes par le BAS,
 * et l'aide du champ Numéro, plus haute que les autres, faisait tomber « Qui ? », la case et
 * « Retirer ». Chaque contact est une carte : les deux champs alignés en HAUT, puis une ligne
 * WhatsApp / Retirer. Le titre se lit dans le cadre, comme celui de « Vos coordonnées » : une
 * `legend` flottante, et non posée sur la bordure.
 */
export function ContactsSurPlace({
  valeur,
  onChange,
}: {
  readonly valeur: readonly ContactSurPlace[];
  readonly onChange: (v: ContactSurPlace[]) => void;
}) {
  const t = useTranslations('property.contacts');
  const modifier = (i: number, patch: Partial<ContactSurPlace>) =>
    onChange(valeur.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4" data-testid="contacts-sur-place">
      <legend className="float-left mb-1 w-full p-0 font-display text-base font-semibold text-foreground">{t('title')}</legend>
      <p className="clear-left text-xs text-muted-foreground">{t('hint')}</p>
      {valeur.map((c, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-background p-3" data-contact-sur-place>
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor={`contact-sur-place-label-${i}`} className="text-xs font-semibold text-muted-foreground">
                {t('labelLabel')}
              </label>
              <Input
                id={`contact-sur-place-label-${i}`}
                value={c.label}
                maxLength={60}
                onChange={(e) => modifier(i, { label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`contact-sur-place-phone-${i}`} className="text-xs font-semibold text-muted-foreground">
                {t('phoneLabel')}
              </label>
              <PhoneInput id={`contact-sur-place-phone-${i}`} value={c.phone} onValueChange={(phone) => modifier(i, { phone })} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={c.has_whatsapp}
                onChange={(e) => modifier(i, { has_whatsapp: e.target.checked })}
                className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
              />
              {t('whatsapp')}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(valeur.filter((_, k) => k !== i))}
              aria-label={t('removeAria', { index: i + 1 })}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 aria-hidden="true" />
              {t('remove')}
            </Button>
          </div>
        </div>
      ))}
      {valeur.length < MAX_CONTACTS_SUR_PLACE ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...valeur, { label: '', phone: '', has_whatsapp: false }])}
        >
          <Plus aria-hidden="true" />
          {t('add')}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{t('max')}</p>
      )}
    </fieldset>
  );
}
