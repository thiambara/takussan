'use client';

import { useEffect, useRef } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * TCK-2604 — les six cases du code SMS (maquette `CasesCode`).
 *
 * ⚠ **UN seul champ réel**, posé transparent par-dessus six cases de présentation : le remplissage
 * automatique du SMS (`autocomplete="one-time-code"`), le collage d'un code entier, le libellé et le
 * lecteur d'écran voient un champ de 6 chiffres, comme avant. Six `<input>` d'un caractère
 * cassaient les trois : le SMS ne remplit qu'un champ, le collage n'en remplit qu'un, et le lecteur
 * d'écran annonçait six champs sans nom.
 *
 * L'envoi au sixième chiffre n'est PAS ici : c'est le parent qui le décide, au passage à six
 * chiffres (`onChange`), une fois.
 */
interface CasesDuCodeProps {
  readonly id: string;
  readonly valeur: string;
  readonly onChange: (valeur: string) => void;
  /** Le code refusé : les six cases restent, en rouge, jusqu'à la frappe suivante. */
  readonly erreur?: boolean;
  readonly desactive?: boolean;
  readonly 'aria-describedby'?: string;
  readonly className?: string;
}

export const LONGUEUR_DU_CODE = 6;

export function CasesDuCode({ id, valeur, onChange, erreur = false, desactive = false, className, ...aria }: CasesDuCodeProps) {
  // Le champ reçoit le focus à l'arrivée sur l'écran du code (le `autoFocus` du champ d'avant) : le
  // clavier numérique reste ouvert, et le SMS se propose.
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => {
    champ.current?.focus();
  }, []);

  return (
    <div className={cn('relative flex justify-between gap-2 lg:justify-start', className)}>
      {Array.from({ length: LONGUEUR_DU_CODE }, (_, i) => {
        const chiffre = valeur[i];
        const courante = !erreur && i === Math.min(valeur.length, LONGUEUR_DU_CODE - 1) && valeur.length < LONGUEUR_DU_CODE;
        return (
          <span
            key={i}
            aria-hidden="true"
            data-case-du-code=""
            className={cn(
              'inline-flex h-14 w-12 flex-none items-center justify-center rounded-lg border bg-card font-display text-affiche-26 font-semibold tabular-nums',
              erreur
                ? 'border-destructive text-destructive'
                : courante
                  ? 'border-primary ring-[3px] ring-primary/15'
                  : chiffre
                    ? 'border-input/60'
                    : 'border-input/35',
            )}
          >
            {chiffre ?? (courante ? <span className="h-7 w-[1.5px] bg-primary motion-safe:animate-pulse" /> : null)}
          </span>
        );
      })}
      <Input
        ref={champ}
        id={id}
        value={valeur}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, LONGUEUR_DU_CODE))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={LONGUEUR_DU_CODE}
        required
        disabled={desactive}
        aria-invalid={erreur || undefined}
        aria-describedby={aria['aria-describedby']}
        // Transparent et pleine taille (`size-full` bat la hauteur de la primitive ET celle de la portée
        // confortable, sans écrire de hauteur de champ) : le doigt touche une case, c'est le champ qui reçoit. La
        // police à 16 px évite le zoom d'iOS ; le curseur natif est caché, les cases le dessinent.
        className="absolute inset-0 size-full cursor-text in-data-[field-density=comfortable]:size-full rounded-lg border-0 bg-transparent p-0 text-base text-transparent caret-transparent shadow-none outline-none selection:bg-transparent focus-visible:ring-0 aria-invalid:ring-0 dark:bg-transparent"
      />
    </div>
  );
}
