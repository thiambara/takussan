---
category: Overlays
---
# Dialog

Modal dialog on a `scrim/10` veil, card surface, rounded-xl.

- Compose `DialogContent` › `DialogHeader` (`DialogTitle` + `DialogDescription`) › body › `DialogFooter`. `showCloseButton` (default on) adds the translated close button.
- Destructive confirmations always describe the consequence and put the destructive button last.
- Needs the next-intl provider (`common.actions`).

Source: `takussan-web/src/components/ui/dialog.tsx`.
