'use client';

import { useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller, useWatch, type Control } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { seekingPropertyTypeValues, type CustomerFormValues } from '@/lib/schemas/customer';
import { cn } from '@/lib/utils';

/**
 * TCK-2590 — « Sa recherche » de la création en deux temps : Louer / Acheter, six types courants et
 * « Plus », les quartiers en pastilles, le budget par paliers. TCK-2589 (lot D2) — extraite de
 * `CreationDuClient` sans changer son rendu, pour que « Modifier » de la fiche pose les mêmes champs
 * (section « Ce qu'il cherche »). `prefixe` nomme les identifiants (`creation` par défaut).
 */

/** Les six types courants, en pastilles ; les dix autres sous « Plus ». */
const TYPES_COURANTS = ['room', 'studio', 'apartment', 'house', 'villa', 'land'] as const;
/** Les paliers du budget, en milliers (location, par mois) ou en millions (achat) ; le dernier : sans plafond. */
const PALIERS = { rent: [100, 150, 200, 250, 300, 400, 500], sale: [10, 25, 50, 75, 100, 150, 200] } as const;
const UNITE = { rent: 1_000, sale: 1_000_000 } as const;

/** Louer / Acheter, le type (six courants, « Plus » pour les seize), les quartiers, le budget. */
export function ChampsDeLaRecherche({ control, prefixe = 'creation' }: { readonly control: Control<CustomerFormValues>; readonly prefixe?: string }) {
  const t = useTranslations('crm.creation');
  const tTypes = useTranslations('nav.categories');
  const [tousLesTypes, setTousLesTypes] = useState(false);
  const contrat = useWatch({ control, name: 'seeking_contract_type' });
  return (
    <div className="space-y-4">
      <Controller
        control={control}
        name="seeking_contract_type"
        render={({ field }) => (
          <div role="radiogroup" aria-label={t('contrat')} className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(['rent', 'sale'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={field.value === c}
                onClick={() => field.onChange(field.value === c ? '' : c)}
                className={cn(
                  'inline-flex h-10 items-center justify-center rounded-lg text-corps outline-none focus-visible:ring-3 focus-visible:ring-ring',
                  field.value === c ? 'bg-card font-semibold shadow-sm' : 'font-medium text-muted-foreground',
                )}
              >
                {t(`contrats.${c}`)}
              </button>
            ))}
          </div>
        )}
      />
      <Controller
        control={control}
        name="seeking_property_types"
        render={({ field }) => {
          const choisis = field.value ?? [];
          const visibles = tousLesTypes ? seekingPropertyTypeValues : [...TYPES_COURANTS, ...choisis.filter((x) => !(TYPES_COURANTS as readonly string[]).includes(x))];
          return (
            <div>
              <p id={`${prefixe}-types`} className="mb-1.5 text-sm font-medium">
                {t('typeDeBien')}
              </p>
              <div role="group" aria-labelledby={`${prefixe}-types`} className="flex flex-wrap gap-2">
                {visibles.map((type) => {
                  const on = choisis.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={on}
                      onClick={() => field.onChange(on ? choisis.filter((v) => v !== type) : [...choisis, type])}
                      className={cn(
                        'inline-flex h-11 items-center rounded-full border px-4 text-corps font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring',
                        on ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted',
                      )}
                    >
                      {tTypes.has(type) ? tTypes(type) : type}
                    </button>
                  );
                })}
                {tousLesTypes ? null : (
                  <button
                    type="button"
                    aria-expanded={false}
                    onClick={() => setTousLesTypes(true)}
                    className="inline-flex h-11 items-center gap-1 rounded-full border border-dashed border-border bg-card px-3.5 text-corps font-medium text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {t('plus')}
                  </button>
                )}
              </div>
            </div>
          );
        }}
      />
      <Controller control={control} name="seeking_neighborhoods" render={({ field }) => <Quartiers id={`${prefixe}-quartiers`} valeur={field.value ?? ''} onChange={field.onChange} />} />
      <Controller
        control={control}
        name="budget_max"
        render={({ field }) => <Budget id={`${prefixe}-budget`} contrat={contrat === 'sale' ? 'sale' : 'rent'} valeur={field.value ?? ''} onChange={field.onChange} />}
      />
    </div>
  );
}

