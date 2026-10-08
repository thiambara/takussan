<?php

namespace Tests\Support;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;

/**
 * TCK-600 (ADR-0055) — ouvrir une session d'impersonation par l'API, comme le BFF le fait : un
 * `super_admin` au step-up frais, un motif, et le jeton rendu pour le seul serveur du front.
 *
 * Les deux identités alternent dans un même test : `commeOperateur()` et `avecLeJeton()` vident
 * les en-têtes et les gardes, sans quoi un `Authorization` resté posé décide à la place du test.
 */
trait SessionsDImpersonation
{
    use OperateursPlateforme;

    protected const MOTIF_IMPERSONATION = 'Ticket support 4821 : le bail ne s\'affiche pas.';

    /** @return array{operateur: User, cible: User, jeton: string, session_id: int} */
    protected function ouvrirUneSession(?User $operateur = null, ?User $cible = null): array
    {
        $operateur ??= $this->operateur(PlatformProfileLevel::SuperAdmin);
        $cible ??= User::factory()->create();

        $this->commeOperateur($operateur);
        $data = $this->postJson("/api/admin/users/{$cible->id}/impersonate", ['reason' => self::MOTIF_IMPERSONATION])
            ->assertCreated()
            ->json('data');

        return ['operateur' => $operateur, 'cible' => $cible, 'jeton' => $data['token'], 'session_id' => $data['session_id']];
    }

    protected function commeOperateur(User $operateur): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->actingAsWithStepUp($operateur->fresh());

        return $this;
    }

    protected function avecLeJeton(string $jeton): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        return $this->withToken($jeton);
    }
}
