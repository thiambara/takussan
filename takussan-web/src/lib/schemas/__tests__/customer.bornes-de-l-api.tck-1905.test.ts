/**
 * TCK-1905 (P195.09) — les bornes de la fiche client sont celles de l'API
 * (`StoreCustomerRequest`, `UpdateCustomerRequest`) : 255 pour le prénom, le nom et la
 * profession, 100 pour le numéro de pièce. Plus étroites au front, elles empêchaient de
 * réenregistrer une fiche que l'API avait acceptée (un prospect converti, par exemple).
 */
import { describe, expect, it } from 'vitest';
import { customerFormSchema } from '../customer';

const base = {
  first_name: 'Amadou',
  last_name: 'Diop',
  email: '',
  phone: '',
  occupation: '',
  pipeline_stage: 'lead' as const,
  status: 'active' as const,
  id_type: '',
  id_number: '',
};

function erreurs(champ: keyof typeof base, longueur: number): string[] {
  const resultat = customerFormSchema.safeParse({ ...base, [champ]: 'a'.repeat(longueur) });
  if (resultat.success) return [];
  return resultat.error.issues.filter((i) => i.path[0] === champ).map((i) => i.message);
}

describe('customerFormSchema — bornes alignées sur l’API (TCK-1905)', () => {
  it.each([
    ['first_name', 255, 'firstNameTooLong'],
    ['last_name', 255, 'lastNameTooLong'],
    ['occupation', 255, 'occupationTooLong'],
    ['id_number', 100, 'idNumberTooLong'],
  ] as const)('%s : %i caractères passent, un de plus est refusé', (champ, borne, message) => {
    expect(erreurs(champ, borne)).toEqual([]);
    const refus = erreurs(champ, borne + 1);
    expect(refus).toHaveLength(1);
    expect(refus[0]).toContain(message);
  });

  it('un prénom de 150 caractères passe le schéma', () => {
    expect(erreurs('first_name', 150)).toEqual([]);
  });
});
