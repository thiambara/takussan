---
category: Navigation
---
# Tabs

Tabs (base-ui) with two list styles: `default` (a muted pill track) and `line` (underline).

- Compose `Tabs` › `TabsList` › `TabsTrigger`s, then `TabsContent` per value. `orientation="vertical"` is supported.
- Under 640px horizontal lists keep a 40px touch floor.
- In the logged-in area (`/app`), `default` is the **segmented control** of the mock-ups (TCK-2689): `p-1` track (44px on phones, 39.6 on desktop), `h-9 px-4` items, active item on `bg-card` with the `shadow-actif` shadow, inactive in `text-muted-foreground`. `size="sm"` gives `p-0.5` and `h-8 px-3` 13px items; `className="w-full"` makes it full width. Arrows move focus, Enter selects. Outside `/app` nothing changes.

Source: `takussan-web/src/components/ui/tabs.tsx`.
