---
category: Feedback
---
# Toaster

Transient notification (base-ui Toast): info, success, warning, error.

- `TakussanProvider` already mounts `ToastProvider`: render one `Toaster` inside it, then raise toasts with `useToast().add({ title, description, type })` from any descendant. In the app, `ToastProvider` + `Toaster` sit in the root layout. Surfaces are opaque (card), with the kind's token as ink.
- Keep titles short and past-tense (« Annonce publiée »). Errors that need action belong in `ErrorState`, not a toast.

Source: `takussan-web/src/components/ui/toast.tsx`.
