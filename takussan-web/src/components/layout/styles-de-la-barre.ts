/**
 * Styles partagés par la barre latérale de `/app` (`AppSidebar`) et ses blocs (`BandeATraiter`,
 * `DemarrerDeLEspace`, TCK-2479) : une seule définition, pour qu'aucun bloc neuf ne perde l'anneau
 * de focus que TCK-377 a dû ajouter partout.
 */

/**
 * TCK-377 — Anneau de focus sur toutes les cibles cliquables de la barre.
 *
 * Il n'y en avait AUCUN : au clavier, seul le contour par défaut du navigateur subsistait. Le
 * jeton `--ring` (#a85332) mesure 5,32:1 sur le fond réel de l'aside (`--card` = #ffffff) et
 * 4,23:1 sur le fond de l'entrée ACTIVE (`--border` = #ebe5d5) — au-dessus du seuil non-texte de
 * 3:1 dans les deux cas, ce qui rend le `ring-offset` inutile ici. ⚠ Le jumeau super-admin
 * (TCK-359) a dû l'ajouter parce que là-bas `--ring` et `--sidebar-primary` se confondent sur
 * fond sombre ; ce n'est pas le cas sur la palette claire de `/app`, mesuré et non déduit.
 */
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Le titre d'un groupe, en petites capitales (section ou bouton de bascule). */
export const STYLE_TITRE = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';
