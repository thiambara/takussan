import { permanentRedirect } from 'next/navigation';

/**
 * TCK-277 — `/admin/users` is fused into `/admin/team`. Permanent (308)
 * redirect preserves existing bookmarks while moving traffic to the
 * unified console.
 */
export default function Page(): never {
  permanentRedirect('/admin/team');
}
