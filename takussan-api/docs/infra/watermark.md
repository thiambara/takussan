# Watermark auto-photos biens (TCK-106)

## Settings agence (`agencies.settings`)

| Clé | Type | Défaut | Description |
|-----|------|--------|-------------|
| `watermark_enabled` | boolean | `true` | Active/désactive le watermark automatique |
| `watermark_position` | string | `bottom_right` | Position : `bottom_right`, `bottom_left`, `bottom_center` |
| `watermark_opacity` | integer (10–100) | `60` | Opacité du watermark en pourcentage |

Modifier via `PATCH /api/agencies/{id}` :

```json
{
  "settings": {
    "watermark_enabled": true,
    "watermark_position": "bottom_right",
    "watermark_opacity": 60
  }
}
```

## Procédure régénération en lot

Après changement de logo ou de réglages watermark :

```bash
# Via API (recommandé)
curl -X POST https://api.takussan.com/api/agencies/{id}/regenerate-watermarks \
  -H "Authorization: Bearer {token}"

# Via Artisan (accès serveur)
php artisan tinker --execute="App\Jobs\Media\RegenerateAgencyWatermarksJob::dispatch(1)->onQueue('media');"
php artisan queue:work --queue=media --once
```

## Changement de logo

1. Uploader le nouveau logo : `POST /api/agencies/{id}/media` collection `logo`
2. Déclencher la régénération : `POST /api/agencies/{id}/regenerate-watermarks`
3. Attendre la queue `media` (vérifier avec `php artisan queue:work --queue=media`)

## Récupération des originaux (sans watermark)

Seuls les admins agence et super-admins peuvent récupérer les photos originales :

```
GET /api/properties/{id}?raw=1
Authorization: Bearer {admin_token}
```

Les visiteurs publics reçoivent `403 Forbidden`.

## Hors périmètre

- Mode `tile` — uniquement les 3 positions cardinales en V1
- Vidéos et PDF — jamais watermarkés
- UI de prévisualisation watermark
- Migration des photos existantes (opt-in via `/regenerate-watermarks`)
