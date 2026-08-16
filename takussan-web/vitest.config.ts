import { defineConfig } from 'vitest/config';
import path from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Plafond par test — VALEUR MESURÉE, pas un réglage de confort (TCK-312, ardoise D-30bis).
    //
    // Les 5000 ms précédents n'avaient jamais été choisis : c'est le défaut de vitest. Il se
    // trouvait à ~6× du test le plus lent de la suite, alors que les tests d'interaction
    // ralentissent d'un facteur 12 à 17× sous contention CPU. Le défaut était donc sous la marge
    // nécessaire, et quatre tests de la console super-admin sortaient en
    // « Test timed out in 5000ms » quand la machine était chargée — en accusant le code
    // applicatif, qui n'y était pour rien.
    //
    // Mesures du 2026-08-16, machine à 8 cœurs :
    //   · au repos, sur 882 tests : AUCUN au-dessus de 1000 ms, 5 au-dessus de 500 ms.
    //     Le plus lent de toute la suite est AgencyOnboardingDialog à 822 ms.
    //   · sous 64 brûleurs CPU (charge 1-min montée à 105), les quatre tests visés par
    //     TCK-312 ralentissent d'un facteur 11,6× à 16,7× :
    //
    //         test                      au repos   sous charge   facteur
    //         AgencyOnboardingDialog       822 ms     11 773 ms    14,3×
    //         FeatureFlags (segments)      489 ms      6 739 ms    13,8×
    //         InviteSuperAdminModal        391 ms      6 518 ms    16,7×
    //         TemplateEditor               512 ms      5 928 ms    11,6×
    //
    // Poussé plus loin encore — suite entière rejouée 5 fois sous 64 brûleurs ET pendant qu'une
    // vraie suite backend tournait (charge 1-min 81 → 253, soit jusqu'à ~30× les cœurs) — le pire
    // cas réellement produit est 12 356 ms. 20 s laisse donc 1,6× de marge sur le pire cas
    // observé, et 24× sur le test le plus lent au repos.
    //
    // Ablation, dans les deux sens :
    //   · sans ce relèvement, sous cette charge, les quatre tests sortent en « timed out in
    //     5000ms » (mesuré : ils tournent à 110–247 % de l'ancien plafond). Il n'est donc pas
    //     décoratif.
    //   · avec lui, dans la condition que vise le ticket (suites back et front simultanées,
    //     charge ~25), 5 exécutions consécutives rendent 882/882, et les quatre tests
    //     redescendent à 13–35 % du plafond.
    //
    // Ce plafond ne retarde PAS le signalement d'une vraie régression : chaque assertion
    // asynchrone de la suite passe par `waitFor`/`findBy*` de Testing Library, dont le délai
    // propre est de 1000 ms et n'est pas touché ici. Vérifié par ablation : un mock rendu muet
    // fait échouer le test en 1310 ms, avec son message d'assertion. Ce plafond-ci ne se
    // déclenche que lorsque les interactions elles-mêmes sont lentes — c'est-à-dire exactement
    // sur le faux positif qu'on veut supprimer.
    //
    // ⚠ Ce délai de 1000 ms est, lui aussi, un défaut de framework jamais mesuré pour cette
    // suite. Il tient sous la charge que vise TCK-312, mais à ~4× celle-ci un test rougit
    // dessus. Mesuré et ticketé à part : TCK-313. Ne pas le relever sans cette mesure.
    testTimeout: 20_000,
  },
});
