'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const AUCUN = '__aucun__';

export interface OptionChoix {
  readonly value: string;
  readonly label: string;
}

interface ControleCommun {
  readonly id: string;
  readonly decritPar: string;
  readonly desactive: boolean;
}

/**
 * Un nombre saisi : le texte reste ici (« 4. » n'est pas encore un nombre), seul le nombre remonte —
 * `null` quand le champ est vidé, rien tant que le texte n'en est pas un. Le parent le remonte (clé)
 * quand la fiche est relue ou les corrections abandonnées.
 */
export function ChampNombre({
  id, decritPar, desactive, valeur, pas = 1, min = 0, onChange,
}: ControleCommun & {
  readonly valeur: number | null;
  /** `1` : entiers ; autre : décimal, sans pas imposé (`step="any"` — un pas de 0,5 refuserait 85,3 au navigateur). */
  readonly pas?: number;
  readonly min?: number;
  readonly onChange: (valeur: number | null) => void;
}) {
  const [texte, setTexte] = useState(valeur === null ? '' : String(valeur));
  return (
    <Input
      id={id}
      type="number"
      inputMode={pas === 1 ? 'numeric' : 'decimal'}
      min={min}
      step={pas === 1 ? 1 : 'any'}
      aria-describedby={decritPar}
      disabled={desactive}
      value={texte}
      onChange={(event) => {
        const saisi = event.target.value;
        setTexte(saisi);
        if (saisi.trim() === '') return onChange(null);
        const nombre = Number(saisi);
        if (Number.isFinite(nombre)) onChange(nombre);
      }}
    />
  );
}

/** Une liste de mots séparés par des virgules (équipements). */
export function ChampListe({
  id, decritPar, desactive, valeur, onChange,
}: ControleCommun & { readonly valeur: readonly string[] | null; readonly onChange: (valeur: string[] | null) => void }) {
  const [texte, setTexte] = useState((valeur ?? []).join(', '));
  return (
    <Input
      id={id}
      aria-describedby={decritPar}
      disabled={desactive}
      value={texte}
      onChange={(event) => {
        const saisi = event.target.value;
        setTexte(saisi);
        const liste = saisi.split(',').map((mot) => mot.trim()).filter((mot) => mot !== '');
        onChange(liste.length > 0 ? liste : null);
      }}
    />
  );
}

/** Un choix fermé ; `nullable` ajoute « Non renseigné », qui efface la valeur. */
export function ChampChoix({
  id, decritPar, desactive, valeur, options, nullable = true, onChange,
}: ControleCommun & {
  readonly valeur: string | null;
  readonly options: readonly OptionChoix[];
  readonly nullable?: boolean;
  readonly onChange: (valeur: string | null) => void;
}) {
  const t = useTranslations('superAdmin.pages.radar.listing.options');
  const items = nullable ? [{ value: AUCUN, label: t('none') }, ...options] : [...options];
  return (
    <Select
      value={valeur ?? AUCUN}
      onValueChange={(suivante) => {
        if (suivante === null) return;
        onChange(suivante === AUCUN ? null : suivante);
      }}
      items={items}
      disabled={desactive}
    >
      <SelectTrigger id={id} aria-describedby={decritPar} className="w-full bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
