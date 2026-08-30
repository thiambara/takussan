"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { useLocale, useTranslations } from "next-intl";

import { localeDateFns } from "@/lib/format/dateFnsLocale";

import { cn } from "@/lib/utils";
import { FIELD_DENSITY_HEIGHT } from "@/components/ui/field-density";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * String-friendly date picker that drop-in replaces native
 * `<input type="date">`. Value is exchanged as an ISO date string
 * (`YYYY-MM-DD`) and an empty string when no date is selected, so
 * existing controlled forms can swap with minimal changes.
 */
export interface DatePickerProps {
  readonly value?: string;
  readonly onValueChange: (value: string) => void;
  readonly id?: string;
  readonly name?: string;
  readonly placeholder?: string;
  readonly min?: string;
  readonly max?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  /**
   * TCK-468 — `className` atterrit sur le BOUTON, c'est-à-dire sur la cible cliquable, comme
   * `className` de `FormInput` atterrit sur l'`<input>`. Il ne l'a pas toujours fait : il allait
   * à l'enveloppe positionnée, ce qui rendait ce champ **impossible à ajuster** et condamnait
   * toute reprise « au cas par cas » à rester incomplète ici (AC2).
   *
   * ⚠ **La bascule n'a rien cassé en silence, et le relevé qui le dit doit être précis** :
   * `FormDatePicker` et `FormDateTimePicker` transmettent BIEN leur `className` à cette primitive
   * — ce sont les deux seuls à le faire, et c'est leur raison d'être. Ce qui est vide, c'est le
   * cran d'au-dessus : sur les **9** écrans qui montent ces enveloppes, **aucun** ne fournit de
   * valeur (mesuré le 2026-08-29, en découpant les attributs de chaque élément JSX et non par un
   * `grep` à fenêtre, qui attrape le `className` du `<Button>` voisin). Les 7 sites qui
   * personnalisent ce champ passent tous par `buttonClassName`, dont la cible ne change pas.
   */
  readonly className?: string;
  /** L'enveloppe positionnée — ce que `className` désignait avant TCK-468. */
  readonly containerClassName?: string;
  /** Antériorité : 7 sites l'emploient déjà, il gagne sur `className` pour ne rien leur changer. */
  readonly buttonClassName?: string;
  readonly "aria-invalid"?: boolean | "true" | "false";
  readonly "aria-describedby"?: string;
  readonly "aria-label"?: string;
  readonly "data-testid"?: string;
}

function toDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function DatePicker({
  value,
  onValueChange,
  id,
  name,
  placeholder,
  min,
  max,
  disabled,
  required,
  className,
  containerClassName,
  buttonClassName,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
}: DatePickerProps) {
  const t = useTranslations("ui.datePicker");
  // TCK-292 (2026-08-22) — la locale date-fns était `fr` EN DUR : un utilisateur anglophone lisait
  // « 3 février 2026 » dans un formulaire par ailleurs anglais.
  const dfLocale = localeDateFns(useLocale());
  const selected = toDate(value);
  const minDate = toDate(min);
  const maxDate = toDate(max);

  const disabledMatcher = React.useMemo(() => {
    if (!minDate && !maxDate) return undefined;
    return (date: Date) => {
      if (minDate && date.getTime() < minDate.getTime()) return true;
      if (maxDate && date.getTime() > maxDate.getTime()) return true;
      return false;
    };
  }, [minDate, maxDate]);

  return (
    <div className={cn("relative", containerClassName)}>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              id={id}
              data-slot="date-picker-trigger"
              data-testid={dataTestId}
              aria-haspopup="dialog"
              aria-label={ariaLabel}
              data-invalid={ariaInvalid ? "true" : undefined}
              aria-describedby={ariaDescribedBy}
              data-required={required ? "true" : undefined}
              disabled={disabled}
              className={cn(
                // TCK-468 — 44 px sous une portée `data-field-density="comfortable"`.
                FIELD_DENSITY_HEIGHT,
                "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[invalid=true]:border-destructive data-[invalid=true]:ring-3 data-[invalid=true]:ring-destructive/20 dark:bg-input/30 dark:hover:bg-input/50",
                !selected && "text-muted-foreground",
                className,
                buttonClassName,
              )}
            >
              <span className="truncate">
                {selected
                  ? format(selected, "d MMMM yyyy", { locale: dfLocale })
                  : (placeholder ?? t("placeholder"))}
              </span>
              <CalendarIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onValueChange(date ? toIsoDate(date) : "");
            }}
            disabled={disabledMatcher}
            defaultMonth={selected ?? minDate}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={value ?? ""}
          required={required}
        />
      ) : null}
    </div>
  );
}
