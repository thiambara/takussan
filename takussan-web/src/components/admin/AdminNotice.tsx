import { Info } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { AVIS_ADMIN, estAvisAdminConnu } from '@/lib/admin/notices';

/** Les deux libellés d'un motif de redirection, une fois résolus dans la locale du visiteur. */
export interface AvisAdmin {
  readonly title: string;
  readonly body: string;
}

/**
 * Résout `?notice=` en libellés — ou `null` quand le paramètre ne désigne aucun motif connu.
 *
 * Un `notice` inconnu (barre d'adresse, vieux marque-page, lien partagé) ne rend RIEN : ni
 * bandeau vide, ni chemin de clé i18n peint à l'écran.
 */
export async function resoudreAvisAdmin(
  notice?: string | string[],
): Promise<AvisAdmin | null> {
  const valeur = Array.isArray(notice) ? notice[0] : notice;
  if (!estAvisAdminConnu(valeur)) return null;

  const t = await getTranslations('admin.notices');
  const sousEspace = AVIS_ADMIN[valeur];
  return { title: t(`${sousEspace}.title`), body: t(`${sousEspace}.body`) };
}

/**
 * Le bandeau qui dit POURQUOI on a été renvoyé sur `/admin` (TCK-370).
 *
 * ⚠ **Il est SYNCHRONE, et la résolution est à côté.** Ce n'est pas un détail de style : c'est ce
 * qui rend l'écran d'arrivée éprouvable. Un composant `async` imbriqué sous un autre `async`
 * suspend l'arbre entier au rendu de test, et le test ne voit qu'un `<div />` vide — c'est-à-dire
 * qu'il ne peut plus distinguer « le bandeau ne s'affiche pas » de « rien ne s'affiche ». Le
 * défaut que ce ticket corrige a vécu précisément parce que ce chemin-là n'était éprouvé nulle
 * part ; le laisser intestable serait le reconduire.
 */
export function AdminNotice({ avis }: { readonly avis: AvisAdmin | null }) {
  if (!avis) return null;

  return (
    <div
      // `role="status"` et non `alert` : c'est une explication, pas une erreur. Un lecteur
      // d'écran l'annonce sans interrompre ce qu'il est en train de dire.
      role="status"
      data-testid="admin-notice"
      className="flex items-start gap-3 rounded-xl border border-border bg-muted px-4 py-3"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{avis.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{avis.body}</p>
      </div>
    </div>
  );
}
