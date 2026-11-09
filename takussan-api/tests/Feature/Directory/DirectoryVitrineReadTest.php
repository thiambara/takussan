<?php

namespace Tests\Feature\Directory;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\GeoNeighborhood;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

/**
 * TCK-2518 — ce que l'annuaire public émet de la vitrine : `cover`, `showcase`, accroche et trois
 * points, `leases_signed_this_month`, délai de réponse ; langues et quartiers de l'agent.
 *
 * La règle qui porte le ticket : **aucun bien non public n'est émis**, ni par la sélection ni par
 * une photo de couverture. Chaque test qui l'affirme crée le bien non public AVEC une photo
 * servable — sans quoi il serait sauté pour une autre raison, et le test serait vert sans la règle.
 */
class DirectoryVitrineReadTest extends TestCase
{
    use RefreshDatabase;

    private function agence(array $attributs = []): Agency
    {
        return Agency::factory()->create(array_merge(['status' => AgencyStatus::Active], $attributs));
    }

    private function bien(Agency $agence, array $attributs = [], bool $photo = true): Property
    {
        $bien = Property::factory()->published()->create(array_merge(['agency_id' => $agence->id], $attributs));
        Address::factory()->create(['addressable_type' => Property::class, 'addressable_id' => $bien->id, 'city' => 'Dakar']);
        if ($photo) {
            $this->photo($bien);
        }

        return $bien;
    }

