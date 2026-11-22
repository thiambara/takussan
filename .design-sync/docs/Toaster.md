---
category: Feedback
---
# Toaster

Transient notification (base-ui Toast): info, success, warning, error. **Dark, at the bottom, everywhere** (decision of 2026-11-10, ADR-0106 § 2): a toast does not change place from page to page.

- `TakussanProvider` already mounts `ToastProvider`: render one `Toaster` inside it, then raise toasts with `useToast().add({ title, description, type })` from any descendant.
- Look: a dark surface (`.dark` set on the toast: `--background` #1f1812, ink #fcf9f3, in both themes), `rounded-xl min-h-12 px-4 shadow-lg`; the kind is told by its icon (success: a check in the toast's ink, as in the mockup; warning, error, info in their colour, each ≥ 3:1 on the dark surface), not by a tinted background.
- Place: full width 16px from the edges on phones, 360px fixed bottom-right from `sm` (24px, 21.6 on the desktop scale); always 16px above a bottom tab bar (`/app` below `md`, public site below `lg`), via `--toast-bas`.
- Text action (« Annuler »): pass `data: { action: <ActionDuToast>…</ActionDuToast> }` — medium weight, ink at 80 %, optional 16px icon before the label.
- Keep titles short and past-tense (« Annonce publiée »). Errors that need action belong in `ErrorState`, not a toast.

Source: `takussan-web/src/components/ui/toast.tsx`.
