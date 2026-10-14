<?php

namespace App\Services\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Services\Geo\GeoReindexation;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * TCK-633 (ADR-0062 §7) — le catalogue des équipements et des étiquettes CRM, VERSIONNÉ ici et
 * chargé à chaque déploiement par `tags:sync-catalog` (la production ne lance aucun seeder, E-2).
 *
 * Règles, dans l'ordre :
 *   1. tout `feature` devient `amenity` (même identifiant : les liaisons tiennent) ;
 *   2. un nom absent est créé, approuvé ;
 *   3. un nom présent EN ATTENTE (une proposition que le catalogue reprend) est approuvé ;
 *   4. un nom présent REFUSÉ le reste : un refus de modération ne se défait pas par déploiement.
 * Le nom se compare comme l'index `tags_name_lower_unique` : casse repliée par ICU.
 */
final class TagCatalog
{
    public function __construct(private readonly GeoReindexation $reindexation) {}

    /** @var list<string> */
    public const EQUIPEMENTS = [
        'Piscine', 'Climatisation', 'Ascenseur', 'Parking', 'Garage', 'Balcon', 'Terrasse',
        'Toit-terrasse', 'Jardin', 'Cuisine équipée', 'Gardien', 'Vue sur mer', 'WiFi',
        'Fibre optique', 'TV', 'Machine à laver', 'Sèche-linge', 'Micro-ondes', 'Lave-vaisselle',
        'Sécurité 24/7', 'Caméras de surveillance', 'Portail électrique', 'Interphone',
        'Groupe électrogène', 'Panneaux solaires', 'Forage', 'Surpresseur', 'Citerne d\'eau',
        'Chauffe-eau', 'Ventilateurs', 'Moustiquaires', 'Chambre de bonne', 'Dépendance',
        'Salle de sport', 'Aire de jeux',
    ];

    /** @var list<string> */
    public const CRM = ['VIP', 'Prospect chaud', 'Étranger', 'Famille', 'Étudiant'];

    public function synchroniser(): void
    {
        DB::transaction(function () {
            Tag::query()->where('type', TagType::Feature->value)->update(['type' => TagType::Amenity->value, 'updated_at' => now()]);

            foreach (self::EQUIPEMENTS as $nom) {
                $this->assurer($nom, TagType::Amenity);
            }
            foreach (self::CRM as $nom) {
                $this->assurer($nom, TagType::Crm);
            }
        });
    }

    /** Un slug libre : `tags.slug` est unique tous types confondus. */
    public static function slugLibre(string $nom): string
    {
        $base = Str::limit(Str::slug($nom), 90, '') ?: 'etiquette';
        $slug = $base;
        for ($n = 2; Tag::query()->where('slug', $slug)->exists(); $n++) {
            $slug = $base.'-'.$n;
        }

        return $slug;
    }

    private function assurer(string $nom, TagType $type): void
    {
        $tag = Tag::query()->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])->first();

        if ($tag === null) {
            Tag::query()->create([
                'name' => $nom,
                'slug' => self::slugLibre($nom),
                'type' => $type,
                'status' => ReferentialStatus::Approved,
            ]);

            return;
        }

        if ($tag->status === ReferentialStatus::Pending) {
            $tag->forceFill(['status' => ReferentialStatus::Approved])->save();
            // Approuvée, la proposition devient visible — donc trouvable — sur tous ses biens.
            $this->reindexation->biens($tag->properties()->pluck('properties.id')->map(fn ($id) => (int) $id)->all());
        }
    }
}
