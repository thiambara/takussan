"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { fr } from "date-fns/locale";
import "react-day-picker/style.css";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * shadcn-style Calendar built on top of `react-day-picker` v10. Tokens
 * are mapped to the project's design system (terracotta primary, Bricolage
 * Grotesque headlines via parent inheritance).
 *
 * Usage:
 *   <Calendar mode="single" selected={date} onSelect={setDate} />
 */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      locale={fr}
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      className={cn("p-3", className)}
      classNames={{
        ...defaults,
        root: cn(defaults.root, "rdp-root"),
        months: cn(defaults.months, "relative flex flex-col gap-4 sm:flex-row"),
        month: cn(defaults.month, "flex flex-col gap-3"),
        month_caption: cn(
          defaults.month_caption,
          "flex h-9 items-center justify-center px-9",
        ),
        caption_label: cn(
          defaults.caption_label,
          "text-sm font-semibold capitalize text-foreground",
        ),
        nav: cn(
          defaults.nav,
          "absolute inset-x-0 top-0 flex items-center justify-between",
        ),
        button_previous: cn(
          defaults.button_previous,
          "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        ),
        button_next: cn(
          defaults.button_next,
          "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        ),
        month_grid: cn(defaults.month_grid, "w-full border-collapse"),
        weekdays: cn(defaults.weekdays, "flex"),
        weekday: cn(
          defaults.weekday,
          "flex-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground",
        ),
        week: cn(defaults.week, "mt-1 flex w-full"),
        day: cn(
          defaults.day,
          "relative flex-1 p-0 text-center text-sm aria-selected:rounded-md focus-within:relative focus-within:z-20",
        ),
        day_button: cn(
          defaults.day_button,
          "mx-auto inline-flex size-9 items-center justify-center rounded-md font-normal text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 aria-selected:opacity-100 disabled:pointer-events-none disabled:opacity-30",
        ),
        today: cn(
          defaults.today,
          "[&>button]:ring-1 [&>button]:ring-primary/40",
        ),
        outside: cn(defaults.outside, "text-muted-foreground/50"),
        disabled: cn(defaults.disabled, "text-muted-foreground/40"),
        selected: cn(
          defaults.selected,
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground",
        ),
        range_start: cn(defaults.range_start, "rdp-range_start"),
        range_middle: cn(
          defaults.range_middle,
          "[&>button]:bg-primary/15 [&>button]:text-foreground [&>button:hover]:bg-primary/25",
        ),
        range_end: cn(defaults.range_end, "rdp-range_end"),
        hidden: cn(defaults.hidden, "invisible"),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...rest }) => {
          const Icon = orientation === "left" ? ChevronLeftIcon : ChevronRightIcon;
          return <Icon className={cn("size-4", chevronClass)} {...rest} />;
        },
      }}
      {...props}
    />
  );
}
