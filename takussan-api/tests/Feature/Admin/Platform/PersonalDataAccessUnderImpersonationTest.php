<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\User;
use App\Services\Privacy\PersonalDataAccessLogger;
use App\Support\ImpersonationContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-600 (verif-600 passe 4, G) — sous impersonation, l'opérateur est un lecteur DISTINCT de sa cible.
 *
 * Le `causer` d'une consultation faite sous impersonation est la cible (le jeton est le sien) ; seul
 * `impersonator_id` nomme l'opérateur. Le dédoublonnage de 15 minutes ignorait cette colonne : la
 * cible ouvrait une pièce, l'opérateur l'ouvrait ensuite par la session, et AUCUNE ligne ne le nommait.
 *
 * Le contexte est lié comme le lie `EnforceImpersonationReadOnly` : depuis la passe 4, aucune surface
 * tracée ne reste servie sous impersonation (`kyc/documents/*` y est refusée), et la règle doit tenir
 * pour toute surface future.
 */
class PersonalDataAccessUnderImpersonationTest extends TestCase
{
    use RefreshDatabase;

    private const SURFACE = PersonalDataAccessLogger::SURFACE_KYC_DOCUMENT;

    public function test_la_cible_puis_l_operateur_dans_la_fenetre_laissent_une_ligne_qui_le_nomme(): void
    {
        [$cible, $operateur, $sujet] = $this->acteurs();

        $this->consulter($cible, $sujet);
        $this->consulter($cible, $sujet, sous: $operateur);

        $this->assertSame([null, $operateur->id], $this->lignes($sujet));
    }

    public function test_l_operateur_puis_la_cible_laissent_chacun_leur_ligne(): void
    {
        [$cible, $operateur, $sujet] = $this->acteurs();

        $this->consulter($cible, $sujet, sous: $operateur);
        $this->consulter($cible, $sujet);

        $this->assertSame([$operateur->id, null], $this->lignes($sujet));
    }

    /** Témoin : la fenêtre dédoublonne toujours, pour chaque lecteur séparément. */
    public function test_chaque_lecteur_reste_dedoublonne_dans_sa_fenetre(): void
    {
        [$cible, $operateur, $sujet] = $this->acteurs();

        foreach ([1, 2] as $_) {
            $this->consulter($cible, $sujet);
            $this->consulter($cible, $sujet, sous: $operateur);
        }

        $this->assertSame([null, $operateur->id], $this->lignes($sujet));
    }

    /** @return array{User, User, User} */
    private function acteurs(): array
    {
        return [User::factory()->create(), User::factory()->create(), User::factory()->create()];
    }

    private function consulter(User $lecteur, User $sujet, ?User $sous = null): void
    {
        $contexte = app(ImpersonationContext::class);
        $sous === null ? $contexte->clear() : $contexte->bind(1, (int) $sous->id);

        try {
            app(PersonalDataAccessLogger::class)->record($lecteur, $sujet, self::SURFACE);
        } finally {
            $contexte->clear();
        }
    }

    /** @return list<int|null> l'`impersonator_id` de chaque consultation du sujet, dans l'ordre. */
    private function lignes(User $sujet): array
    {
        return Activity::query()
            ->where('log_name', PersonalDataAccessLogger::LOG_NAME)
            ->where('subject_id', $sujet->id)
            ->orderBy('id')
            ->pluck('impersonator_id')
            ->map(fn ($id) => $id === null ? null : (int) $id)
            ->all();
    }
}
