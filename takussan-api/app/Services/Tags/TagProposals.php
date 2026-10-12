<?php

namespace App\Services\Tags;

use App\Models\Enums\ReferentialStatus;
use App\Models\Enums\TagType;
use App\Models\Tag;
use App\Models\User;
use App\Support\CaseInsensitive;
use Illuminate\Support\Facades\DB;

/**
 * TCK-633 (ADR-0062 §7) — des noms tapés aux identifiants d'équipements.
 *
 *   · un nom connu, à la casse près (index `tags_name_lower_unique`) : l'existant — sauf s'il est
 *     REFUSÉ (ignoré : la modération a tranché) ou d'un autre type (422 `tags.name_taken` : le nom
 *     est unique tous types confondus) ;
 *   · un nom nouveau : une proposition `pending`, auteur noté.
 *
 * L'insertion passe par `insertOrIgnore` et non `create()` + `catch` : deux propositions
 * simultanées du même nom se croisent sur l'index unique, et sous PostgreSQL l'exception
 * attrapée ABANDONNE la transaction de la requête (piège n°1). Le second relit la ligne du premier.
 */
final class TagProposals
{
    private const ESSAIS = 3;

    /**
     * @param  array<int, string|null>  $noms
     * @return list<int>
     */
    public function resoudre(array $noms, User $auteur): array
    {
        $ids = [];
        $vus = [];

        foreach ($noms as $brut) {
            $nom = trim((string) preg_replace('/\s+/u', ' ', (string) $brut));
            $cle = CaseInsensitive::fold($nom);
            if ($nom === '' || isset($vus[$cle])) {
                continue;
            }
            $vus[$cle] = true;

            $tag = $this->parNom($nom) ?? $this->proposer($nom, $auteur);
            abort_code_if($tag->type !== TagType::Amenity, 422, 'tags.name_taken');
            if ($tag->status !== ReferentialStatus::Rejected) {
                $ids[] = $tag->id;
            }
        }

        return $ids;
    }

    private function parNom(string $nom): ?Tag
    {
        return Tag::query()->whereRaw(CaseInsensitive::sql('name').' = ?', [CaseInsensitive::fold($nom)])->first();
    }

    private function proposer(string $nom, User $auteur): Tag
    {
        for ($essai = 0; $essai < self::ESSAIS; $essai++) {
            $maintenant = now();
            DB::table('tags')->insertOrIgnore([
                'name' => $nom,
                'slug' => TagCatalog::slugLibre($nom),
                'type' => TagType::Amenity->value,
                'status' => ReferentialStatus::Pending->value,
                'created_by_id' => $auteur->id,
                'created_at' => $maintenant,
                'updated_at' => $maintenant,
            ]);
            $tag = $this->parNom($nom);
            if ($tag !== null) {
                return $tag;
            }
            // Ignorée sur le SLUG (une autre proposition l'a pris entre-temps) : on recalcule.
        }

        abort_code(422, 'tags.name_taken');
    }
}
