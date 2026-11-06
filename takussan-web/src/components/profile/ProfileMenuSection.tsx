'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePreferencesDuMenu } from '@/components/layout/PreferencesDuMenu';
import type { ModeIcones } from '@/lib/navigation/mode-icones';
import { estParDefaut, prefsDe } from '@/lib/navigation/preferences';

const MODES: readonly ModeIcones[] = ['auto', 'icones', 'complet'];

/**
 * TCK-2480 (ADR-0089 §6) — le profil → « Menu » : revenir à la disposition par défaut du persona
 * ACTIF (épingles, replis, « Démarrer » masqué — A9), et choisir le mode de la barre sur CET appareil
 * (A10 : le seul chemin de retour à « Automatique »). Rien sans le fournisseur de la coque.
 */
export function ProfileMenuSection() {
  const t = useTranslations('profile.menu');
  const tPersonas = useTranslations('nav.sidebar.personas');
  const idTitre = useId();
  const idMode = useId();
  const prefs = usePreferencesDuMenu();
  if (!prefs.actif || prefs.persona === null) return null;
  const persona = prefs.persona;
  const parDefaut = estParDefaut(prefsDe(prefs.navigation, persona));
  const options = MODES.map((mode) => ({ value: mode, label: t(`appareil.${mode}`) }));

  return (
    <section aria-labelledby={idTitre} className="space-y-4 rounded-2xl bg-card p-6">
      <div>
        <h2 id={idTitre} className="text-lg font-bold text-foreground">
          {t('titre')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('texte', { persona: tPersonas(persona) })}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground" aria-live="polite">
          {parDefaut ? t('dejaParDefaut') : t('personnalise')}
        </p>
        <Button type="button" variant="outline" disabled={parDefaut} onClick={() => prefs.reinitialiser(persona)}>
          {t('reinitialiser')}
        </Button>
      </div>
      <div className="space-y-1">
        <Label htmlFor={idMode}>{t('appareil.label')}</Label>
        <Select
          value={prefs.modeIcones}
          onValueChange={(suivant) => {
            const mode = MODES.find((m) => m === suivant);
            if (mode) prefs.choisirModeIcones(mode);
          }}
          items={options}
        >
          <SelectTrigger id={idMode} className="w-full sm:w-96">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t('appareil.aide')}</p>
      </div>
    </section>
  );
}
