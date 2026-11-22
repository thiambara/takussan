'use client';

import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { cn } from '@/lib/utils';

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
  presentation,
}: {
  readonly valeur: readonly ContactSurPlace[];
  readonly onChange: (v: ContactSurPlace[]) => void;
  /**
   * TCK-2819 (lot 3) — `assistant` : le dessin de la maquette `app-entree-publier` (écran a-5), à la
   * finition de l'assistant d'annonce (`/publish` et `/app/properties/new`). Titre de section 17 px,
   * sans cadre autour ; chaque contact en carte, « Qui ? » et « Numéro » côte à côte dès le téléphone ;
   * « Retirer » en geste texte ; « Ajouter un contact » en pastille pointillée de 44 px. Absente, la
   * fiche du bien (`ContactsSurPlaceDuBien`), que la maquette ne couvre pas, garde son dessin.
   */
  readonly presentation?: 'assistant';
}) {
  const t = useTranslations('property.contacts');
  const assistant = presentation === 'assistant';
  const modifier = (i: number, patch: Partial<ContactSurPlace>) =>
    onChange(valeur.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  return (
    <fieldset
      className={assistant ? 'min-w-0' : 'space-y-3 rounded-lg border border-border p-4'}
      data-testid="contacts-sur-place"
      data-presentation={assistant ? 'assistant' : undefined}
    >
      <legend
        className={cn(
          'float-left w-full p-0 font-display font-semibold text-foreground',
          assistant ? 'text-titre-court tracking-titre' : 'mb-1 text-base',
        )}
      >
        {t('title')}
      </legend>
      <p className={cn('clear-left text-muted-foreground', assistant ? 'pt-1 text-ui leading-snug' : 'text-xs')}>{t('hint')}</p>
      {valeur.map((c, i) => (
        <div
          key={i}
          className={cn(
            'space-y-2 border border-border',
            assistant ? 'mt-3 rounded-xl bg-card p-3.5' : 'rounded-md bg-background p-3',
          )}
          data-contact-sur-place
        >
          <div className={cn('grid items-start gap-3', assistant ? 'grid-cols-2' : 'sm:grid-cols-2')}>
            <div className="min-w-0 space-y-1">
              <label
                htmlFor={`contact-sur-place-label-${i}`}
                className={assistant ? 'text-sm font-medium text-foreground' : 'text-xs font-semibold text-muted-foreground'}
              >
                {t('labelLabel')}
              </label>
              <Input
                profil="mots"
                id={`contact-sur-place-label-${i}`}
                value={c.label}
                maxLength={60}
                placeholder={t('labelPlaceholder')}
                onChange={(e) => modifier(i, { label: e.target.value })}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <label
                htmlFor={`contact-sur-place-phone-${i}`}
                className={assistant ? 'text-sm font-medium text-foreground' : 'text-xs font-semibold text-muted-foreground'}
              >
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
                className={cn('shrink-0 cursor-pointer rounded border-input accent-primary', assistant ? 'size-5' : 'size-4')}
              />
              {t('whatsapp')}
            </label>
            {assistant ? (
              <button
                type="button"
                onClick={() => onChange(valeur.filter((_, k) => k !== i))}
                aria-label={t('removeAria', { index: i + 1 })}
                className="inline-flex h-11 items-center rounded-md px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t('remove')}
              </button>
            ) : (
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
            )}
          </div>
        </div>
      ))}
      {valeur.length < MAX_CONTACTS_SUR_PLACE ? (
        assistant ? (
          <button
            type="button"
            onClick={() => onChange([...valeur, { label: '', phone: '', has_whatsapp: false }])}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-full border border-dashed border-input px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('add')}
          </button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...valeur, { label: '', phone: '', has_whatsapp: false }])}
          >
            <Plus aria-hidden="true" />
            {t('add')}
          </Button>
        )
      ) : (
        <p className={cn('text-xs text-muted-foreground', assistant && 'mt-3')}>{t('max')}</p>
      )}
    </fieldset>
  );
}
