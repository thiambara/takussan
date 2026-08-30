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
import { Input } from "@/components/ui/input";

/**
 * Drop-in replacement for `<input type="datetime-local">`.
 * Exchanges values as ISO strings without the timezone suffix
 * (`YYYY-MM-DDTHH:mm`), matching the native input behaviour, so
 * existing controlled forms can swap with minimal changes.
 */
export interface DateTimePickerProps {
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

function toDateTime(value?: string): Date | undefined {
  if (!value) return undefined;
  // datetime-local values look like "YYYY-MM-DDTHH:mm" — `parseISO` accepts them.
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
}

function toLocalIso(date: Date): string {
  // Same shape as a native datetime-local value (no seconds, no TZ).
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function splitDateTime(value?: string): {
  date: string;
  time: string;
} {
  if (!value) return { date: "", time: "" };
  const [date, time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

export function DateTimePicker({
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
}: DateTimePickerProps) {
  const t = useTranslations("ui.dateTimePicker");
  // TCK-292 (2026-08-22) — la locale date-fns était `fr` EN DUR, et le motif portait un `\'à\'`
  // français QUOTÉ : un mot de liaison caché dans un format de date, que rien ne pouvait voir.
  // Le mot passe désormais par le dictionnaire (`dateAtTime`), la date et l'heure sont formatées
  // séparément, et la ponctuation reste au dictionnaire — le wolof ne place pas forcément ses
  // deux morceaux dans cet ordre.
  // ⚠ `ui.dateTimePicker.dateAtTime` DUPLIQUE `calendar.range.dateAtTime`, aux trois valeurs
  // identiques, et c'est délibéré : le découpage du dictionnaire sert `ui` à huit frontières et
  // `calendar` à une seule (`src/i18n/namespaces.json`). Réemployer la clé du calendrier depuis
  // une primitive `ui/` ferait embarquer TOUT l'espace `calendar` à chaque écran qui pose un
  // sélecteur de date. Trois chaînes courtes coûtent moins cher que cet espace-là.
  const dfLocale = localeDateFns(useLocale());
  const selected = toDateTime(value);
  const minDate = toDateTime(min);
  const maxDate = toDateTime(max);

  const disabledMatcher = React.useMemo(() => {
    if (!minDate && !maxDate) return undefined;
    return (date: Date) => {
      if (minDate) {
        const startOfMin = new Date(
          minDate.getFullYear(),
          minDate.getMonth(),
          minDate.getDate(),
        );
        if (date.getTime() < startOfMin.getTime()) return true;
      }
      if (maxDate) {
        const endOfMax = new Date(
          maxDate.getFullYear(),
          maxDate.getMonth(),
          maxDate.getDate(),
        );
        if (date.getTime() > endOfMax.getTime()) return true;
      }
      return false;
    };
  }, [minDate, maxDate]);

  const { date: dateChunk, time: timeChunk } = splitDateTime(value);

  function handleDateSelect(nextDate?: Date) {
    if (!nextDate) {
      onValueChange("");
      return;
    }
    const time = timeChunk || "12:00";
    const next = new Date(nextDate);
    const [hours, minutes] = time.split(":").map((part) => Number(part) || 0);
    next.setHours(hours, minutes, 0, 0);
    onValueChange(toLocalIso(next));
  }

  function handleTimeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const time = event.target.value;
    if (!time) return;
    const base = selected ?? new Date();
    const [hours, minutes] = time.split(":").map((part) => Number(part) || 0);
    base.setHours(hours, minutes, 0, 0);
    onValueChange(toLocalIso(base));
  }

  return (
    <div className={cn("relative", containerClassName)}>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              id={id}
              data-slot="date-time-picker-trigger"
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
                  ? t("dateAtTime", {
                      date: format(selected, "d MMMM yyyy", { locale: dfLocale }),
                      time: format(selected, "HH:mm", { locale: dfLocale }),
                    })
                  : (placeholder ?? t("placeholder"))}
              </span>
              <CalendarIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col gap-2 p-2">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={handleDateSelect}
              disabled={disabledMatcher}
              defaultMonth={selected ?? minDate}
              autoFocus
            />
            <div className="flex items-center gap-2 border-t border-border px-3 py-2">
              <label
                htmlFor={`${id ?? "datetime"}-time`}
                className="text-xs font-medium text-muted-foreground"
              >
                {t("timeLabel")}
              </label>
              <Input
                id={`${id ?? "datetime"}-time`}
                type="time"
                value={timeChunk}
                onChange={handleTimeChange}
                step={60}
                disabled={!dateChunk}
                className="h-8 w-32"
              />
            </div>
          </div>
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
