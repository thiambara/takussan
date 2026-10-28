'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import {
  RADAR_DISCARD_REASONS,
  type RadarDiscardReason,
  type RadarDuplicateTarget,
  type RadarMatch,
} from '@/types/radar';
import { MOTIFS_ECART_RADAR } from '../codes-radar';
import { estDoublonDejaFerme } from './RadarMatchesPanel';
import { useMessageEchecFiche } from './useMessageEchecFiche';

const MANUEL = '__manuel__';
const cleDe = (match: RadarMatch) => `${match.kind}:${match.id}`;

function Radio({ name, value, checked, onChange, children, disabled = false }: {
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly onChange: (value: string) => void;
  readonly children: ReactNode;
  readonly disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-0.5 accent-primary"
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export function ErreurDialogue({ erreur }: { readonly erreur: unknown }) {
  const message = useMessageEchecFiche();
  if (!erreur) return null;
  return <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message(erreur)}</p>;
}

interface DialogueDoublonProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly matches: readonly RadarMatch[];
  /** « Doublon de celui-ci » : ce rapprochement est déjà choisi. */
  readonly prefill: RadarMatch | null;
  readonly pending: boolean;
  readonly erreur: unknown;
  readonly onConfirm: (cible: RadarDuplicateTarget) => void;
}

/**
 * TCK-2387 — « doublon de » : la cible se choisit parmi les rapprochements, ou se saisit (identifiant d'une
 * autre annonce du Radar ou d'un bien du catalogue). Exactement UNE cible part, jamais les deux. Le
 * composant se monte à l'ouverture (`key` chez l'appelant) : son état repart du rapprochement prérempli.
 */
export function DialogueDoublon({ open, onOpenChange, matches, prefill, pending, erreur, onConfirm }: DialogueDoublonProps) {
  const t = useTranslations('superAdmin.pages.radar.listing');
  const fmt = useFormatteurs();
  const nom = useId();
  const [choix, setChoix] = useState<string>(prefill ? cleDe(prefill) : matches.length === 0 ? MANUEL : '');
  const [genre, setGenre] = useState<'listing' | 'property'>('listing');
  const [identifiant, setIdentifiant] = useState('');

  const numero = Number(identifiant);
  const manuelValide = identifiant.trim() !== '' && Number.isInteger(numero) && numero > 0;
  const choisi = matches.find((m) => cleDe(m) === choix);
  const valide = choix === MANUEL ? manuelValide : choisi !== undefined;

  const confirmer = () => {
    if (choix === MANUEL) {
      onConfirm(genre === 'listing' ? { of_listing_id: numero } : { of_property_id: numero });
    } else if (choisi) {
      onConfirm(choisi.kind === 'listing' ? { of_listing_id: choisi.id } : { of_property_id: choisi.id });
    }
  };

  const libelle = (m: RadarMatch) => {
    const titre = m.target.title || t('matches.untitled');
    const prix = m.target.price == null ? '' : ` · ${fmt.montant(m.target.price, 'XOF')}`;
    return `${titre}${prix} (${t(`matches.kinds.${m.kind}`)} n° ${m.id})`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialogs.duplicate.title')}</DialogTitle>
          <DialogDescription>{t('dialogs.duplicate.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (valide && !pending) confirmer();
          }}
        >
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">{t('dialogs.duplicate.matches')}</legend>
            {matches.map((m) => (
              <Radio
                key={cleDe(m)}
                name={nom}
                value={cleDe(m)}
                checked={choix === cleDe(m)}
                onChange={setChoix}
                disabled={estDoublonDejaFerme(m)}
              >
                {libelle(m)}
                {estDoublonDejaFerme(m) ? ` — ${t('dialogs.duplicate.alreadyDuplicate')}` : ''}
              </Radio>
            ))}
            <Radio name={nom} value={MANUEL} checked={choix === MANUEL} onChange={setChoix}>
              {t('dialogs.duplicate.manual')}
            </Radio>
          </fieldset>

          {choix === MANUEL ? (
            <div className="space-y-2 rounded-md bg-muted/40 p-3">
              <fieldset className="flex flex-wrap gap-4 text-sm">
                <legend className="mb-1 text-xs font-medium text-muted-foreground">{t('dialogs.duplicate.manualKind')}</legend>
                {(['listing', 'property'] as const).map((valeur) => (
                  <label key={valeur} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${nom}-genre`}
                      checked={genre === valeur}
                      onChange={() => setGenre(valeur)}
                      className="accent-primary"
                    />
                    {valeur === 'listing' ? t('dialogs.duplicate.kindListing') : t('dialogs.duplicate.kindProperty')}
                  </label>
                ))}
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor={`${nom}-id`}>{t('dialogs.duplicate.manualId')}</Label>
                <Input
                  id={`${nom}-id`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={identifiant}
                  onChange={(event) => setIdentifiant(event.target.value)}
                />
              </div>
            </div>
          ) : null}

          <ErreurDialogue erreur={erreur} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('dialogs.cancel')}</Button>
            <Button type="submit" disabled={!valide || pending}>
              {pending ? t('gestures.working') : t('dialogs.duplicate.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DialogueEcartProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pending: boolean;
  readonly erreur: unknown;
  readonly onConfirm: (motif: RadarDiscardReason) => void;
}

/** TCK-2387 — écarter : un motif de la liste fermée (`RadarDiscardReason`), jamais de texte libre. */
export function DialogueEcart({ open, onOpenChange, pending, erreur, onConfirm }: DialogueEcartProps) {
  const t = useTranslations('superAdmin.pages.radar.listing');
  const tMotifs = useTranslations('superAdmin.pages.radar.reasons');
  const nom = useId();
  const [motif, setMotif] = useState<RadarDiscardReason | ''>('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialogs.discard.title')}</DialogTitle>
          <DialogDescription>{t('dialogs.discard.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (motif !== '' && !pending) onConfirm(motif);
          }}
        >
          <fieldset className="space-y-2">
            <legend className="sr-only">{t('dialogs.discard.title')}</legend>
            {RADAR_DISCARD_REASONS.map((valeur) => (
              <Radio key={valeur} name={nom} value={valeur} checked={motif === valeur} onChange={(v) => setMotif(v as RadarDiscardReason)}>
                {tMotifs(MOTIFS_ECART_RADAR[valeur])}
              </Radio>
            ))}
          </fieldset>
          <ErreurDialogue erreur={erreur} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('dialogs.cancel')}</Button>
            <Button type="submit" variant="destructive" disabled={motif === '' || pending}>
              {pending ? t('gestures.working') : t('dialogs.discard.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
