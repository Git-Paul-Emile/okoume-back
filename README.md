# API Okoumé

API de la boutique : Node.js 22 ou plus récent, Express 5, TypeScript strict, Zod, Prisma 7 sur PostgreSQL.
L'organisation suit `../rules/10-stack/structure-backend.md` et l'ordre des couches de `../rules/00-socle/architecture.md`.

## Démarrage

```bash
npm install
cp .env.example .env    # puis renseigner les valeurs
npm run db:up           # base PostgreSQL de développement dans Docker (port 5433)
npm run prisma:generate
npm run dev             # API
npm run dev:worker      # traitements différés (e-mails), dans un second terminal
```

- `GET /health` : l'application répond (sonde de vie).
- `GET /ready` : les dépendances critiques répondent, sinon 503 (sonde de disponibilité).
- Routes métier sous `/api/v1`.

Sans Docker, une base PostgreSQL locale convient (PostgreSQL 18 installé avec pgAdmin, port 5432) : créer la base
`okoume_dev`, indiquer sa chaîne dans `DATABASE_URL` (un espace du mot de passe s'écrit `%20`), puis :

```bash
npx prisma migrate deploy   # applique toutes les migrations
npm run db:seed             # données de référence et de démonstration (SEED_DEMO_PASSWORD obligatoire)
npm run media:import        # envoie chez Cloudinary les images encore hébergées ailleurs, réécrit la base
```

`npm run media:import` est rejouable : une image déjà chez Cloudinary est ignorée. Il échoue (code 1) si une image
reste introuvable, en la nommant dans les logs.
L'application refuse de démarrer si une variable obligatoire manque ou est invalide (`src/config/env.ts`).

## Scripts

| Script                                  | Rôle                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`                           | Démarrage avec rechargement (`npm run dev \| npx pino-pretty` pour des logs lisibles) |
| `npm run build` puis `npm start`        | Compilation dans `dist/` puis démarrage                                               |
| `npm run typecheck`                     | Vérification des types                                                                |
| `npm run lint` / `npm run format:check` | ESLint et Prettier                                                                    |
| `npm test`                              | Tests (ordre aléatoire)                                                               |
| `npm run prisma:migrate`                | Nouvelle migration en développement                                                   |
| `npm run prisma:deploy`                 | Applique les migrations (staging, production)                                         |
| `npm run db:seed`                       | Remplit la base depuis `prisma/seeders/data` (rejouable)                              |

## Base hébergée (Neon)

- `DATABASE_URL` : chaîne « pooled » (hôte en `-pooler`), utilisée par l'application.
- `DIRECT_DATABASE_URL` : chaîne directe, utilisée par les migrations (`prisma.config.ts`) et plus tard par la file de traitements.

## Données de départ (seed)

`prisma/seeders/` contient les données de départ : un fichier JSON par donnée dans `data/`, un
seeder par table dans `<donnée>.seeder.ts`, et `index.ts` qui les enchaîne dans l'ordre des relations.

```bash
npm run prisma:deploy   # tables à jour
npm run db:seed         # données (SEED_DEMO_PASSWORD requis hors production)
```

- Rejouable : chaque ligne reçoit un identifiant stable dérivé de son ancien identifiant, et seules les lignes
  absentes sont créées. Une ligne existante n'est jamais modifiée.
- Données de référence (réglages, quartiers de livraison, rôles personnalisés) : chargées partout.
- Données de démonstration (comptes, catalogue, codes promo, livreurs, commandes, points) : jamais en production.
  Tous les comptes de démonstration ont le mot de passe `SEED_DEMO_PASSWORD` ; aucun mot de passe n'est versionné.
- `seed-data.test.ts` vérifie sans base les schémas, les références, les unicités et les contraintes CHECK.
- Écarts voulus avec les données d'origine du prototype : le code `LIVRAISON0` (livraison offerte sans remise) est
  ignoré car l'API exige une remise d'au moins 1 ; la clé d'idempotence d'une commande vaut `seed:<id>` (celles
  d'origine n'étaient pas uniques) ; l'adresse `grâce.obame@exemple.ga` est devenue `grace.obame@exemple.ga`.
- Contenus (`content.seeder.ts`) : bannières, espaces publicitaires, offres exclusives et articles, en données de
  démonstration (les offres visent le catalogue fictif).
- Tables créées mais pas encore de seeder, fichiers prêts dans `data/` : avis et signalements, demandes
  d'assistance, demandes RGPD. Pas encore de table : demandes de zone, règles de l'assistant. Pas repris : adresses et favoris
  des clients, factures des commandes déjà payées, statistiques et journaux du prototype.

## Place de marché : boutiques et offres d'accès (lot 9.1)

Section 32 du cahier des charges. Un client à l'adresse vérifiée ouvre une boutique (une par compte) en
choisissant une offre d'accès configurée par l'administration.

| Route                               | Qui                 | Rôle                                                     |
| ----------------------------------- | ------------------- | -------------------------------------------------------- |
| `GET /access-plans`                 | public              | Offres actives                                           |
| `GET /shops/:slug`                  | public              | Fiche publique (404 si suspendue ou sans accès en cours) |
| `POST`, `GET`, `PATCH /seller/shop` | client connecté     | Ouvrir, consulter, modifier sa boutique                  |
| `PUT /seller/shop/plan`             | client connecté     | Passer sur une offre gratuite                            |
| `POST`, `GET /seller/shop/payments` | client connecté     | Déclarer un paiement Mobile Money, historique            |
| `/staff/access-plans`               | `vendeurs:modifier` | Créer, modifier, désactiver une offre                    |
| `/staff/shops`                      | `vendeurs:valider`  | Suspendre, réactiver, badge « Vendeur vérifié »          |
| `/staff/shop-payments`              | `vendeurs:valider`  | Valider ou refuser un paiement déclaré                   |
| `/staff/settings/marketplace`       | `vendeurs:modifier` | Délai de grâce et préavis du rappel                      |

- États de l'accès (`src/features/shops/shops.rules.ts`) : essai, actif, grâce, expiré, en attente de paiement,
  suspendu. Les annonces ne seront visibles que pendant l'essai, l'accès et la grâce ; jamais supprimées.
- Une offre payante avec essai démarre l'essai à l'ouverture ; sans essai, la boutique attend un paiement validé.
- Paiement : le vendeur paie hors plateforme puis déclare la référence ; rien n'est ouvert avant validation. Le
  montant doit être celui de l'offre. La période validée suit celle en cours, essai compris : aucun jour perdu.
- La base garantit un seul paiement en attente par boutique et une référence de transaction utilisée une fois.
- Job quotidien `shops.access-reminders` (8 h, Libreville) : un rappel par échéance, e-mail et notification.
- Le vendeur est prévenu (e-mail obligatoire, notification selon ses réglages, sujet `shop`) de chaque décision.
- Seed : offre « Accès gratuit » seule. Les offres payantes et leurs prix se créent depuis l'administration.

## Place de marché : annonces, vérification par IA et modération (lot 9.2)

Section 32.3 du cahier des charges. Cycle d'une annonce : brouillon, vérification, publiée ; ou correction
demandée, modération humaine, refusée (décision humaine définitive), retirée par le vendeur.

| Route                                 | Qui                | Rôle                                                    |
| ------------------------------------- | ------------------ | ------------------------------------------------------- |
| `GET /listings/:slug`                 | public             | Annonce publiée d'une boutique visible (404 sinon)      |
| `GET /shops/:slug/listings`           | public             | Annonces publiées d'une boutique                        |
| `POST /listings/:slug/reports`        | client connecté    | Signaler une annonce (un signalement ouvert par client) |
| `POST /seller/listings/photo-uploads` | vendeur            | Autorisation d'envoi d'une photo vers Cloudinary        |
| `POST`, `GET /seller/listings`        | vendeur            | Créer un brouillon, lister ses annonces                 |
| `GET`, `PATCH /seller/listings/:id`   | vendeur            | Consulter (avec le dernier avis), modifier              |
| `PATCH /seller/listings/:id/status`   | vendeur            | `submit` (vérification) ou `withdraw` (retrait)         |
| `/staff/listings`                     | `vendeurs:valider` | File de modération, publier, corriger, refuser, masquer |
| `/staff/listing-reports`              | `vendeurs:valider` | Signalements ouverts, classement                        |

- Vérification : à la soumission, le job `listings.review` envoie l'annonce et ses photos au modèle (Anthropic,
  `LISTING_REVIEW_MODEL`, par défaut `claude-opus-5-5`) avec une sortie structurée. L'IA publie, demande une
  correction ou transmet à une personne ; elle ne refuse jamais seule (contrainte `listing_reviews_staff_complete`).
- L'avis ne s'applique qu'à la version examinée : une annonce modifiée entre-temps garde son nouvel examen.
- Un refus du modèle ou une réponse illisible part en modération humaine (pas de repli sur un autre modèle : un
  refus est un signal à examiner). Une panne est reprise par la file ; après les reprises, modération humaine.
- Sans `ANTHROPIC_API_KEY`, chaque annonce soumise attend une décision humaine. Plafond mensuel réglable
  (`/staff/settings/marketplace`, `aiReviewMonthlyLimit`, 1 000 par défaut) : au-delà, modération humaine.
- Une modification du prix, des photos, de la description, du titre ou de la catégorie d'une annonce publiée la
  renvoie en vérification (elle est masquée pendant l'examen). Une annonce en modération ne se modifie pas.
- Photos : seules les images de notre compte Cloudinary sont acceptées quand il est configuré, pour qu'une photo
  vérifiée ne puisse pas être remplacée ailleurs.
- Historique complet des vérifications (`listing_reviews`), modèle utilisé compris, consultable par l'équipe.

## Place de marché : recherche et proximité (lot 9.3)

Section 32.4 du cahier des charges. Seules les annonces publiées d'une boutique visible sont retenues.

| Route                     | Rôle                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /listings`           | Recherche sans position, mise en cache une minute ; partageable par lien                   |
| `POST /listings/searches` | Recherche avec la position de l'acheteur (`position`, `maxKm` facultatif), jamais en cache |

- Critères : `search` (titre et description), `category` (sous-catégories et collections comprises), `kind`,
  `condition` (plusieurs, séparés par des virgules en GET), `city`, `district`, `minPrice`, `maxPrice`, `sort`
  (`relevance`, `-publishedAt`, `price`, `-price`, `distance`), `page`, `limit`.
- Classement par défaut : les plus proches d'abord avec une position ; sinon pertinence pour une recherche par
  mots (titre qui commence par les mots cherchés en premier), puis les plus récentes.
- Position de l'acheteur : envoyée seulement en POST, dans le corps de la requête, que les journaux n'enregistrent
  pas (une adresse de requête, elle, reste dans les journaux des serveurs et des intermédiaires). Elle est arrondie
  au centième de degré (environ 1 km) avant tout calcul, puis oubliée : ni conservée ni associée au compte.
- Distance renvoyée arrondie au kilomètre, jamais moins de 1 km ; la position de la boutique n'est jamais renvoyée.
  Une boutique sans position est classée après les autres et n'apparaît pas dans une recherche avec rayon.
- Calcul : formule de haversine en SQL paramétré, après un préfiltre par rectangle sur l'index `shops_position`.
- Les produits de la boutique Okoumé ont leur propre recherche (`GET /products`) : le filtre « type de vendeur »
  du cahier des charges consiste, côté front, à interroger l'une, l'autre ou les deux.

## Place de marché : demandes de commande (lot 9.4)

Section 32.7 du cahier des charges. Okoumé suit le statut de la demande ; le paiement se fait directement entre
l'acheteur et le vendeur, hors plateforme. Aucun statut ne présente une demande comme payée.

| Route                                  | Qui             | Rôle                                                            |
| -------------------------------------- | --------------- | --------------------------------------------------------------- |
| `POST /listing-requests`               | client connecté | Envoyer une demande (`listingSlug`, quantité, paiement, remise) |
| `GET /listing-requests`, `GET /:id`    | client connecté | Ses demandes et leur historique                                 |
| `PATCH /listing-requests/:id`          | client connecté | `cancel` tant que la vente n'est pas conclue                    |
| `GET /seller/listing-requests`, `/:id` | vendeur         | Demandes reçues par sa boutique                                 |
| `PATCH /seller/listing-requests/:id`   | vendeur         | `accept`, `refuse` (motif), `conclude`, `not_concluded` (motif) |

- Statuts : envoyée, acceptée, refusée, annulée, conclue, non conclue. Chaque changement est historisé
  (`listing_request_events`) et notifié : l'acheteur sous le sujet « commandes », le vendeur sous « boutique ».
- Conditions de vente de la boutique (`acceptedPaymentMethods`, `handoverModes`, réglables par `PATCH
/seller/shop`) : la demande choisit parmi elles. Prix : celui de l'annonce (le prix négocié viendra au lot 9.5).
- Coordonnées : le téléphone de l'acheteur n'est montré au vendeur, et celui de la boutique à l'acheteur, qu'après
  acceptation. L'adresse e-mail de l'acheteur n'est jamais montrée au vendeur.
- Une seule demande ouverte (envoyée ou acceptée) par acheteur et par annonce, garantie par la base.
- Accepter vérifie la quantité disponible ; conclure la retire de l'annonce dans la même transaction. Une annonce
  épuisée passe « vendue » : hors de la recherche, fiche toujours consultable (`sold: true`), sans demande
  possible. Un réassort (quantité modifiée) la remet en ligne sans nouvelle vérification.
- Pas de facture ni de retour pour ces ventes (sections 14 et 25.4) : les garanties relèvent du vendeur.

## Place de marché : tchat et négociateur IA (lot 9.5)

Section 32.5 du cahier des charges. Le tchat demande un compte ; le premier message avertit l'acheteur qu'il
échange avec une intelligence artificielle.

| Route                                        | Qui             | Rôle                                                          |
| -------------------------------------------- | --------------- | ------------------------------------------------------------- |
| `POST /conversations`                        | client connecté | Ouvrir (ou retrouver) le tchat d'une annonce                  |
| `GET /conversations`, `GET /:id?since=`      | client connecté | Conversations ; nouveaux messages depuis une date             |
| `POST /conversations/:id/messages`           | client connecté | Écrire ; la réponse arrive par le job `chat.reply`            |
| `PATCH /conversations/:id`                   | client connecté | `close`                                                       |
| `GET /seller/conversations?needsSeller=true` | vendeur         | Questions qui attendent le vendeur                            |
| `POST /seller/conversations/:id/messages`    | vendeur         | Répondre lui-même                                             |
| `PUT /seller/conversations/:id/agreement`    | vendeur         | Proposer un prix (sa décision : le minimum ne s'applique pas) |

- Négociation : le vendeur règle par annonce un prix minimum (`minPrice`) ou une réduction maximale
  (`maxDiscountPercent`, converti en prix minimum), et ses consignes (`sellerNotes`). Ni l'un ni l'autre n'est public.
- Le modèle ne reçoit jamais le prix minimum : il répond aux questions, comprend l'intention de l'acheteur et
  extrait le prix proposé. Le serveur décide (`chat.rules.ts`) : offre au moins égale au minimum acceptée, sinon
  refus rédigé par le serveur, sans montant. Une réponse libre qui citerait un prix plus bas est remplacée.
- Prix convenu : enregistré dans la conversation, valable 48 h par défaut (`agreementValidityHours`), appliqué
  automatiquement par la demande de commande.
- Pas de réponse fiable, plafond mensuel atteint (`aiChatMonthlyLimit`, 5 000 par défaut), pas de clé ou panne
  après reprises : la question est transmise au vendeur (`needsSeller`), prévenu par notification.
- Une seule réponse de l'assistant par message de l'acheteur (garantie par la base), au dernier message seulement.
  Au plus 30 messages par acheteur sur 10 minutes. Modèle réglable : `CHAT_MODEL` (par défaut `claude-opus-5-5`).
- Suivi des nouveaux messages par interrogation régulière (`since`) ; une connexion temps réel pourra la remplacer.

## Place de marché : espace vendeur et partage (lot 9.6)

Sections 32.8 et 32.9 du cahier des charges.

| Route                                | Qui     | Rôle                                                                  |
| ------------------------------------ | ------- | --------------------------------------------------------------------- |
| `GET /seller/dashboard`              | vendeur | Accès, annonces par état, demandes et questions en attente, visites   |
| `GET /seller/dashboard/listings/:id` | vendeur | Visites d'une annonce jour par jour sur 30 jours                      |
| `GET /seller/listings/:id/share`     | vendeur | Lien, texte prêt à envoyer, liens de partage WhatsApp et Facebook     |
| `GET /partage/annonces/:slug`        | public  | Page d'aperçu (Open Graph) pour les réseaux, puis redirection au site |

- Visites : un compteur par annonce et par jour (heure de Libreville), sans aucune donnée sur le visiteur. Les
  consultations du vendeur sur sa propre annonce ne comptent pas. Les rechargements comptent chacun.
- Partage manuel : le vendeur copie le lien ou ouvre le menu de partage ; Okoumé ne publie rien sur ses comptes.
  Avec `API_PUBLIC_URL`, le lien partagé mène à la page d'aperçu (titre, photo, prix), qui redirige vers
  `APP_URL/annonces/:slug` ; sans elle, le lien mène directement au site, sans aperçu.

## Place de marché : mise en avant payante (lot 9.7)

Section 32.10 du cahier des charges. Distincte des campagnes Facebook et Instagram : l'annonce est marquée
« Sponsorisé » dans la recherche d'Okoumé, rien n'est publié ailleurs.

| Route                              | Qui                 | Rôle                                                  |
| ---------------------------------- | ------------------- | ----------------------------------------------------- |
| `GET /boost-plans`                 | public              | Offres actives (durée, prix)                          |
| `POST /seller/listings/:id/boosts` | vendeur             | Déclarer le paiement Mobile Money d'une mise en avant |
| `GET /seller/boosts`               | vendeur             | Historique de ses mises en avant                      |
| `/staff/boost-plans`               | `vendeurs:modifier` | Créer, modifier, désactiver une offre                 |
| `/staff/boosts`                    | `vendeurs:valider`  | Valider ou refuser un paiement déclaré                |

- Rien n'est actif avant la validation ; le montant doit être celui de l'offre. Une période validée suit la mise en
  avant en cours de l'annonce. Une référence de transaction ne sert qu'une fois, abonnements compris.
- Recherche : les annonces mises en avant passent en tête du classement par défaut (`sponsored: true`). Un tri
  choisi par l'acheteur (prix, distance) est respecté tel quel ; filtres et modération s'appliquent toujours.
- Campagnes Meta : pas encore développées. Prérequis côté Meta, à obtenir par le propriétaire : une application
  Meta (developers.facebook.com) avec le produit Marketing API, l'entreprise vérifiée dans le Business Manager,
  l'autorisation `ads_management` validée par Meta (App Review) et le niveau d'accès adapté. En attendant, le
  vendeur crée sa campagne dans les outils de Meta à partir du lien de partage (lot 9.6).

## IA : fournisseur

Vérification des annonces et tchat passent par une interface interne ; le fournisseur se choisit par la
configuration du worker : Gemini si `GEMINI_API_KEY` est renseignée (modèle `GEMINI_MODEL`), sinon Anthropic si
`ANTHROPIC_API_KEY` l'est, sinon décision humaine (annonces) et réponse du vendeur (tchat). Consignes et formats de
réponse sont communs (`listingReviewPrompt.ts`, `chatPrompt.ts`).

- Gemini reçoit les photos en données : le worker ne les télécharge que depuis le compte Cloudinary de la boutique
  (`CLOUDINARY_CLOUD_NAME`), jamais depuis une autre adresse (protection SSRF). Sans Cloudinary, vérification sur le
  texte seul.

## Images (Cloudinary)

Le navigateur envoie l'image directement à Cloudinary, avec une autorisation signée par l'API : le fichier ne passe
pas par le serveur et le secret ne quitte jamais l'API.

1. `POST /api/v1/staff/media/upload-signatures` avec `{ "folder": "products" | "categories" | "banners" }`
   (droit `catalogue:modifier`). Réponse : `uploadUrl`, `fields`, `expiresAt` (une heure).
2. Le navigateur envoie un formulaire multipart vers `uploadUrl` : tous les `fields` plus `file`.
3. Cloudinary répond avec `secure_url`, l'adresse à enregistrer sur le produit.

- Signés et donc imposés : le dossier (`okoume/<NODE_ENV>/<dossier>`, un compte pour tous les environnements)
  et les formats (jpg, jpeg, png, webp, avif).
- La taille maximale ne se signe pas : la régler dans la console Cloudinary et la vérifier dans le front.
- Sans les trois variables `CLOUDINARY_*`, la route répond 503.

## File de traitements

Les tâches lentes sortent du cycle requête / réponse par une file pg-boss, stockée dans PostgreSQL
(schéma `pgboss`, à part des tables métier). Aucun service de plus à héberger.

- L'API dépose les jobs ; le worker (`src/worker.ts`) les exécute et surveille les files. Les deux se lancent séparément.
- Catalogue des jobs et de leurs données : `src/infrastructure/queue/jobs.ts`. Réglages : `src/infrastructure/queue/pgBossQueue.ts`.
- `email.send` : 7 essais au total, backoff exponentiel de 30 secondes à 30 minutes, 60 secondes maximum par envoi.
  L'identifiant du job sert de clé d'idempotence chez Resend : une reprise ne produit jamais un second e-mail.
- Après toutes les reprises, le job passe dans `email.send.dead` : erreur journalisée au niveau `error`, job gardé 7 jours.
- Les e-mails contiennent des codes de vérification : un job réussi est supprimé au bout d'une heure.

En développement sans `RESEND_API_KEY`, c'est le worker qui écrit les e-mails et leurs codes dans ses logs.

## Notifications push

Web Push standard (clés VAPID, bibliothèque `web-push`) : aucun compte chez un fournisseur, gratuit.

- Générer les clés une fois : `npx web-push generate-vapid-keys`, puis remplir `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` dans `.env` (les trois ou aucune). Sans clés, le push est désactivé et
  les e-mails continuent ; `GET /api/v1/push/public-key` renvoie alors `publicKey: null`.
- Routes : `GET /push/public-key`, `POST` et `DELETE /push/subscriptions` (client connecté),
  `POST` et `DELETE /staff/push/subscriptions` (équipe), `GET` et `PATCH /notification-preferences`.
- Déclencheurs : chaque étape suivie de la commande d'un client connecté (sujet « commandes ») et chaque nouvelle
  commande pour l'équipe qui a le droit `commandes:consulter`. Aucune coordonnée du client dans les messages.
- Job `push.send` : 5 essais, de 1 à 15 minutes, abandon après une heure. Chaque appareil servi est noté avant
  l'envoi (`push_deliveries`) : une reprise ne renvoie rien en double. Un appareil désabonné (404, 410) est supprimé.
- Seules les adresses `https` des services push des navigateurs (Google, Mozilla, Apple, Microsoft) sont acceptées :
  le worker ne peut pas être amené à appeler une adresse interne.

## Authentification

Les jetons voyagent uniquement dans des cookies HttpOnly, SameSite=Lax, Secure en production. Toute modification
faite avec un cookie de session doit renvoyer la valeur du cookie `ok_csrf` dans l'en-tête `X-CSRF-Token`.

Limitation de débit par adresse IP, sur 15 minutes (`src/core/middlewares/rateLimiters.ts`) :

- boutique et API publique : `RATE_LIMIT_API_MAX` (300 par défaut) ;
- back-office (`/api/v1/staff`) : compteur à part, `RATE_LIMIT_STAFF_MAX` (3 000 par défaut), car ses écrans
  chargent beaucoup de données et l'équipe partage souvent la même connexion ;
- connexion, inscription, mot de passe oublié, suivi sans compte : 10 essais, valeur fixe ;
- passage de commande : 20, valeur fixe.

Clients, sous `/api/v1/auth` :

| Route                                 | Rôle                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `POST /registrations`                 | Inscription ; réponse identique que l'adresse soit libre ou non (202)                    |
| `POST /verifications`                 | Code reçu par e-mail : le compte devient actif et la session s'ouvre                     |
| `POST /verification-codes`            | Nouveau code de confirmation                                                             |
| `POST /sessions`                      | Connexion par e-mail ou téléphone ; même erreur pour compte inconnu ou mot de passe faux |
| `POST /sessions/refresh`              | Renouvellement : jeton remplacé à chaque usage, réutilisation = famille révoquée         |
| `DELETE /sessions/current`            | Déconnexion                                                                              |
| `GET /me`                             | Compte connecté                                                                          |
| `POST /password-resets`               | Demande de nouveau mot de passe (réponse identique dans tous les cas)                    |
| `POST /password-resets/confirmations` | Nouveau mot de passe ; toutes les sessions sont fermées                                  |

Équipe, sous `/api/v1/staff/auth` :

| Route                                 | Rôle                                                              |
| ------------------------------------- | ----------------------------------------------------------------- |
| `POST /challenges`                    | Étape 1 : mot de passe, un code est envoyé par e-mail             |
| `POST /sessions`                      | Étape 2 : code reçu ou code de secours (usage unique)             |
| `POST /sessions/refresh`              | Renouvellement (session de 60 minutes d'inactivité)               |
| `DELETE /sessions/current`            | Déconnexion                                                       |
| `GET /me`                             | Membre connecté, rôles et droits                                  |
| `POST /backup-codes`                  | Nouveaux codes de secours, affichés une seule fois                |
| `POST /invitations/:token/codes`      | Invitation, étape 1 : code envoyé à l'adresse invitée             |
| `POST /invitations/:token/acceptance` | Invitation, étape 2 : mot de passe choisi, codes de secours remis |

Compte du client connecté, sous `/api/v1/me` (2.2, 3.6) :

| Route                          | Rôle                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `PATCH /`                      | Prénom et nom ; l'e-mail et le téléphone ne changent pas ici                          |
| `GET /addresses`               | Adresses de livraison, celle par défaut en tête                                       |
| `POST /addresses`              | Nouvelle adresse ; la première devient celle par défaut ; plafond `max_addresses` (5) |
| `PATCH /addresses/:id`         | Modification ; `isDefault: true` en fait l'adresse par défaut                         |
| `DELETE /addresses/:id`        | Suppression ; si c'était celle par défaut, la plus ancienne restante prend le relais  |
| `GET /favorites`               | Identifiants des produits favoris encore en vente, du plus récent au plus ancien      |
| `PUT /favorites/:productId`    | Ajout idempotent d'un produit publié ; 200 favoris au plus                            |
| `DELETE /favorites/:productId` | Retrait idempotent                                                                    |

La date et le cadeau d'anniversaire passent par `PUT /api/v1/loyalty/preferences`, les notifications par
`/api/v1/notification-preferences`. Pas encore dans l'API : changement d'e-mail ou de téléphone, produits
récemment consultés, rattachement d'une commande passée sans compte, export et suppression des données.

**Cookie anti-CSRF entre sous-domaines.** Le cookie `ok_csrf` est posé par l'API ; le site doit pouvoir le lire
pour le renvoyer. En production, `COOKIE_DOMAIN=.okoume.ga` attache les cookies au domaine commun
(`okoume.ga` et `api.okoume.ga`). Les jetons de session restent HttpOnly. En local, laisser la variable vide.

Les droits de l'équipe sont relus en base à chaque requête (`requireStaff`, puis `requirePermission('domaine:action')`) :
une suspension ou un changement de rôle s'applique immédiatement.

## Catalogue et commandes

Routes publiques, sous `/api/v1` :

| Route                 | Rôle                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /categories`     | Arborescence et collections                                                                                                                                                                    |
| `GET /products`       | Catalogue publié : `search`, `category`, `minPrice`, `maxPrice`, `inStock`, `onSale`, `attribute=Taille:M` (répétable), `sort` (`price`, `-price`, `-createdAt`, `-discount`), `page`, `limit` |
| `GET /products/:slug` | Fiche produit                                                                                                                                                                                  |
| `GET /delivery-zones` | Zones desservies et frais                                                                                                                                                                      |
| `POST /orders`        | Passage de commande, avec ou sans compte ; panier multi-boutiques réparti en sous-commandes dans une transaction ; un numéro PAN et un code de suivi communs ; 201 à la création, 200 si la clé est rejouée |
| `GET /orders`         | Commandes du client connecté (3 dernières années) ; `?number=CMD-...` pour en retrouver une par son numéro                                                                                     |
| `GET /orders/:id`     | Détail d'une commande du client connecté ; 404 pour celle d'un autre                                                                                                                           |

| `PUT /orders/:id/payment-method` | Changement de moyen de paiement par le client, tant que rien n'est encaissé (8.6) |
| `POST /orders/:id/cancellation-requests` | Annulation par le client : immédiate si la commande est confirmée (200), sinon demande à l'équipe (202) |
| `POST` / `GET /orders/:id/return` | Demande de retour d'une commande livrée (délai `RETURN_WINDOW_DAYS`) et suivi du dossier |
| `POST /orders/:id/return/evidence-uploads` | Autorisation signée pour envoyer une photo justificative (dossier `returns`) ; seules les photos hébergées chez nous sont acceptées dans la demande |
| `POST /orders/:id/return/reopenings` | Réouverture d'un dossier refusé (délai `RETURN_REOPEN_DAYS`) |
| `POST /checkout/quotes` | Devis du panier, avec ou sans compte : prix, code, points utilisés et gagnés, erreurs éventuelles ; sans `zoneId`, la livraison n'est pas comptée (page panier) |
| `GET /loyalty`, `GET /loyalty/movements` | Solde, niveau, avantages, progression et historique des points du client |
| `GET /orders/:id/invoices` | Factures et avoirs d'une commande du client (fenêtre de 3 ans du compte) |
| `PATCH /orders/:id/delivery-fee-change` | Réponse du client aux nouveaux frais de livraison (accord ou refus) |
| `POST /orders/:id/delivery-disputes` | Contestation d'une livraison marquée « Livrée » ; le statut reste inchangé |
| `GET /loyalty/referral`, `GET /loyalty/codes`, `PUT /loyalty/preferences` | Code parrain et filleuls, codes personnels utilisables, date d'anniversaire et choix points ou code |
| `GET /order-tracking` | Suivi sans compte par numéro de commande `CMD-…` ou panier `PAN-…` et code commun ; résumé de tous les arrêts, sans coordonnées du client |

Commandes vendeurs, sous `/api/v1/seller/orders` (compte propriétaire de la boutique) :

| Route | Rôle |
| --- | --- |
| `GET /`, `GET /:id` | Sous-commandes de sa boutique uniquement |
| `POST /:id/progress` | Préparation et progression de sa sous-commande |
| `POST /:id/handover` | Confirmer la remise au livreur OKOUMÉ ; le panier part en livraison après la dernière collecte |
| `POST /:id/cancellation` | Annuler sa sous-commande avant son départ, avec motif |
| `POST /:id/collection` | Déclarer l'encaissement après livraison quand la boutique utilise son propre livreur |

Pour un panier centralisé, l'équipe affecte un livreur à toutes les sous-commandes OKOUMÉ prêtes en une seule action.
Chaque boutique confirme ensuite sa collecte ; une seule notification de départ est envoyée après la dernière remise.
Le livreur encaisse le total de cette tournée une fois. Les sous-commandes livrées par les vendeurs restent
indépendantes. Les paiements reçus sur la tournée sont ventilés par sous-commande, avec la référence Mobile Money
enregistrée une seule fois.

Équipe, sous `/api/v1/staff` (session de l'équipe et droit `domaine:action` vérifiés à chaque requête) :

| Route                                                         | Rôle                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /orders`, `GET /orders/:id`                              | Liste filtrée (statut, paiement, recherche) et détail ; `commandes:consulter`                                       |
| `POST /orders/:id/transitions`                                | `advance`, `assign_courier`, `confirm_collection`, `cancel`, `reopen`, `delivery_failed` ; une affectation et une fin de livraison couvrent toute la tournée centralisée |
| `GET` / `POST /orders/:id/payments`                           | Paiements de la commande ; encaissement vérifié `paiements:valider`                                                 |
| `POST /orders/:id/refunds`                                    | Remboursement effectué ; `paiements:valider` et plafond de la personne                                              |
| `PATCH /orders/:id/cancellation-request`                      | Décision sur la demande du client ; `commandes:annuler`                                                             |
| `GET` / `POST /promo-codes`, `GET` / `PATCH /promo-codes/:id` | Codes promotionnels ; `catalogue:consulter`, écriture `catalogue:modifier`                                          |
| `POST /customers/:customerId/loyalty-adjustments`             | Correction de points avec motif ; administrateur principal                                                          |
| `GET` / `PATCH /settings/loyalty`                             | Plafond des réductions et seuils des niveaux ; administrateur principal                                             |
| `GET` / `POST /couriers`, `PATCH /couriers/:id`               | Répertoire des livreurs ; `commandes:consulter`, écriture `commandes:modifier`                                      |
| `PUT /orders/:id/delivery-cost`                               | Coût réel de la course, distinct des frais facturés ; `commandes:modifier`                                          |
| `POST /orders/:id/delivery-fee-changes`                       | Nouveaux frais proposés au client, appliqués avec son accord                                                        |
| `PATCH /orders/:id/delivery-dispute`                          | Résolution d'une contestation de livraison                                                                          |
| `GET /referral-rewards`, `PATCH /referral-rewards/:id`        | Parrainages suspects à vérifier ; `clients:valider`                                                                 |
| `GET /invoices`, `GET /invoices/:id`                          | Factures et avoirs ; `paiements:consulter`                                                                          |
| `GET /returns`, `GET /returns/:id`                            | Dossiers de retour ; `retours:consulter`                                                                            |
| `POST /returns/:id/decision`                                  | Acceptation (frais de retour et motif) ou refus ; `retours:valider`, administrateur principal                       |
| `POST /returns/:id/reception`, `/inspection`                  | Réception puis inspection (revendable, non revendable, ou non conforme) ; `retours:modifier`                        |
| `POST /returns/:id/restock`                                   | Remise en stock des revendables ; `stock:valider`                                                                   |
| `POST /variants/:variantId/write-offs`                        | Sortie définitive du stock non revendable ; administrateur principal                                                |
| `GET` / `POST /variants/:variantId/stock-movements`           | Journal du stock ; réception (`stock:creer`) ou inventaire (`stock:modifier`)                                       |

- Début de préparation : le stock physique sort et la réservation est consommée. Annulation avant préparation :
  la réservation est libérée ; après : les articles reviennent en stock. Chaque mouvement est journalisé.
- Une transition n'est appliquée que si la commande est encore dans l'état lu : deux personnes qui traitent la même
  commande ne peuvent pas l'avancer deux fois (409).
- Le stock ne peut jamais être fixé sous les quantités réservées par des commandes en cours.
- Paiement à la réception, quel que soit le moyen : toute commande démarre « En attente de paiement » et peut être
  préparée et livrée avant encaissement (8.4, 8.5). Seul le total exact est encaissé, aucun paiement partiel.
  Mobile Money : référence obligatoire, unique en base (index partiel) pour bloquer un double paiement.
- Remboursement seulement sur « Remboursement à effectuer », dans la limite de l'encaissé et du plafond de la
  personne (l'administrateur principal n'en a pas) ; référence obligatoire sauf exception justifiée ; autre moyen
  que le paiement initial avec l'accord du client. « Remboursé » quand tout est rendu.
- Retours (14.2 à 14.6) : un dossier par commande livrée, justificatif obligatoire pour un produit endommagé,
  défectueux ou non conforme. Rien n'est remboursé avant réception et inspection ; le montant est le prix payé des
  articles, remises réparties au prorata, livraison examinée à part. Les non revendables vont au stock séparé.
  Une fois un retour partiel remboursé, la commande redevient « Payée » ; « Remboursée » si tout est rendu.
- Codes promo et points (11.2, 12.1 à 12.4) : un seul code par commande, articles déjà en promotion exclus du code ;
  ordre promotion produit, code, points, cumul plafonné (50 % par défaut) ; 1 point = 50 FCFA, 100 points au moins,
  jamais sur la livraison. La commande est refusée si le code ou les points annoncés ne passent plus (422 ou 409).
- Points crédités une seule fois quand la commande est livrée et payée (1 par 1 000 FCFA de produits après
  réductions, hors livraison), rendus si une commande est annulée, retirés au prorata des articles remboursés.
  Historique en ajout seul ; un solde négatif bloque l'utilisation. Niveau recalculé à chaque lecture.
- Factures et avoirs (25.4) : facture émise dans la transaction qui rend la commande payée, avoir dans celle de
  chaque remboursement d'une commande facturée, lié à la facture et réparti sur ses taux. Numérotation par série et
  par année (`FAC-2026-000001`, `AV-2026-000001`), continue, tirée d'un compteur verrouillé. Document figé : lignes,
  TVA par taux et coordonnées copiées ; un déclencheur en base refuse toute modification ou suppression. Archive
  sans clé vers le compte client, qui peut être anonymisé (19.5). TVA de la livraison réglable (18 % à valider).
- Livraison (9.3 à 9.6) : une commande prête passe « Livreur trouvé » par l'affectation d'un livreur actif du
  répertoire (`assign_courier`), avec le coût réel de la course (coût habituel de la zone par défaut). Le livreur
  reçoit un e-mail, le client aussi au départ du colis. Un échec de livraison avec nouvelle tentative libère le
  livreur. De nouveaux frais facturés sont proposés au client et bloquent la livraison jusqu'à sa réponse ; ils ne
  changent que s'il accepte et que rien n'est encaissé. Une contestation laisse la commande « Livrée ».
- Parrainage et récompenses (12.5) : chaque client reçoit un code parrain ; le filleul l'indique à l'inscription.
  À sa première commande livrée et payée, le parrain reçoit ses points (300 par défaut), ou la récompense attend une
  vérification humaine si un signal est relevé (même téléphone, même adresse, 3 parrainages en 7 jours, première
  commande sous 5 000 FCFA). Le filleul reçoit un code de bienvenue personnel (10 %, 30 jours). Tout se fait dans la
  transaction qui rend la commande livrée et payée, une seule fois par filleul et par commande.
- Anniversaire : le worker passe chaque matin à 7 h (heure de Libreville) et offre les points ou le code choisis par
  le client, une fois par an (les clients nés un 29 février sont fêtés le 28 les années non bissextiles).
- Pas d'expiration automatique des paiements Mobile Money (8.7 écarté du cahier des charges).
- Référence `GA-xxxx`, adresse de fiche et références des variantes sont attribuées par l'API. L'adresse ne change
  pas quand le produit est renommé (liens et référencement stables).
- Publication (28.1) : au moins une image, une variante, et un coût d'achat inférieur au prix pour chaque variante.
  Le coût d'achat et le coût d'une course ne sont jamais renvoyés par les routes publiques.
- Une catégorie n'est supprimée que vide ; une zone n'est jamais supprimée (les commandes la référencent), on la ferme.

- Le navigateur n'envoie que les variantes, les quantités, la livraison et le moyen de paiement. Prix, promotion
  en vigueur, frais de livraison et totaux sont recalculés depuis la base ; tout champ en plus est refusé.
- La réservation du stock et la création de la commande se font dans une seule transaction, variantes verrouillées
  dans un ordre fixe : pas de survente, pas d'interblocage. Si un article manque, rien n'est écrit (409 `OUT_OF_STOCK`).
- Le stock exact, les réservations et le stock non revendable ne sont jamais exposés : seulement la quantité disponible.
- La base vérifie elle-même la cohérence (CHECK) : stock et réservations positifs, réservations inférieures au stock,
  total égal au sous-total moins les remises plus la livraison.

## Assistance, données personnelles, avis et contenus

| Route                                           | Accès                           | Rôle                                                    |
| ----------------------------------------------- | ------------------------------- | ------------------------------------------------------- |
| `POST /support/tickets`                         | public (limité)                 | Demande d'assistance, avec ou sans compte               |
| `GET /support/tickets`, `/:number`, réponses    | client                          | Suivi, réponse, réouverture, note                       |
| `/staff/support/tickets`                        | `clients:consulter`, `modifier` | File, réponse, suivi, clôture                           |
| `GET`, `POST /me/privacy-requests`              | client                          | Demandes d'accès et de correction                       |
| `POST /me/data-exports`                         | client                          | Export immédiat de ses données (tracé)                  |
| `POST /me/account-deletion`                     | client, mot de passe            | Anonymisation immédiate du compte                       |
| `/staff/privacy-requests`                       | `donnees_sensibles:*`           | Suivi, export (`exporter`), clôture (`modifier`)        |
| `GET /reviews/ratings`, `/reviews/products/:id` | public                          | Notes par produit, avis publiés                         |
| `PUT /reviews/mine/:productId`, signalements    | client                          | Avis sur un produit reçu, signalement                   |
| `/staff/reviews`                                | `clients:consulter`, `modifier` | Modération motivée par la charte                        |
| `GET /content/...`                              | public                          | Bannières, publicités en cours, offres, articles, pages |
| `/staff/content/...`                            | `catalogue:*`                   | Bannières, publicités, articles (`publier`), pages      |

- Anonymisation : refusée tant qu'une commande, un retour ou une demande à un vendeur est en cours, ou si le compte
  a une boutique ; les blocages sont revérifiés dans la transaction qui anonymise. Les montants des commandes et les
  avis restent, sans nom ni coordonnées. Le job quotidien `privacy.inactive-accounts` (3 h, heure de Libreville)
  anonymise les comptes sans connexion ni commande depuis 3 ans.
- Avis : réservés à un produit reçu (commande livrée), affichés avec le prénom et l'initiale du nom, repassent en
  modération à chaque modification ; la décision de l'équipe clôt les signalements.
- Articles : un article programmé (publié avec une date future) n'existe pas pour le public avant sa date. Chaque
  enregistrement garde la version précédente avec son auteur et la nature du changement.

## Back-office : clients, équipe, journal, alertes, quartiers demandés

| Route                                | Accès                             | Rôle                                                    |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------- |
| `GET /staff/customers`, `/:id`       | `clients:consulter`               | Fichier clients : points, niveau, commandes, adresses   |
| `/staff/team`, `/staff/custom-roles` | administrateur principal          | Invitations, droits, suspension, sessions, codes, rôles |
| `GET /staff/activity`                | administrateur principal          | Journal d'activité tenu par le serveur                  |
| `GET`, `PATCH /staff/alerts`         | `pilotage:consulter`              | Dossiers d'alerte : prise en charge, clôture motivée    |
| `POST /zone-requests`                | public (limité)                   | Demande de nouveau quartier                             |
| `/staff/zone-requests`               | `commandes:consulter`, `modifier` | Suite donnée à une demande                              |

- Clients : e-mail, téléphone et repères d'adresse sont masqués par l'API sans `donnees_sensibles:consulter`. Les
  agrégats (solde, commandes, montant retenu pour le niveau) sont calculés en une requête.
- Équipe : le lien d'invitation (7 jours, usage unique) est envoyé par e-mail ; seule son empreinte est gardée. Tout
  changement de droits ou une suspension ferme les sessions du membre ; il reste toujours un administrateur
  principal actif, et nul ne modifie ses propres droits.
- Journal : un middleware monté sur `/staff` inscrit chaque écriture réussie d'un membre, après la réponse, avec son
  domaine et sa cible. Lectures, refus et connexions n'y figurent pas (la dernière connexion est dans l'équipe).
- Alertes : le job `alerts.detect` (toutes les 15 minutes) compte paiements à vérifier, ruptures et stock faible,
  assistance hors délai, données personnelles en retard, annulations et retours à décider, commandes en espèces en
  attente, annonces en modération. Une alerte critique nouvelle est poussée à l'équipe, puis relancée après le
  délai d'escalade des paramètres.

## Suivi des e-mails, assistant, sécurité du compte

| Route                                | Accès                              | Rôle                                                 |
| ------------------------------------ | ---------------------------------- | ---------------------------------------------------- |
| `GET /staff/emails`                  | `commandes:consulter`              | Envois du worker : essais, issue, dernière erreur    |
| `POST /staff/emails/:id/retries`     | `commandes:modifier`               | Relance d'un échec définitif, une seule fois         |
| `GET /staff/assistant`, `/questions` | `pilotage:consulter`, propriétaire | Décisions, actions appliquées, règles, questions     |
| `POST /staff/assistant/...`          | `catalogue:modifier`, propriétaire | Décision, proposition appliquée ou annulée, règles   |
| `DELETE /staff/auth/sessions/others` | membre connecté                    | Ferme ses autres sessions, garde la session en cours |

- Chaque e-mail mis en file reçoit un identifiant d'envoi, clé d'idempotence chez Resend et clé du suivi, qui reste
  le même quand le job passe en file d'échec. Le worker inscrit chaque essai ; le texte n'est gardé que tant que
  l'e-mail n'est pas parti, et jamais pour un code de vérification ou un lien d'invitation (`sensitive`), qui ne se
  relance pas. Un échec définitif déclenche l'alerte critique « E-mails non délivrés ».
- Resend : renseigner `RESEND_API_KEY` (clé « Sending access ») et un `EMAIL_FROM` dont le domaine est vérifié dans
  la console Resend. Sans clé, en développement, les e-mails partent dans les logs du worker.

## Mesure d'audience

- `POST /analytics/events` (public) : visite, consultation ou clic sur un produit, ajout au panier, passage de
  commande, recherche. Envoyé par le site seulement avec le consentement à la mesure d'audience ; aucun identifiant
  de personne ni d'appareil. Le job `analytics.purge` supprime chaque nuit l'historique de plus de 13 mois.
- `GET /staff/analytics/daily|product-events|searches` (`pilotage:consulter`) : courbes de fréquentation,
  intérêt pour les produits, termes recherchés, sur 400 jours au plus.
- `GET`, `POST /assistant/usage` : compteur mensuel de l'assistant client, plafonné par le serveur selon les
  paramètres (`assistantMonthlyBudget`, 0 : sans plafond).

## Clés et services à compléter

| Variable                                | Service                          | Sans la clé                                         |
| --------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `CLOUDINARY_*`                          | Images (renseigné)               | Envoi d'images indisponible (503)                   |
| `RESEND_API_KEY`, `EMAIL_FROM`          | E-mails                          | E-mails écrits dans les logs du worker (dev seul)   |
| `ANTHROPIC_API_KEY` ou `GEMINI_API_KEY` | Vérification des annonces, tchat | Modération humaine, questions transmises au vendeur |
| `VAPID_*`                               | Notifications push               | Push désactivé, e-mails conservés                   |

Chaque service se branche en renseignant sa variable puis en redémarrant l'API et le worker : aucun code à changer.

## Mise en ligne

Hébergement : API et worker sur Render (`render.yaml` à la racine du dépôt), front sur Vercel
(`front/vercel.json`), base Neon, e-mails Resend, images Cloudinary, surveillance UptimeRobot.

**Domaine : obligatoire avant d'ouvrir la connexion.** Les cookies de session sont en `SameSite=Lax` : entre
`*.vercel.app` et `*.onrender.com`, deux sites différents, le navigateur ne les envoie pas. Front et API doivent
partager un domaine, par exemple `okoume.ga` (Vercel) et `api.okoume.ga` (Render).

| Service     | À créer                                                                                      | Variables                                                    |
| ----------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Neon        | Un projet par environnement (staging, production), région AWS Francfort                      | `DATABASE_URL` (pooled), `DIRECT_DATABASE_URL` (directe)     |
| Resend      | Domaine vérifié (enregistrements DNS fournis par Resend), clé « Sending access »             | `RESEND_API_KEY`, `EMAIL_FROM`                               |
| Cloudinary  | Un compte ; taille maximale des envois dans la console                                       | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `..._SECRET`  |
| Gemini      | Clé dans Google AI Studio > API keys (une par environnement)                                 | `GEMINI_API_KEY`, `GEMINI_MODEL`                             |
| Web Push    | `npx web-push generate-vapid-keys`, une paire par environnement                              | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`     |
| Render      | « New > Blueprint » sur le dépôt : crée `okoume-api` et `okoume-worker`, demande les valeurs | les mêmes, plus `APP_URL`, `CORS_ORIGINS` et `COOKIE_DOMAIN` |
| Vercel      | Projet sur le dépôt, dossier racine `front`                                                  | `VITE_BACKEND_URL` (voir le front)                           |
| Sentry      | Deux projets : Node.js (API et worker) et navigateur (front)                                 | `SENTRY_DSN` (Render), `VITE_SENTRY_DSN` (Vercel)            |
| UptimeRobot | Moniteurs HTTP(S) ci-dessous                                                                 | aucune                                                       |

Ordre conseillé : Neon, puis Render (le pré-déploiement applique les migrations), puis `npm run db:seed` sur le
staging depuis un poste avec la `DIRECT_DATABASE_URL` du staging, puis Vercel, puis les domaines, puis UptimeRobot.
`JWT_ACCESS_SECRET` est généré par Render à la création, différent pour chaque service et chaque environnement.

Surveillance UptimeRobot :

- `https://api.<domaine>/ready` : l'API et la base répondent (503 sinon), intervalle 5 minutes.
- `https://<domaine>/` : le front répond.
- Le worker n'a pas d'adresse : ses échecs remontent dans les logs Render (niveau `error`, file `*.dead`) et dans Sentry.
- Un service web Render gratuit se met en veille après inactivité : réservé au staging, pas à la production.

## Déploiement

Render (API et worker) et Vercel (front) déploient automatiquement chaque commit poussé sur `main`. Avant de pousser,
lancer en local : `npm run lint`, `npm test`, `npm run build` (et `npm run test:e2e` dans le front). Node.js est fixé
à la version 24 (`engines` de `package.json`).

## Sauvegarde, restauration et retour arrière

À tester une fois sur le staging avant l'ouverture, puis après chaque changement d'hébergement
(rules/20-qualite/security.md, rules/20-qualite/cicd.md).

- **Sauvegarde continue** : Neon conserve l'historique de la base et permet une restauration à un instant donné
  (durée de conservation selon l'offre, à vérifier dans la console Neon > Settings).
- **Copie avant une opération risquée** (migration délicate, import massif), depuis un poste avec `pg_dump` :
  `pg_dump --format=custom --no-owner --file backups/okoume-AAAA-MM-JJ.dump "$DIRECT_DATABASE_URL"`. Le dossier
  `backups/` est ignoré par git ; la copie contient des données personnelles, à supprimer une fois inutile.
- **Restauration** : dans Neon, restaurer à l'instant voulu (de préférence dans une nouvelle branche, contrôlée avant
  bascule), ou `pg_restore --clean --no-owner --dbname "$DIRECT_DATABASE_URL" backups/<fichier>.dump`.
- **Retour arrière du code** : Render (Deploys > Rollback sur la version précédente, API puis worker) et Vercel
  (Deployments > version précédente > Promote / Instant Rollback). La base n'est pas ramenée en arrière : chaque
  migration doit rester compatible avec la version précédente du code (ajouter une colonne, puis retirer l'ancienne
  dans une mise en ligne suivante).
- **Supervision** : avec `SENTRY_DSN`, chaque log `error` ou `fatal` portant une erreur part vers Sentry avec
  l'identifiant de requête et le commit déployé (`RENDER_GIT_COMMIT`) ; aucune donnée de requête n'est envoyée.
  Côté front, `VITE_SENTRY_DSN` remonte les erreurs d'affichage, avec le commit fourni par Vercel au build.

## Conventions vérifiées automatiquement

- ESLint refuse tout import de Prisma hors des fichiers `*.repository.ts` (et du point d'entrée, qui ferme la connexion à l'arrêt).
- ESLint refuse tout import d'Express dans un fichier `*.service.ts`.
- Toute réponse passe par `src/core/http/apiResponse.ts` : `{ success, status, message, data }` ou `{ success, status, message, code, requestId, errors? }`.
- Toute erreur passe par `src/core/middlewares/errorHandler.ts` : jamais de stack trace ni de détail interne côté client.
- Chaque requête porte un identifiant de corrélation (`X-Request-Id`), repris s'il vient du front.

## Démarches ajoutées

| Route                                                                                | Rôle                                                                                    |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `POST /orders/:id/payment-declarations`, `POST /order-tracking/payment-declarations` | Paiement Mobile Money déclaré par le client (référence) : commande « à vérifier »       |
| `POST /orders/claims`                                                                | Rattache une commande passée sans compte : numéro, code de suivi et même adresse e-mail |
| `POST /auth/contact-changes`, `POST /auth/contact-changes/confirmations`             | Changement d'e-mail ou de téléphone : mot de passe, puis code                           |
| `POST /staff/auth/password-resets`, `.../confirmations`                              | Mot de passe oublié de l'équipe : code par e-mail et code de secours                    |
| `GET /staff/team/directory`                                                          | Membres actifs (prénom, nom), lisibles par toute l'équipe                               |
| `GET /staff/stock-movements`                                                         | Journal général du stock (`stock:consulter`)                                            |
| `GET /staff/price-changes`                                                           | Historique des prix (`catalogue:consulter`) ; `priceReason` exigé quand un prix change  |
| `POST /staff/exports`                                                                | Export déclaré avant le fichier : motif inscrit au journal (`exports:exporter`)         |
| `POST /staff/orders/:id/review-clearances`                                           | Commande suspecte vérifiée, avec une note (`commandes:valider`)                         |

Commandes suspectes (19.3, `orders.risk.ts`) : signaux calculés à la création (montant au-delà de `reviewAmount`,
quantité de 5 ou plus, 3 commandes du même numéro en 24 h, numéro utilisé avec plusieurs adresses e-mail, 2
annulations en 30 jours, remises de 40 % ou plus). La commande passe, mais la préparation attend la vérification ;
les motifs ne sont jamais dans la vue du client.

## Limites connues

- Outillage de développement : `picomatch` (dépendance de Vitest et Vite) est signalé par `npm audit` sans version
  corrigée ; risque accepté, il ne sert qu'aux tests et au build, jamais en production (`npm audit --omit=dev` : 0).
- Les tests unitaires utilisent des dépôts en mémoire. Les dépôts Prisma (réservation de stock, paiements, retours,
  signaux anti-fraude) ne sont exercés que par les parcours Playwright du front, sur une base PostgreSQL réelle.
- Pas encore côté équipe : livreurs, changement des frais de livraison, import de catalogue, envoi des images (les adresses HTTPS sont fournies).
- Retours : justificatifs fournis comme adresses HTTPS (pas encore d'envoi de fichiers), annulation depuis le suivi invité pas encore ouverte (14.1).
- Factures : pas encore de PDF (l'API renvoie le document, le front l'imprime), mentions légales de la boutique
  (raison sociale, NIF, RCCM) à ajouter aux réglages, règles fiscales à faire valider avant le lancement (25.5).
- Fidélité : le front compte les points sur le total avec la livraison, l'API hors livraison comme le cahier des
  charges. Les e-mails de bienvenue et d'anniversaire ne sont pas encore envoyés : le code est visible dans le compte
  (`GET /loyalty/codes`).
- Le client n'est pas encore prévenu par e-mail des changements d'état de sa commande.
- Codes promo et points de fidélité : refusés par le schéma de commande jusqu'à leur étape.
- Mise en avant : pas de remboursement automatique si l'annonce est refusée ou retirée pendant la période ; pas de
  plafond du nombre d'annonces sponsorisées par page de résultats.
- Visites : les rechargements et les robots comptent comme des visites ; le chiffre est une indication, pas une
  mesure d'audience. Pages du front `/annonces/:slug`, `/vendeur/...` et `/compte/...` à créer.
- Gemini : adaptateurs écrits d'après les types du SDK `@google/genai` (2.32), non essayés avec une vraie clé.
- Tchat : pas encore de temps réel (WebSocket), ni de durée de conservation propre aux conversations, ni de
  consultation par l'équipe en cas de litige. Les adaptateurs Anthropic n'ont pas été essayés avec une vraie clé.
- Demandes de commande : pas encore d'avis sur les vendeurs après une vente conclue (13), ni d'expiration des
  demandes restées sans réponse, ni de consultation par l'équipe en cas de litige.
- Recherche des annonces : la requête SQL (distance, catégories, filtres) n'a pas encore tourné sur PostgreSQL, les
  tests utilisent le dépôt en mémoire. Les accents ne sont pas ignorés (« elegance » ne trouve pas « élégance »),
  comme dans la recherche du catalogue. Pas encore de mise en avant payante dans le classement (lot 9.7).
- Annonces : la liste des produits interdits utilisée par l'IA (`anthropicListingReviewer.ts`) est une liste de
  départ, à faire valider juridiquement. L'adaptateur Anthropic n'a pas encore été essayé avec une vraie clé. La
  recherche et le tri par proximité arrivent au lot 9.3.
- Place de marché : la vérification du téléphone du vendeur (exigée avant publication, 32.2) n'est pas faite :
  elle demande un fournisseur d'envoi de SMS, pas encore choisi. Seule l'adresse e-mail est vérifiée. Le domaine de droits `vendeurs` n'est pas encore dans l'éditeur de rôles du front ; les écrans
  vendeur et administration restent à faire côté front. Isolation entre vendeurs assurée par l'API (aucun
  identifiant de boutique dans les routes vendeur), pas par la base (pas de RLS).
- Push : pas encore de notification pour les retours, les remboursements ni la fidélité (l'assistance en envoie).
- Assistant d'administration : l'analyse (produits lents, anomalies) reste un moteur à règles qui tourne dans
  l'interface sur les données de l'API ; l'API garde ses décisions, actions, règles et questions. Pas encore de
  modèle d'IA côté serveur pour lui.
- Alertes : pas encore d'anomalie statistique (chute des ventes, pic d'annulations) ; pas de détection des
  commandes suspectes (absente de l'API). Mesure d'audience (visites, consultations) pas encore collectée.
- Suivi des e-mails : pas de durée de conservation automatique des lignes de suivi (destinataire et objet).
- Durées de conservation : seule l'anonymisation des comptes inactifs est automatisée. Journaux de connexion,
  historique de navigation et demandes d'assistance anciennes ne sont pas encore purgés par l'API.
- Données personnelles : le client n'est pas prévenu par e-mail de la réponse à sa demande (elle est visible dans
  son compte). Les messages du tchat d'un compte anonymisé sont conservés.
- Espaces publicitaires : le contrat de l'annonceur n'est pas stocké par l'API ; pas de création ni de suppression
  de bannière ou d'espace depuis l'API (modification seule, comme l'écran actuel). Les offres exclusives se lisent
  mais ne se modifient pas encore.
- Produits associés (`relatedIds`) et tri par note (avis) : pas encore modélisés.

- Envoi des e-mails par Resend (`src/infrastructure/email/resendEmailSender.ts`) dès que `RESEND_API_KEY` est fournie.
  Sans clé, en développement, les e-mails et leurs codes sont écrits dans les logs ; en staging et production,
  l'application refuse de démarrer.
- Le job est déposé après l'écriture en base, hors transaction : si l'API s'arrête entre les deux, l'e-mail
  n'est pas déposé et l'utilisateur doit redemander un code. Acceptable pour des codes, à revoir (dépôt dans
  la même transaction) pour les e-mails de commande.
- La surveillance des files (profondeur, âge du plus vieux job, taux d'échec) existe dans pg-boss mais n'est pas encore exposée : étape supervision.
- Les compteurs de limitation de débit sont en mémoire : à partager entre instances (stockage commun) avant de passer à plusieurs instances.

- Express 5 transmet déjà les erreurs des contrôleurs asynchrones ; `asyncHandler` est gardé pour respecter l'arborescence de référence.
- `npm audit` signale des alertes modérées dans les outils de développement (minimatch via ESLint), aucune dans les dépendances d'exécution.
