import { PersonnaliserLesChiffres } from '@/components/rapports/indicateurs/ReglageDesChiffres';
import { indicateursOuverts } from '@/lib/navigation/rapports';
import { fetchKpiConfigs, fetchKpiMetricsCatalog } from '@/lib/queries/kpis';
import { lireLeContexteDesRapports } from '@/lib/rapports/contexte-serveur';

/**
 * TCK-2628 (décision 3) — « Personnaliser les chiffres » de la vue d'ensemble, rendu à qui ouvre les
 * indicateurs (`indicateursOuverts` : l'admin et l'hôte, masqués par `analytics`).
 *
 * TCK-2629 — plus un lien vers une autre page : le réglage s'ouvre SUR LA PAGE (`PersonnaliserLesChiffres`),
 * avec les indicateurs de l'agence et le catalogue lus ici, et l'aperçu de chaque valeur que la vue
 * d'ensemble passe (`apercus`, lu du résumé qu'elle a déjà chargé ; absent chez l'hôte, dont la vue est
 * celle du bailleur).
 */
export async function LienDesIndicateurs({ apercus }: { readonly apercus?: Readonly<Record<string, number | null>> }) {
  const contexte = await lireLeContexteDesRapports();
  if (!indicateursOuverts(contexte)) return null;
  // Une lecture en échec retire le geste, jamais la vue d'ensemble : le réglage accompagne la page.
  const lus = await Promise.all([fetchKpiConfigs(), fetchKpiMetricsCatalog()]).catch(() => null);
  if (!lus) return null;
  const [configs, catalog] = lus;
  return <PersonnaliserLesChiffres configs={configs?.data ?? []} catalog={catalog?.data ?? []} apercus={apercus} />;
}
