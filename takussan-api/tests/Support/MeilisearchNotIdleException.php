<?php

namespace Tests\Support;

use RuntimeException;

/**
 * Levée quand la file de tâches de Meilisearch ne s'est pas vidée dans le
 * délai imparti.
 *
 * Le nom compte : quand ce type apparaît dans une sortie de test, le défaut
 * est dans le HARNAIS (moteur saturé, lent, ou indisponible), pas dans le code
 * applicatif que le test prétend couvrir.
 */
class MeilisearchNotIdleException extends RuntimeException {}