/** Les quartiers en pastilles : Entrée ou virgule ajoute, la croix retire ; la valeur reste « A, B ». */
function Quartiers({ id, valeur, onChange }: { readonly id: string; readonly valeur: string; readonly onChange: (v: string) => void }) {
  const t = useTranslations('crm.creation');
  const [saisie, setSaisie] = useState('');
  const liste = valeur.split(',').map((x) => x.trim()).filter(Boolean);
  const ajouter = () => {
    const q = saisie.trim().replace(/,$/, '').trim();
    if (q && !liste.some((x) => x.toLocaleLowerCase() === q.toLocaleLowerCase())) onChange([...liste, q].join(', '));
    setSaisie('');
  };
  const touche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      ajouter();
    } else if (e.key === 'Backspace' && saisie === '' && liste.length > 0) {
      onChange(liste.slice(0, -1).join(', '));
    }
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {t('quartiers')}
      </label>
      {/* 46 px comme la maquette : pastilles de 32 px, le champ (44 px, sa hauteur de primitive) ramené à 32 dans la rangée. */}
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring">
        {liste.map((q) => (
          <span key={q} className="inline-flex h-8 items-center gap-0.5 rounded-full bg-secondary pr-2 pl-3 text-sm font-medium text-primary-deep">
            {q}
            <button
              type="button"
              aria-label={t('retirerQuartier', { quartier: q })}
              onClick={() => onChange(liste.filter((x) => x !== q).join(', '))}
              // Le dessin de la maquette (une croix de 14 px), la cible étendue par le pseudo-élément.
              className="relative inline-flex size-3.5 items-center justify-center rounded-full outline-none after:absolute after:-inset-3 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        {/* La primitive, dépouillée de son cadre : c'est le conteneur qui porte la bordure et l'anneau. */}
        <Input
          id={id}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={touche}
          onBlur={ajouter}
          placeholder={t('ajouterQuartier')}
          className="-my-1.5 w-auto min-w-24 flex-1 rounded-none border-0 bg-transparent px-1 focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
    </div>
  );
}

/** Le budget plafond par paliers ; le dernier palier, « 500+ » ou « 200+ », ne pose aucun plafond. */
function Budget({ id, contrat, valeur, onChange }: { readonly id: string; readonly contrat: 'rent' | 'sale'; readonly valeur: string; readonly onChange: (v: string) => void }) {
  const t = useTranslations('crm.creation');
  const { montantCourt } = useFormatteurs();
  const paliers = PALIERS[contrat];
  const unite = UNITE[contrat];
  const montant = valeur.trim() === '' ? null : Number(valeur);
  // Un plafond hors palier (saisi sous « Plus de champs ») se place au palier le plus proche.
  const index =
    montant === null
      ? paliers.length - 1
      : paliers.reduce((meilleur, p, i) => (Math.abs(p * unite - montant) < Math.abs(paliers[meilleur] * unite - montant) ? i : meilleur), 0);
  const dernier = paliers.length - 1;
  return (
    <div>
      <p className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
        <label htmlFor={id}>{contrat === 'rent' ? t('budgetParMois') : t('budget')}</label>
        <span className="font-display text-lg font-semibold tabular-nums">{montant === null ? t('sansPlafond') : t('plafond', { montant: montantCourt(montant) })}</span>
      </p>
      {/* Le curseur de la maquette : piste de 6 px, remplissage jusqu'au palier, pouce de 28 px cerclé.
          Le natif reste dessus, invisible, sur 44 px : clavier, lecteur d'écran et doigt passent par lui. */}
      <div className="relative mt-3.5 h-7">
        <input
          id={id}
          type="range"
          min={0}
          max={dernier}
          step={1}
          value={index}
          aria-valuetext={montant === null ? t('sansPlafond') : t('plafond', { montant: montantCourt(montant) })}
          onChange={(e) => {
            const i = Number(e.target.value);
            onChange(i === dernier ? '' : String(paliers[i] * unite));
          }}
          className="peer absolute inset-x-0 -top-2 z-10 h-11 w-full cursor-pointer opacity-0"
        />
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
        <span aria-hidden="true" className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-primary" style={{ width: `${(index / dernier) * 100}%` }} />
        <span
          aria-hidden="true"
          className="absolute top-0 size-7 -translate-x-1/2 rounded-full border-2 border-primary bg-card shadow-md peer-focus-visible:ring-3 peer-focus-visible:ring-ring"
          style={{ left: `${(index / dernier) * 100}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-legende text-muted-foreground tabular-nums" aria-hidden="true">
        {paliers.map((p, i) => (
          <span key={p} className={cn(i === index && 'font-semibold text-foreground')}>
            {i === dernier ? `${p}+` : p}
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{contrat === 'rent' ? t('paliersMilliers') : t('paliersMillions')}</p>
    </div>
  );
}
