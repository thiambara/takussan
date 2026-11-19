<?php

namespace Tests\Support;

use App\Models\ActionLink;
use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Pont\LiensDAction;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-2982 — la scène des liens d'action : une agence, son agent, un bailleur à qui l'agence confie la
 * confirmation des visites (`owners_confirm_visits`), un bien, une visite à confirmer ; et l'émission d'un lien,
 * dont le jeton en clair est extrait de l'URL (le seul endroit où il existe).
 */
trait SceneDuLienDAction
{
    use FabriqueDemandesEtVisites;

    protected Agency $agence;

    protected User $agent;

    protected User $bailleur;

    protected User $visiteur;

    protected Property $bien;

    protected function monterLaSceneDuLien(): void
    {
        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->bailleur = $this->bailleur($this->agence, ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '+221770009911']);
        $this->visiteur = $this->client(['phone' => '+221770001122']);
        $this->bien = $this->bienDe($this->agence, $this->bailleur);
        $this->bien->address()->create(['street' => '12 rue Carnot', 'neighborhood' => 'Plateau', 'city' => 'Dakar', 'country' => 'SN']);
        $this->confier();
    }

    protected function confier(bool $oui = true): void
    {
        $this->agence->update(['settings' => array_replace($this->agence->settings ?? [], ['owners_confirm_visits' => $oui])]);
    }

    protected function visiteAConfirmer(array $attributs = []): PropertyVisit
    {
        return PropertyVisit::factory()->create($attributs + [
            'property_id' => $this->bien->id,
            'visitor_id' => $this->visiteur->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => $this->creneau(),
            'duration_minutes' => 30,
        ]);
    }

    /** @return array{0: string, 1: ActionLink} le jeton en clair et le lien */
    protected function lien(User $pour, string $geste, Model $objet, ?string $telephone = null): array
    {
        $emis = app(LiensDAction::class)->emettre($pour, $geste, $objet, null, $telephone);

        return [self::jetonDe($emis['url']), $emis['lien']];
    }

    protected static function jetonDe(string $url): string
    {
        return substr($url, strrpos($url, '/') + 1);
    }
}
