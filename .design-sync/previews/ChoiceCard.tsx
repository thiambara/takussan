import { useState } from 'react';
import { ChoiceCard, ChoiceCardGroup, Icons } from 'takussan';

export function Role() {
  const [role, setRole] = useState('owner');
  return (
    <ChoiceCardGroup legend="Vous êtes…" className="max-w-md">
      <ChoiceCard
        name="role"
        value="owner"
        checked={role === 'owner'}
        onSelect={setRole}
        title="Propriétaire"
        description="Je mets mon bien en location ou en vente."
        icon={<Icons.Home className="size-5" />}
      />
      <ChoiceCard
        name="role"
        value="tenant"
        checked={role === 'tenant'}
        onSelect={setRole}
        title="Locataire"
        description="Je cherche un logement à Dakar."
        icon={<Icons.Search className="size-5" />}
      />
      <ChoiceCard
        name="role"
        value="agent"
        checked={role === 'agent'}
        onSelect={setRole}
        title="Agent ou agence"
        description="Je gère des biens pour le compte de propriétaires."
        icon={<Icons.Building2 className="size-5" />}
      />
    </ChoiceCardGroup>
  );
}

export function RevealsDetails() {
  const [budget, setBudget] = useState('mid');
  return (
    <ChoiceCardGroup legend="Votre budget mensuel" className="max-w-md">
      <ChoiceCard name="budget" value="low" checked={budget === 'low'} onSelect={setBudget} title="Moins de 250 000 F CFA" />
      <ChoiceCard name="budget" value="mid" checked={budget === 'mid'} onSelect={setBudget} title="250 000 à 600 000 F CFA">
        <p className="text-sm text-muted-foreground">La majorité des F3 à Mermoz et Sacré-Cœur.</p>
      </ChoiceCard>
      <ChoiceCard name="budget" value="high" checked={budget === 'high'} onSelect={setBudget} title="Plus de 600 000 F CFA" />
    </ChoiceCardGroup>
  );
}
