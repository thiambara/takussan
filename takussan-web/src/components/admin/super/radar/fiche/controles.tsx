'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { lireNombre } from '@/components/forms/FormInput';
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
  id, decritPar, desactive, valeur, pas = 1, min = 0, onChange, profil, placeholder,
}: ControleCommun & {
  readonly valeur: number | null;
  /** ADR-0135 — `montant` pour un prix XOF ; sinon déduit du pas (`entier` ou `decimal`). */
  readonly profil?: 'montant';
  readonly placeholder?: string;
  /** `1` : entiers (profil `entier`) ; autre : décimal (profil `decimal`), sans pas imposé — 85,3 se saisit. */
  readonly pas?: number;
  readonly min?: number;
  readonly onChange: (valeur: number | null) => void;
}) {
  const [texte, setTexte] = useState(valeur === null ? '' : String(valeur));
  return (
    <Input
      profil={profil ?? (pas === 1 ? 'entier' : 'decimal')}
      id={id}
      min={min}
      placeholder={placeholder}
      aria-describedby={decritPar}
      disabled={desactive}
      value={texte}
      onChange={(event) => {
        const saisi = event.target.value;
        setTexte(saisi);
        if (saisi.trim() === '') return onChange(null);
        // ADR-0135 — champ texte : « 85,3 » et « 1 500 » se lisent, un texte qui n'est pas un nombre ne remonte pas.
        const nombre = lireNombre(saisi);
        if (typeof nombre === 'number' && Number.isFinite(nombre)) onChange(nombre);
      }}
    />
  );
}

/** Une liste de mots séparés par des virgules (équipements). */
export function ChampListe({
  id, decritPar, desactive, valeur, onChange, placeholder,
}: ControleCommun & {
  readonly valeur: readonly string[] | null;
  readonly onChange: (valeur: string[] | null) => void;
  readonly placeholder?: string;
}) {
  const [texte, setTexte] = useState((valeur ?? []).join(', '));
  return (
    <Input
      profil="mots"
      id={id}
      placeholder={placeholder}
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
