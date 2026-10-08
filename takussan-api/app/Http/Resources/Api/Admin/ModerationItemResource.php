<?php

namespace App\Http\Resources\Api\Admin;

use App\Http\Resources\Bases\BaseResource;
use App\Services\Admin\UnifiedModerationService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class ModerationItemResource extends BaseResource
{
    /**
     * ⚠ La ressource enveloppe un **tableau**, pas un modèle Eloquent.
     *
     * `UnifiedModerationService::unionQuery()` construit trois `DB::table(…)->selectRaw(…)` unis,
     * et `reported_at` / `created_at` y arrivent donc en **chaîne SQL brute**, jamais castées :
     * `2026-08-20 13:16:05`. C'était une CINQUIÈME forme de date sur le fil — ni `T`, ni fuseau —
     * et elle échappait à tout : aucune conversion écrite à la main à repérer, aucun cast de modèle
     * à consulter, juste une valeur recopiée telle quelle.
     *
     * Le coût, mesuré le 2026-08-20 : `new Date('2026-08-20 13:16:05')` est parsé par le navigateur
     * comme une heure **locale**, quand `new Date('…T13:16:05+00:00')` est parsé en UTC. Sous
     * `TZ=Europe/Paris` les deux diffèrent de **2 heures** ; sous `TZ=UTC`, de zéro — donc invisible
     * sur la machine de développement, et faux chez l'utilisateur sénégalais comme chez le
     * développeur européen.
     *
     * `Carbon::parse()` est donc ici le cast que la requête n'a pas fait, pas une conversion de
     * confort : c'est la seule façon de rendre à `iso()` le `DateTimeInterface` qu'il exige.
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource['id'],
            'type' => $this->resource['type'],
            'source_type' => $this->resource['source_type'],
            // TCK-597 (ADR-0043 §4) — les seules décisions valides pour CE type d'élément : le
            // front n'en propose pas d'autre, et n'en tient pas de copie.
            'decisions' => UnifiedModerationService::DECISIONS[$this->resource['source_type']] ?? [],
            'status' => $this->resource['status'],
            'subject_type' => $this->resource['subject_type'],
            'subject_id' => $this->resource['subject_id'],
            'subject' => $this->resource['subject'],
            'reporter' => $this->resource['reporter'],
            'agency' => $this->resource['agency'],
            'reason' => $this->resource['reason'],
            'reported_count' => $this->resource['reported_count'],
            'suspicious' => (bool) ($this->resource['suspicious'] ?? false),
            'duplicate' => $this->resource['duplicate'] ?? null,
            'claim' => $this->claim(),
            'reported_at' => $this->iso($this->instant('reported_at')),
            'created_at' => $this->iso($this->instant('created_at')),
            // TCK-597 — l'âge de l'élément dans la file, en minutes, calculé par le serveur.
            'age_minutes' => ($reportedAt = $this->instant('reported_at')) ? (int) max(0, $reportedAt->diffInMinutes(now())) : null,
        ];
    }

    /** @return array<string, mixed>|null */
    private function claim(): ?array
    {
        $claim = $this->resource['claim'] ?? null;
        if ($claim === null) {
            return null;
        }

        return [
            'by' => $claim['by'],
            'claimed_at' => $this->iso($claim['claimed_at']),
            'expires_at' => $this->iso($claim['expires_at']),
        ];
    }

    /** La chaîne SQL brute de la ligne d'union, rendue en instant — ou `null` si la colonne l'est. */
    private function instant(string $cle): ?Carbon
    {
        $valeur = $this->resource[$cle] ?? null;

        if ($valeur === null || $valeur === '') {
            return null;
        }

        return $valeur instanceof Carbon ? $valeur : Carbon::parse($valeur);
    }
}
