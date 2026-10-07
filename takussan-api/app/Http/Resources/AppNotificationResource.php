<?php

namespace App\Http\Resources;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Http\Resources\Bases\BaseResource;
use App\Models\AppNotification;
use App\Services\Notifications\NotificationRenderer;
use Illuminate\Http\Request;

/**
 * TCK-588 (ADR-0032) — une notification sur le fil : son code, ses paramètres BRUTS et sa
 * cible, plus `title`/`body` rendus À LA LECTURE dans la langue négociée de la requête.
 *
 * Une ligne écrite pour un destinataire `fr` et lue en `Accept-Language: en` rend donc un titre
 * anglais : la cloche ne fige plus la langue d'écriture. `title`/`body` servent de repli au
 * front, qui rend par code ; une ligne sans code rend ses colonnes stockées.
 *
 * Champs clairsemés : `fields[app_notifications]=id,code,…` ne rend que ces clés.
 *
 * @mixin AppNotification
 */
class AppNotificationResource extends BaseResource
{
    public const FIELDS = [
        'id', 'type', 'code', 'params', 'target', 'title', 'body', 'data',
        'is_read', 'read_at', 'sent_at', 'created_at',
    ];

    public function toArray(Request $request): array
    {
        $fields = self::requestedFields($request);
        $want = fn (string $field): bool => $fields === null || in_array($field, $fields, true);

        $code = is_string($this->code) ? NotificationCode::tryFrom($this->code) : null;

        $out = [
            'id' => $this->id,
            'type' => $this->enumValue($this->type),
            'code' => $this->code,
            'params' => $this->params,
            'target' => $want('target') ? NotificationTarget::forRow($this->resource)?->toArray() : null,
            'title' => $want('title') ? $this->rendered($code, 'title', $request) ?? $this->title : null,
            'body' => $want('body') ? $this->rendered($code, 'body', $request) ?? $this->body : null,
            'data' => $this->data,
            'is_read' => (bool) $this->is_read,
            'read_at' => $this->iso($this->read_at),
            'sent_at' => $this->iso($this->sent_at),
            'created_at' => $this->iso($this->created_at),
        ];

        return $fields === null ? $out : array_intersect_key($out, array_flip($fields));
    }

    /**
     * Les champs demandés, ou null pour tous. `id` est toujours rendu.
     *
     * @return list<string>|null
     */
    public static function requestedFields(Request $request): ?array
    {
        $raw = $request->input('fields.app_notifications');
        if (! is_string($raw) || trim($raw) === '') {
            return null;
        }
        $fields = array_values(array_intersect(self::FIELDS, array_map('trim', explode(',', $raw))));

        return array_values(array_unique(['id', ...$fields]));
    }

    private function rendered(?NotificationCode $code, string $surface, Request $request): ?string
    {
        if ($code === null) {
            return null;
        }
        $user = $request->user();

        return app(NotificationRenderer::class)->render(
            $code,
            is_array($this->params) ? $this->params : [],
            app()->getLocale(),
            $user?->timezone,
            $surface,
            $user?->first_name,
        );
    }
}