    private function photo(Property $bien): Media
    {
        $id = DB::table('media')->insertGetId([
            'model_type' => Property::class, 'model_id' => $bien->id, 'uuid' => (string) Str::uuid(),
            'collection_name' => 'photos', 'name' => 'p', 'file_name' => "p{$bien->id}.jpg", 'mime_type' => 'image/jpeg',
            'disk' => config('media-library.public_disk_name'), 'conversions_disk' => config('media-library.public_disk_name'),
            'size' => 1, 'manipulations' => '[]', 'custom_properties' => json_encode(['watermarked' => ['preview' => true, 'thumbnail' => true, 'full' => true]]),
            'generated_conversions' => json_encode(['preview' => true, 'thumbnail' => true, 'full' => true]), 'responsive_images' => '[]', 'order_column' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return Media::query()->findOrFail($id);
    }

    /** @return list<int> */
    private function idsDeCouverture(array $cover): array
    {
        return array_column($cover, 'property_id');
    }

    /** AC1 — un bien devenu loué sort de la sélection et de la couverture ; les autres restent, dans l'ordre. */
    public function test_ac1_un_bien_devenu_loue_sort_de_la_selection_et_de_la_couverture(): void
    {
        $agence = $this->agence();
        $a = $this->bien($agence);
        $loue = $this->bien($agence);
        $b = $this->bien($agence);
        $agence->forceFill(['showcase_property_ids' => [$b->id, $loue->id, $a->id]])->save();
        $loue->forceFill(['status' => PropertyStatus::Rented])->save();

        $fiche = $this->getJson("/api/public/agencies/{$agence->slug}")->assertOk();

        $this->assertSame([$b->id, $a->id], array_column($fiche->json('data.showcase'), 'id'));
        $this->assertNotContains($loue->id, $this->idsDeCouverture($fiche->json('data.cover')));
        $this->assertSame([$b->id, $a->id], array_slice($this->idsDeCouverture($fiche->json('data.cover')), 0, 2), 'la sélection d\'abord');
        foreach ($fiche->json('data.cover') as $photo) {
            $this->assertNotNull($photo['photo_url']);
        }

        $index = $this->getJson('/api/public/agencies')->assertOk();
        $this->assertNotContains($loue->id, $this->idsDeCouverture($index->json('data.0.cover')));
    }

    public function test_un_bien_prive_ou_brouillon_n_entre_jamais_dans_la_couverture(): void
    {
        $agence = $this->agence();
        $public = $this->bien($agence, ['published_at' => now()->subDays(5)]);
        $prive = $this->bien($agence, ['visibility' => 'private', 'published_at' => now()]);
        $brouillon = $this->bien($agence, ['status' => PropertyStatus::Draft, 'published_at' => now()]);
        $agence->forceFill(['showcase_property_ids' => [$prive->id, $brouillon->id]])->save();

        $cover = $this->getJson("/api/public/agencies/{$agence->slug}")->assertOk()->json('data.cover');

        $this->assertSame([$public->id], $this->idsDeCouverture($cover));
    }

    /**
     * Revue — une sélection qui cite le bien PUBLIC d'une autre agence (écriture directe, bien
     * transféré) ne le sert ni en `showcase` ni en `cover` : la lecture est la garde qui survit à
     * l'écriture.
     */
    public function test_une_selection_qui_cite_le_bien_public_d_une_autre_agence_ne_le_sert_pas(): void
    {
        $agence = $this->agence();
        $sien = $this->bien($agence, ['published_at' => now()->subDays(3)]);
        $etranger = $this->bien($this->agence(), ['published_at' => now()]);
        $agence->forceFill(['showcase_property_ids' => [$etranger->id, $sien->id]])->save();

        $fiche = $this->getJson("/api/public/agencies/{$agence->slug}")->assertOk();
        $this->assertSame([$sien->id], array_column($fiche->json('data.showcase'), 'id'));
        $this->assertSame([$sien->id], $this->idsDeCouverture($fiche->json('data.cover')));

        $ligne = collect($this->getJson('/api/public/agencies')->assertOk()->json('data'))->firstWhere('id', $agence->id);
        $this->assertSame([$sien->id], $this->idsDeCouverture($ligne['cover']));
    }

    /** AC5 — sans accroche ni sélection : `tagline` nul, `highlights` vide, couverture = trois plus récents. */
    public function test_ac5_sans_accroche_ni_selection_la_couverture_vient_des_trois_biens_les_plus_recents(): void
    {
        $agence = $this->agence();
        $vieux = $this->bien($agence, ['published_at' => now()->subDays(10)]);
        $r3 = $this->bien($agence, ['published_at' => now()->subDays(3)]);
        $r1 = $this->bien($agence, ['published_at' => now()->subDay()]);
        $r2 = $this->bien($agence, ['published_at' => now()->subDays(2)]);

        $fiche = $this->getJson("/api/public/agencies/{$agence->slug}")
            ->assertOk()
            ->assertJsonPath('data.tagline', null)
            ->assertJsonPath('data.highlights', [])
            ->assertJsonPath('data.showcase', []);

        $this->assertSame([$r1->id, $r2->id, $r3->id], $this->idsDeCouverture($fiche->json('data.cover')));
        $this->assertNotContains($vieux->id, $this->idsDeCouverture($fiche->json('data.cover')));
        $this->assertSame(
            [$r1->id, $r2->id, $r3->id],
            $this->idsDeCouverture($this->getJson('/api/public/agencies')->json('data.0.cover')),
        );
    }

    public function test_un_bien_sans_photo_servable_est_saute_de_la_couverture(): void
    {
        $agence = $this->agence();
        $avec = $this->bien($agence, ['published_at' => now()->subDays(2)]);
        $this->bien($agence, ['published_at' => now()->subDay()], photo: false);

        $cover = $this->getJson("/api/public/agencies/{$agence->slug}")->json('data.cover');

        $this->assertSame([$avec->id], $this->idsDeCouverture($cover));
    }

    public function test_la_fiche_sert_accroche_trois_points_baux_du_mois_et_delai(): void
    {
        $agence = $this->agence([
            'tagline' => 'On loue à Dakar depuis 2014.',
            'highlights' => ['Équipe wolophone', 'Visites le samedi', 'Baux en ligne'],
        ]);
        $agence->forceFill(['median_response_minutes' => 42])->save();
        $this->bien($agence);
        Lease::factory()->count(2)->create(['agency_id' => $agence->id, 'signed_at' => now()->startOfMonth()->addMinute()]);
        Lease::factory()->create(['agency_id' => $agence->id, 'signed_at' => now()->startOfMonth()->subDay()]);
        Lease::factory()->create(['agency_id' => $agence->id, 'signed_at' => null]);

        $this->getJson("/api/public/agencies/{$agence->slug}")
            ->assertOk()
            ->assertJsonPath('data.tagline', 'On loue à Dakar depuis 2014.')
            ->assertJsonPath('data.highlights', ['Équipe wolophone', 'Visites le samedi', 'Baux en ligne'])
            ->assertJsonPath('data.leases_signed_this_month', 2)
            ->assertJsonPath('data.median_response_minutes', 42);

        $this->getJson('/api/public/agencies')
            ->assertOk()
            ->assertJsonPath('data.0.leases_signed_this_month', 2)
            ->assertJsonPath('data.0.median_response_minutes', 42)
            ->assertJsonMissingPath('data.0.tagline')
            ->assertJsonMissingPath('data.0.highlights');
    }

    public function test_l_agent_emet_ses_langues_ses_quartiers_et_son_delai_jamais_un_quartier_retire(): void
    {
        $agence = $this->agence();
        $agent = User::factory()->create(['username' => 'awa-diop', 'status' => 'active']);
        $mermoz = GeoNeighborhood::factory()->create(['name' => 'Mermoz']);
        $ngor = GeoNeighborhood::factory()->create(['name' => 'Ngor']);
        $profil = AgentProfile::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agence->id,
            'languages' => ['fr', 'wo', 'klingon'],
            'neighborhood_ids' => [$ngor->id, 999999999, $mermoz->id],
        ]);
        $profil->forceFill(['median_response_minutes' => 75])->save();
        $this->bien($agence, ['user_id' => $agent->id]);

        $attendu = [
            'languages' => ['fr', 'wo'],
            'neighborhood_ids' => [$ngor->id, $mermoz->id],
            'neighborhoods' => [['id' => $ngor->id, 'name' => 'Ngor'], ['id' => $mermoz->id, 'name' => 'Mermoz']],
            'median_response_minutes' => 75,
        ];

        $fiche = $this->getJson('/api/public/agents/awa-diop')->assertOk();
        foreach ($attendu as $cle => $valeur) {
            $this->assertSame($valeur, $fiche->json("data.{$cle}"), "fiche : {$cle}");
        }
        $index = $this->getJson('/api/public/agents')->assertOk();
        foreach ($attendu as $cle => $valeur) {
            $this->assertSame($valeur, $index->json("data.0.{$cle}"), "index : {$cle}");
        }
    }
}
