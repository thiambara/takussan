import { useState } from 'react';
import { PuceDeFiltre, RangeeDePuces } from 'takussan';

const FILTRES = [
  { libelle: 'À traiter', compte: 4 },
  { libelle: 'À moi', compte: 2 },
  { libelle: 'Traitées', compte: 37 },
  { libelle: 'Toutes', compte: 43 },
];

export function FilterRow() {
  const [actif, setActif] = useState('À traiter');
  return (
    <RangeeDePuces aria-label="Filtres des demandes" className="max-w-sm">
      {FILTRES.map((f) => (
        <PuceDeFiltre key={f.libelle} active={f.libelle === actif} compte={f.compte} onClick={() => setActif(f.libelle)}>
          {f.libelle}
        </PuceDeFiltre>
      ))}
      <PuceDeFiltre variante="ajouter" />
    </RangeeDePuces>
  );
}

export function Small() {
  return (
    <div className="flex gap-2">
      <PuceDeFiltre taille="sm" active>
        Location
      </PuceDeFiltre>
      <PuceDeFiltre taille="sm">Vente</PuceDeFiltre>
    </div>
  );
}
