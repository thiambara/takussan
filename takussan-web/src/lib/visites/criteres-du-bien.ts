/**
 * TCK-2881 — les critères de recherche que la fiche née d'une demande reprend de SON bien : miroir de
 * `ContactLeadService::criteriaFromProperty` (TCK-2582). La ligne « Critères déduits du bien » ne
 * promet rien que la création n'écrit pas :
 *
 *   · le type du bien et son quartier, tels quels ;
 *   · un budget plafond au prix × 1,2 (pas au prix : c'est la règle de l'API), seulement pour une
 *     vente ou un loyer mensuel (ou sans période) — un prix à la nuit ne dit rien d'un budget mensuel ;
 *     calculé en entiers comme l'API (`intdiv(round(prix × 100) × 12, 1000)`).
 *
 * Le contrat (`seeking_contract_type`) est aussi écrit, mais la maquette ne le cite pas : omettre n'est
 * pas promettre.
 *
 * ⚠ L'API déduit ces critères du bien de la DEMANDE (`$lead->property_id`), jamais du bien choisi dans
 * la feuille : « changer » de bien ne change pas la ligne.
 */
export interface BienACriteres {
  readonly type?: string | null;
  readonly contract_type?: string | null;
  readonly rent_period?: string | null;
  readonly price?: number | string | null;
  readonly location?: { readonly quarter?: string | null } | null;
}

export interface CriteresDuBien {
  readonly type: string | null;
  readonly quartier: string | null;
  readonly budgetMax: number | null;
}

export function criteresDuBien(bien: BienACriteres | null | undefined): CriteresDuBien | null {
  if (!bien) return null;
  const quartier = (bien.location?.quarter ?? '').trim() || null;
  const prix = Number(bien.price ?? 0);
  const budgetDeductible = bien.contract_type !== 'rent' || !bien.rent_period || bien.rent_period === 'monthly';
  const budgetMax = Number.isFinite(prix) && prix > 0 && budgetDeductible ? Math.floor((Math.round(prix * 100) * 12) / 1000) : null;
  const type = bien.type ?? null;
  if (type === null && quartier === null && budgetMax === null) return null;
  return { type, quartier, budgetMax };
}
