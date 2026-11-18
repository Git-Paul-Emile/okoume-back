import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/generated', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: { ecmaVersion: 2023, globals: globals.node },
    rules: {
      'no-console': 'error',
      // Un middleware d'erreur Express doit déclarer ses quatre paramètres : `_` marque celui qui est inutilisé
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Règle de couches : seul un repository accède à la base de données
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/lib/prisma', '**/lib/prisma.js', '**/generated/**'],
              message: 'Accéder à la base uniquement depuis un fichier *.repository.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    // Points d'entrée (serveur, scripts en ligne de commande) : ils ferment la connexion en fin d'exécution
    files: ['**/*.repository.ts', 'src/lib/prisma.ts', 'src/server.ts', 'src/scripts/**', 'prisma/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Un service ne connaît pas HTTP : aucun import d'Express
    files: ['**/*.service.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'express', message: 'Un service ne dépend jamais d’Express.' }],
          patterns: [
            {
              group: ['**/lib/prisma', '**/lib/prisma.js', '**/generated/**'],
              message: 'Accéder à la base uniquement depuis un fichier *.repository.ts.',
            },
          ],
        },
      ],
    },
  },
);
