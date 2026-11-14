import { Impayes } from '@/components/admin/finances/impayes/Impayes';

/**
 * TCK-2628 (décision 2, ADR-0096 § 5) — l'onglet « Impayés » : LE composant des impayés (TCK-2660), celui
 * de l'onglet `impayes` des finances, relance WhatsApp comprise (par le WhatsApp de l'admin : Takussan
 * n'envoie rien, ADR-0105). Sa garde est celle de `/app/agency/finances` (`garderLOnglet`).
 *
 * `resume="toujours"` : dans les finances, le bureau dit le grand total et les cautions dans l'en-tête de
 * page ; l'en-tête de « Rapports » ne les dit pas, le composant les porte donc à toute largeur.
 */
export function OngletImpayes({ agencyId }: { readonly agencyId: number | undefined }) {
  return <Impayes agencyId={agencyId} resume="toujours" />;
}
