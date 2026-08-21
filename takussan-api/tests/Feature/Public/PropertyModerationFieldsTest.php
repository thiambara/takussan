<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use App\Models\User;
use Carbon\Carbon;
use DateTimeInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-335 — les quatre champs de modération ne partent qu'à un appelant
 * authentifié.
 *
 * ⚠ Ce n'est PAS une fuite d'information, et le nommer ainsi orienterait vers
 * un correctif urgent et grossier là où il en faut un propre. Mesuré le
 * 2026-08-21 sur la base locale : **0 bien public** ne porte un
 * `rejection_reason`, `approved_at`, `submitted_at` ou `rejected_at` non nul,
 * et c'est vrai *par construction* — `PropertyModerationService::approve()`
 * remet `rejection_reason` et `rejected_at` à `null` dans la transaction qui
 * rend le bien disponible, et `rejected`/`pending_review` sont dans
 * `NON_PUBLIC_STATUSES`. Ce que le défaut coûte réellement : **8,5 % de charge
 * utile inutile** (2 700 octets sur 31 828 à `per_page=30`) et l'aveu d'une
 * mécanique de modération offert à un visiteur anonyme.
 *
 * Les assertions portent donc sur l'ABSENCE de la clé, jamais sur « égale à
 * null » : un champ absent se remarque, un champ nul se croit. Un correctif qui
 * se contenterait de forcer `null` laisserait la charge utile intacte et
 * garderait le lecteur du JSON dans l'illusion que le champ existe pour lui.
 *
 * Le versant authentifié est la moitié qui compte : le commentaire TCK-098
 * justifiait l'émission inconditionnelle par la bannière de statut du tableau
 * de bord agent, qui doit se rendre « sans second aller-retour ». Ce tableau de
 * bord est rendu depuis une session — le troisième test le vérifie plutôt que
 * de le supposer.
 */
class PropertyModerationFieldsTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private const MODERATION_KEYS = [
        'rejection_reason',
        'submitted_at',
        'approved_at',
        'rejected_at',
    ];

    /**
     * Un bien PUBLIC qui porte quand même les quatre valeurs. C'est un état que
     * la modération ne produit pas — et c'est délibéré : si le test créait un
     * bien aux quatre champs nuls, `assertJsonMissingPath()` passerait aussi
     * bien sur un `null` sérialisé que sur une clé retirée, et l'ablation ne
     * rougirait pas.
     */
    private function proprieteAvecTraceDeModeration(): Property
    {
        return Property::factory()->published()->create([
            'submitted_at' => now()->subDays(3),
            'approved_at' => now()->subDay(),
            'rejected_at' => now()->subDays(2),
            'rejection_reason' => 'Photos illisibles.',
        ]);
    }

    public function test_un_visiteur_anonyme_ne_recoit_aucun_champ_de_moderation_sur_la_fiche(): void
    {
        $property = $this->proprieteAvecTraceDeModeration();

        $response = $this->getJson("/api/public/properties/{$property->slug}");

        $response->assertOk()->assertJsonPath('data.slug', $property->slug);

        foreach (self::MODERATION_KEYS as $key) {
            $response->assertJsonMissingPath("data.{$key}");
        }
    }

    public function test_un_visiteur_anonyme_ne_recoit_aucun_champ_de_moderation_dans_la_liste(): void
    {
        $this->proprieteAvecTraceDeModeration();

        $response = $this->getJson('/api/public/properties?per_page=5');

        $response->assertOk();
        $this->assertNotEmpty($response->json('data'), 'La liste publique doit contenir le bien créé.');

        foreach (array_keys((array) $response->json('data')) as $index) {
            foreach (self::MODERATION_KEYS as $key) {
                $response->assertJsonMissingPath("data.{$index}.{$key}");
            }
        }
    }

    public function test_un_utilisateur_authentifie_recoit_les_quatre_champs_de_moderation(): void
    {
        $property = $this->proprieteAvecTraceDeModeration();

        $response = $this->actingAsApi(User::factory()->create())
            ->getJson("/api/public/properties/{$property->slug}");

        $response->assertOk();

        foreach (self::MODERATION_KEYS as $key) {
            $this->assertArrayHasKey(
                $key,
                (array) $response->json('data'),
                "La clé `{$key}` doit rester présente pour un appelant authentifié : c'est elle qui "
                .'alimente la bannière de statut du tableau de bord agent (TCK-098).',
            );
        }

        $response
            ->assertJsonPath('data.rejection_reason', 'Photos illisibles.')
            ->assertJsonPath('data.submitted_at', $this->attendu($property->submitted_at))
            ->assertJsonPath('data.approved_at', $this->attendu($property->approved_at))
            ->assertJsonPath('data.rejected_at', $this->attendu($property->rejected_at));
    }

    /** La forme exacte que `BaseResource::iso()` produit (ADR-0018). */
    private function attendu(?DateTimeInterface $date): ?string
    {
        return $date === null
            ? null
            : Carbon::instance($date)->utc()->format(DateTimeInterface::ATOM);
    }
}
