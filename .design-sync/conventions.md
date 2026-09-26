## Building with Takussan — read this first

Takussan is a property platform for Senegal (Dakar rentals and sales, XOF, French first). Direction « Ancrage Local Contemporain »: Lin palette (sand `background`, terracotta `primary`, sage `accent`), Bricolage Grotesque titles, DM Sans everything else.

### Wrap every tree in `TakussanProvider`

```jsx
const { TakussanProvider, Button, Card, CardHeader, CardTitle, CardContent, Icons } = window.Takussan;
<TakussanProvider locale="fr">{/* your screen */}</TakussanProvider>
```

It provides the next-intl messages (`fr` default, `en`, `wo`; time zone Africa/Dakar) and mounts `ToastProvider`. Without it, `Dialog` (close button), `Toaster`, `PhoneInput`, `DatePicker` and `DateTimePicker` throw a missing-intl-context error. Render one `<Toaster />` inside it and raise toasts with `useToast().add({ title, description, type })`.

### Styling idiom: Tailwind utilities on semantic tokens — never hex, never raw palette

The stylesheet is the product's own Tailwind 4 build, so **only classes the product already uses exist**. Before inventing a class, grep `_ds_bundle.css`; if it is missing, use `style={{ … var(--token) }}` instead.

| Family | Real names |
|---|---|
| Surfaces | `bg-background` (page), `bg-card` (raised), `bg-muted` (secondary surface, placeholders), `bg-secondary`, `bg-primary` (one filled CTA per screen) |
| Text | `text-foreground`, `text-muted-foreground`, `text-primary`, `text-primary-foreground`, `text-accent` |
| Lines / focus | `border-border`, `ring-ring` (`focus-visible:ring-2 ring-ring`) |
| Status chips | `bg-success/10 text-success`, `bg-warning/12 text-warning`, `bg-destructive/10 text-destructive`, `bg-info/10 text-info` (consoles only) — on `<Badge variant="outline" className="border-transparent …">` |
| Veils | `bg-scrim/10` (dialogs), `bg-scrim/30` (sheets) |
| Type | `font-display` for h1–h3 and card titles (`tracking-tight text-balance`), `font-sans` (default) for body; `tabular-nums` on amounts |
| Shape / depth | `rounded-xl` cards and photos, `rounded-lg` controls, `rounded-full` avatars and pills; `shadow-sm`, `shadow-md` only |
| Charts | `bg-chart-1` … `chart-5`, in order |

Headings as the app writes them: page `font-display text-3xl md:text-4xl font-bold tracking-tight text-balance`; section `font-display text-lg font-semibold text-foreground`. Page width `max-w-7xl mx-auto px-4`.

Tokens (`:root` in `_ds_bundle.css`): `--background #fcf9f3`, `--card #fff`, `--muted #f1ece0`, `--primary #a85332`, `--primary-deep #823c20` (hover), `--accent #5d6e4f`, `--success`, `--warning`, `--destructive`, `--info`, `--radius`. `accent` marks featured items only — never success, never an action.

### Components and content rules

- Always a primitive over a native element: `Button` (never a raw `<button>` for an action), `Select` (never `<select>`), `EmptyState` / `ErrorState` for the one empty and one error state. Override with `className`; `window.Takussan.cn` merges classes.
- Compound parts are separate exports: `Card` › `CardHeader` › `CardTitle` / `CardDescription` / `CardAction`, `CardContent`, `CardFooter`; same for `Dialog*`, `Sheet*`, `Select*`, `DropdownMenu*`, `Table*`, `Tabs*`, `Popover*`, `Avatar*`.
- `Sheet` side panels carry no padding: pass `className="flex w-full flex-col p-0 sm:max-w-md"` and pad the header and body with `p-4`.
- Icons: `Takussan.Icons.*` (Lucide: `Home`, `Search`, `MapPin`, `Plus`, `Bell`, `User`, `Settings`, `Building2`, `ChevronRight`, `CircleAlert`, `TriangleAlert`…). `size-4` inline, `size-5` in buttons.
- Copy is French: action = verb + object (« Ajouter un bien », never « OK / Valider »); `tu` on public discovery pages, `vous` in the app; money `450 000 F CFA / mois`; no emoji, no fake figures, no marketing hero on discovery pages.

### Where the truth lives

`styles.css` → `_ds_bundle.css` (tokens + every class), `guidelines/design-guidelines.md` (full charter), each component's `.prompt.md` and `.d.ts`.

```jsx
<Card className="max-w-sm">
  <CardHeader><CardTitle>Loyers encaissés</CardTitle></CardHeader>
  <CardContent className="flex items-center justify-between gap-4">
    <p className="font-display text-3xl font-semibold tracking-tight tabular-nums">4 250 000 F CFA</p>
    <Button size="sm"><Icons.Plus />Ajouter un bien</Button>
  </CardContent>
</Card>
```
