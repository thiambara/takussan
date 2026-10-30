<?php

namespace Tests\Feature\Radar;

use App\Models\AiSuggestion;
use App\Models\Enums\AiSuggestionDecision;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Radar\RadarPurger;
use App\Support\RadarPhone;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2406 (AC2) — la matière collectée d'une annonce PUBLIÉE (texte brut, adresse de la source, extraction, réserve de photos et
 * captures), puis le numéro en clair de l'annonceur, s'effacent avec la preuve de l'accord : trois ans après le retrait du dernier
 * bien. Derrière `radar.purge_published_material`, éteint par défaut : la lettre d'ADR-0077 §9 et `privacy.ts` § 6 ne purgent que
 * l'annonce jamais publiée, et rien ne change tant que le porteur n'a pas tranché (avec l'avocat).
 */
class RadarPurgePublishedTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private const NUMERO = '+221741234567';

    private User $operateur;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-30 10:00:00');
        Queue::fake();
        $this->operateur = $this->operateur(PlatformProfileLevel::SuperAdmin);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // --- Outils ------------------------------------------------------------------------------------

    private static function jpeg(int $teinte = 120): string
    {
        $image = imagecreatetruecolor(16, 12);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, $teinte, 83, 50));
        ob_start();
        imagejpeg($image);

        return (string) ob_get_clean();
    }

    private function allumer(): void
    {
        config(['radar.purge_published_material' => true]);
    }

    private function purger(): array
    {
        return app(RadarPurger::class)->run();
    }

    private function jours(int $n): void
    {
        Carbon::setTestNow(Carbon::now()->addDays($n));
    }

    private function annonceur(): RadarAdvertiser
    {
        return RadarAdvertiser::factory()->create(['phone' => self::NUMERO, 'display_name' => 'Awa Diop']);
    }

    private function bien(): Property
    {
        return Property::factory()->create(['status' => PropertyStatus::Available, 'visibility' => PropertyVisibility::Public, 'published_at' => now()]);
    }

    private function retirer(Property $bien): void
    {
        $bien->forceFill(['status' => PropertyStatus::Archived, 'visibility' => PropertyVisibility::Private, 'published_at' => null, 'archived_at' => now()])->save();
    }

    /** Une annonce publiée sur `$bien`, avec sa capture et sa réserve de photos, et la suggestion de l'extraction. */
    private function annoncePubliee(RadarAdvertiser $annonceur, ?Property $bien): RadarListing
    {
        $annonce = RadarListing::factory()->extracted()->create([
            'radar_advertiser_id' => $annonceur->id,
            'stage' => RadarListingStage::Published,
            'property_id' => $bien?->id,
            'source_kind' => RadarSourceKind::Url,
            'source_url' => 'https://sn.coinafrique.com/annonce/'.fake()->unique()->numerify('#####'),
            'raw_text' => 'Villa à louer, appelez Awa au 74 123 45 67',
            'photo_urls' => ['https://a.cdn.test/p/1.jpg'],
        ]);
        $annonce->addMediaFromString(self::jpeg(10))->usingFileName('capture.jpg')->toMediaCollection('radar_captures');
        $photo = $annonce->addMediaFromString(self::jpeg(200))->usingFileName('photo.jpg')->toMediaCollection('radar_photos');
        $annonce->forceFill(['photo_preparation' => [['url' => 'https://a.cdn.test/p/1.jpg', 'media_id' => $photo->id]]])->save();
        AiSuggestion::query()->create([
            'usage_key' => 'radar.extraction', 'subject_type' => $annonce->getMorphClass(), 'subject_id' => $annonce->id,
            'proposal' => ['title' => 'Villa de Awa au 74 123 45 67'], 'confidence' => 0.9, 'input_snapshot' => 'Texte envoyé au modèle',
            'decision' => AiSuggestionDecision::Edited, 'decided_by_id' => $this->operateur->id, 'decided_at' => now(),
            'final_value' => ['title' => 'Villa de Awa'], 'correction_diff' => ['title' => ['from' => 'a', 'to' => 'b']],
        ]);

        return $annonce->fresh();
    }

    /** Un message qui couvre `$annonces` et sa réponse confirmée (la preuve). */
    private function accord(RadarAdvertiser $annonceur, RadarListing ...$annonces): RadarConsent
    {
        $message = RadarOutreach::factory()->withListings(...$annonces)->sent()->create(['radar_advertiser_id' => $annonceur->id]);

        return RadarConsent::factory()->confirmed($this->operateur)->create(['radar_outreach_id' => $message->id, 'transcript' => 'Awa : OUI']);
    }

    private function assertIntacte(RadarListing $annonce): void
    {
        $apres = $annonce->fresh();
        $this->assertSame(RadarListingStage::Published, $apres->stage);
        $this->assertSame($annonce->raw_text, $apres->raw_text);
        $this->assertSame($annonce->source_url, $apres->source_url);
        $this->assertNotNull($apres->extracted);
        $this->assertSame(2, $apres->media()->count());
    }

    /**
     * Retire le bien, constate le retrait (le premier passage date la preuve), puis avance de trois ans et un jour.
     *
     * @return array<string, int> les comptes du passage qui efface la preuve
     */
    private function troisAnsApresLeRetrait(Property $bien): array
    {
        $this->retirer($bien);
        $this->assertSame(1, $this->purger()['retention_started']);
        $this->jours(365 * 3 + 1);

        return $this->purger();
    }

    // --- Éteint par défaut : la lettre d'ADR-0077 §9 ----------------------------------------------

    public function test_par_defaut_la_matiere_d_une_annonce_publiee_reste_apres_la_preuve(): void
    {
        $this->assertFalse(config('radar.purge_published_material'), 'éteint tant que le porteur n\'a pas tranché');
        $annonceur = $this->annonceur();
        $bien = $this->bien();
        $annonce = $this->annoncePubliee($annonceur, $bien);
        $accord = $this->accord($annonceur, $annonce);

        $comptes = $this->troisAnsApresLeRetrait($bien);

        $this->assertSame(1, $comptes['proofs']);
        $this->assertSame(0, $comptes['published_listings']);
        $this->assertNotNull($accord->fresh()->purged_at);
        $this->assertIntacte($annonce);
        $this->assertSame(self::NUMERO, $annonceur->fresh()->phone);
    }

    // --- Allumé ------------------------------------------------------------------------------------

    public function test_ac2_trois_ans_apres_le_retrait_la_matiere_part_avec_la_preuve_puis_le_numero_de_l_annonceur(): void
    {
        $this->allumer();
        $annonceur = $this->annonceur();
        $bien = $this->bien();
        $bien->addMediaFromString(self::jpeg(150))->usingFileName('photo.jpg')->toMediaCollection('photos');
        $annonce = $this->annoncePubliee($annonceur, $bien);
        $accord = $this->accord($annonceur, $annonce);

        // La veille des trois ans : la preuve vit, la matière aussi.
        $this->retirer($bien);
        $this->purger();
        $this->jours(365 * 3 - 1);
        $this->assertSame(0, $this->purger()['published_listings']);
        $this->assertNull($accord->fresh()->purged_at);
        $this->assertIntacte($annonce);

        $this->jours(2);
        $comptes = $this->purger();

        $this->assertSame(1, $comptes['proofs']);
        $this->assertSame(1, $comptes['published_listings']);
        $purgee = $annonce->fresh();
        $this->assertSame(RadarListingStage::Purged, $purgee->stage);
        $this->assertNull($purgee->raw_text);
        $this->assertNull($purgee->source_url);
        $this->assertNull($purgee->extracted);
        $this->assertSame([], $purgee->photo_urls);
        $this->assertNull($purgee->photo_preparation);
        $this->assertSame(0, $purgee->media()->count());
        // Le lien au bien reste : il n'est pas une donnée collectée, et le bien appartient au compte.
        $this->assertSame($bien->id, $purgee->property_id);
        $this->assertCount(1, $bien->fresh()->getMedia('photos'));
        $suggestion = AiSuggestion::query()->where('subject_id', $annonce->id)->sole();
        $this->assertSame([], $suggestion->proposal);
        $this->assertNull($suggestion->input_snapshot);
        $this->assertSame(AiSuggestionDecision::Edited, $suggestion->decision);
        // Plus aucune annonce : l'annonceur perd son numéro en clair et son nom ; l'empreinte reste.
        $annonceur->refresh();
        $this->assertNull($annonceur->phone);
        $this->assertNull($annonceur->display_name);
        $this->assertSame(RadarPhone::hmac(self::NUMERO), $annonceur->phone_hmac);

        $this->assertSame(0, $this->purger()['published_listings'], 'idempotente');
    }

    public function test_une_annonce_dont_le_bien_a_ete_supprime_part_aussi(): void
    {
        $this->allumer();
        $annonceur = $this->annonceur();
        $bien = $this->bien();
        $annonce = $this->annoncePubliee($annonceur, $bien);
        $this->accord($annonceur, $annonce);
        $bien->forceDelete();
        $this->assertNull($annonce->fresh()->property_id);
        // Un autre bien public : `null NOT IN (liste vide)` est vrai, une liste non vide rend `null` — c'est ce que la garde doit tenir.
        $this->bien();

        $this->assertSame(1, $this->purger()['retention_started']);
        $this->jours(365 * 3 + 1);

        $this->assertSame(1, $this->purger()['published_listings']);
        $this->assertSame(RadarListingStage::Purged, $annonce->fresh()->stage);
    }

    public function test_un_bien_revenu_en_ligne_apres_la_preuve_garde_la_matiere_de_son_annonce(): void
    {
        $this->allumer();
        $annonceur = $this->annonceur();
        $bien = $this->bien();
        $annonce = $this->annoncePubliee($annonceur, $bien);
        $accord = $this->accord($annonceur, $annonce);
        // La preuve est déjà effacée (trois ans hors ligne), puis le compte a remis le bien en ligne lui-même.
        $accord->forceFill(['offline_since' => now()->subYears(4), 'purged_at' => now()->subYear(), 'transcript' => null])->save();

        $this->assertSame(0, $this->purger()['published_listings']);
        $this->assertIntacte($annonce);
        $this->assertSame(self::NUMERO, $annonceur->fresh()->phone);

        // Il ressort : plus rien ne la retient.
        $this->retirer($bien);
        $this->assertSame(1, $this->purger()['published_listings']);
    }

    public function test_une_autre_preuve_encore_vivante_retient_l_annonce(): void
    {
        $this->allumer();
        $annonceur = $this->annonceur();
        $bien = $this->bien();
        $annonce = $this->annoncePubliee($annonceur, $bien);
        $ancien = $this->accord($annonceur, $annonce);
        $ancien->forceFill(['offline_since' => now()->subYears(4), 'purged_at' => now()->subYear(), 'transcript' => null])->save();
        // Un second message, relance sur la même annonce, porte une preuve encore dans ses trois ans.
        $recent = $this->accord($annonceur, $annonce);
        $this->retirer($bien);

        $comptes = $this->purger();

        $this->assertSame(1, $comptes['retention_started']);
        $this->assertNull($recent->fresh()->purged_at);
        $this->assertSame(0, $comptes['published_listings']);
        $this->assertIntacte($annonce);
    }

    public function test_une_annonce_publiee_sans_preuve_effacee_n_est_pas_touchee(): void
    {
        $this->allumer();
        $annonceur = $this->annonceur();
        $annonce = $this->annoncePubliee($annonceur, null);
        // Aucune preuve confirmée ne la couvre (la donnée de départ ne le permet pas, mais rien ne doit partir sans preuve échue).
        RadarOutreach::factory()->withListings($annonce)->sent()->create(['radar_advertiser_id' => $annonceur->id]);

        $this->jours(365 * 10);

        $this->assertSame(0, $this->purger()['published_listings']);
        $this->assertIntacte($annonce);
    }

    public function test_une_annonce_d_un_autre_annonceur_toujours_en_ligne_garde_son_numero(): void
    {
        $this->allumer();
        $annonceur = $this->annonceur();
        $retire = $this->bien();
        $enLigne = $this->bien();
        $partie = $this->annoncePubliee($annonceur, $retire);
        $restee = $this->annoncePubliee($annonceur, $enLigne);
        $this->accord($annonceur, $partie);
        $this->accord($annonceur, $restee);

        $comptes = $this->troisAnsApresLeRetrait($retire);

        $this->assertSame(1, $comptes['published_listings']);
        $this->assertSame(RadarListingStage::Purged, $partie->fresh()->stage);
        $this->assertIntacte($restee);
        $this->assertSame(self::NUMERO, $annonceur->fresh()->phone);
    }
}
