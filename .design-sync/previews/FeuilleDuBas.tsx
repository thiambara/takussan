import { Button, FeuilleDuBas } from 'takussan';

export function AccountSheet() {
  return (
    <FeuilleDuBas defaultOpen titre="Mon compte" declencheur={<Button variant="outline" />}>
      <ul className="divide-y divide-border">
        {['Mon profil', 'Préférences', 'Changer d’espace', 'Se déconnecter'].map((ligne) => (
          <li key={ligne} className="flex min-h-12 items-center text-corps">
            {ligne}
          </li>
        ))}
      </ul>
    </FeuilleDuBas>
  );
}

export function WithStickyAction() {
  return (
    <FeuilleDuBas
      defaultOpen
      titre="Relancer le loyer de novembre"
      declencheur={<Button variant="outline" />}
      pied={<Button size="xl" className="w-full">Envoyer la relance</Button>}
    >
      <p className="text-ui text-encre-douce">Le locataire recevra un message avec le montant dû et le lien de paiement.</p>
    </FeuilleDuBas>
  );
}
