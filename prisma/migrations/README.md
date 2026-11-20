# Migrations

Chaque évolution du schéma est une migration versionnée, générée par Prisma puis relue.

Retour arrière : Prisma n'exécute pas de migration descendante. Une migration appliquée se corrige par
une nouvelle migration qui rétablit l'état précédent, sans perte de données. Seule la première migration
(`20261103210000_auth`) se défait entièrement, en supprimant les tables créées, tant qu'aucune donnée réelle
n'y est enregistrée.

Les contraintes `CHECK` ajoutées à la main en fin de fichier sont des règles métier portées par la base
(rules/10-stack/database.md) : Prisma ne sait pas les décrire dans le schéma.

L'index unique partiel `payments_reference_unique` (migration `20261104130000_payments`) empêche qu'une même
référence de transaction serve à deux encaissements. Prisma ne le connaît pas : une migration générée par
comparaison avec la base pourrait proposer de le supprimer. Relire chaque migration et le conserver.

De même, les index uniques partiels `loyalty_movements_earn_once`, `_redeem_once` et `_restore_once`
(migration `20261104170000_promo_loyalty`) garantissent qu'une commande ne crédite, n'utilise et ne rend ses
points qu'une fois. La même migration crée la ligne unique de `shop_settings`.

La migration `20261104190000_invoices` ajoute l'index partiel `invoices_one_per_order` (une facture par commande)
et le déclencheur `invoices_immutable`, qui refuse toute modification ou suppression d'une facture ou d'un avoir
émis. Ni l'un ni l'autre n'est décrit dans le schéma Prisma : les conserver.

La migration `20261104210000_couriers` ajoute les index partiels `delivery_fee_changes_one_pending` et
`delivery_disputes_one_open` : une seule demande de frais en attente et une seule contestation ouverte par commande.

La migration `20261104230000_referrals_birthdays` ajoute l'index partiel `promo_codes_one_welcome` (un code de
bienvenue par client). Elle ajoute aussi `customers.referral_code` obligatoire sans valeur par défaut : elle suppose
une table `customers` vide, ce qui est le cas tant qu'aucune migration n'a été appliquée.

La migration `20261110180000_marketplace_shops` (place de marché, section 32) ajoute les index partiels
`shop_payments_one_pending` (un paiement en attente par boutique) et `shop_payments_reference_unique` (une
transaction Mobile Money ne sert qu'une fois, hors paiements refusés), plusieurs contraintes `CHECK` et la ligne
unique de `marketplace_settings`. Les conserver.

La migration `20261111090000_marketplace_listings` (annonces, 32.3) ajoute l'index partiel
`listing_reports_one_open` (un signalement ouvert par client et par annonce) et des contraintes `CHECK` : champs
propres aux produits et aux services, dates de publication, revue humaine motivée, une IA qui ne refuse jamais
seule (`listing_reviews_staff_complete`). Les conserver.

La migration `20261111150000_listing_search` (recherche des annonces, 32.4) ajoute deux index partiels
écrits à la main, `listings_published_recent` et `shops_position`, que le schéma Prisma ne décrit pas. Les
conserver : une migration générée par comparaison pourrait proposer de les supprimer.

La migration `20261112090000_listing_requests` (demandes de commande, 32.7) ajoute l'index partiel
`listing_requests_one_open` (une demande ouverte par acheteur et par annonce), des contraintes `CHECK` sur les
montants, les motifs et les conditions de vente des boutiques, et la valeur `sold` de `ListingStatus`. Les
conserver.

La migration `20261112150000_chat_negotiation` (tchat et négociation, 32.5) ajoute des contraintes `CHECK` : prix
minimum de négociation au plus égal au prix affiché, prix convenu toujours daté, une réponse liée à un message
précis réservée à l'assistant ou au système. Les conserver.

La migration `20261113090000_listing_views` (visites des annonces, 32.8) crée un compteur par annonce et par jour,
avec la contrainte `listing_views_count_positive`. L'incrément passe par `INSERT ... ON CONFLICT DO UPDATE`
(`seller-dashboard.repository.ts`) : deux visites simultanées ne perdent aucun compte.

La migration `20261113150000_listing_boosts` (mise en avant payante, 32.10) ajoute les index partiels
`listing_boosts_one_pending` (une mise en avant en attente par annonce) et `listing_boosts_reference_unique`, et des
contraintes `CHECK` sur les offres et les décisions. Une référence de transaction ne sert pas non plus deux fois
entre abonnements et mises en avant : vérifié par le service (deux tables), pas par la base.

La migration `20261114090000_customer_account` (adresses et favoris du compte, 2.2 et 3.6) ajoute l'index
partiel `customer_addresses_one_default` (une seule adresse par défaut par client) et la contrainte
`shop_settings_max_addresses_check` (plafond entre 1 et 20). Les ajouts d'adresse et de favori verrouillent la ligne
du client (`FOR UPDATE`) : deux ajouts simultanés ne dépassent pas le plafond. Les conserver.

La migration `20261114150000_order_instructions` ajoute les consignes pour le livreur (`orders.instructions`, vide
par défaut), reprises dans l'e-mail de course envoyé au livreur.

La migration `20261114180000_free_delivery_codes` remplace la contrainte `promo_codes_value_valid` : une valeur de
0 n'est permise que pour un code de livraison offerte sans autre réduction. Le service vérifie la même règle sur
le code complété lors d'une modification partielle.

La migration `20261115090000_shop_information` crée la ligne unique des informations de la boutique (Mobile Money,
contacts, réseaux, mentions légales, délais). Contraintes `CHECK` : une seule ligne (id 1) et des délais
positifs ; la ligne 1 est insérée par la migration elle-même. Les conserver.

La migration `20261115150000_support` (assistance, 15) ajoute trois contraintes `CHECK` : note de satisfaction
entre 1 et 5, solution obligatoire pour une demande résolue ou clôturée, aucun membre de l'équipe comme auteur d'un
message du client.

La migration `20261116090000_privacy` (données personnelles, 19.5) crée les demandes et la date d'anonymisation des
comptes. Contraintes `CHECK` : réponse obligatoire pour une demande traitée ou refusée, échéance après la
création, et `customers_anonymized_at` (un compte est anonymisé si et seulement s'il porte sa date).

La migration `20261116100000_reviews` (avis, 13) ajoute : note entre 1 et 5, 3 photos au plus, motif obligatoire pour
un avis non publié. Un avis par client et par produit (index unique) ; un signalement par client et par avis.

La migration `20261116110000_content` (contenus) crée bannières, espaces publicitaires, offres exclusives, articles et
pages légales, avec les contraintes `ads_placement` (emplacements connus), `ads_campaign_dates` (fin après le début)
et `articles_reading_time` (1 à 120 minutes).

La migration `20261116120000_zone_requests` (demandes de nouveau quartier, 9.1) ajoute `zone_requests_note` : une
demande traitée porte toujours la suite donnée.

La migration `20261116130000_staff_activity` crée le journal d'activité de l'équipe. Le déclencheur
`staff_activities_no_update` refuse toute modification d'une ligne : le journal ne s'écrit qu'en ajout. La clé vers
le membre est en `RESTRICT` : un membre de l'équipe n'est jamais supprimé, il est suspendu.

La migration `20261116140000_staff_alerts` crée les dossiers d'alerte, avec `staff_alerts_closure_reason`
(justification obligatoire pour résoudre ou clôturer) et `staff_alerts_occurrences`.

La migration `20261116150000_email_deliveries` crée le suivi des envois d'e-mails, avec deux contraintes :
`email_deliveries_sensitive_text` (un e-mail qui contient un code ou un lien d'accès n'a jamais de texte conservé)
et `email_deliveries_sent` (un e-mail parti n'a plus de texte conservé et porte sa date d'envoi).

La migration `20261116160000_staff_assistant` crée la mémoire de l'assistant d'administration : décisions (refus
motivé, report daté), propositions appliquées (annulation avec son auteur), versions des règles (numéro unique) et
questions.

La migration `20261117090000_analytics` crée les événements de mesure d'audience et le compteur mensuel de
l'assistant client. Contraintes : un terme seulement pour une recherche (`analytics_events_search`), un nombre de
résultats positif, une période au format AAAA-MM et un compteur positif (`assistant_usage_period`).

La migration `20261118203000_seller_shops_checks` (boutiques des vendeurs, cahier des charges 1.2, section 32) ajoute
des contraintes `CHECK` : commission entre 0 et 100 %, frais de vendeur positifs, commande livrée par le vendeur
rattachée à une boutique, montants d'un reversement cohérents et date de paiement présente si et seulement si le
reversement est payé. Les conserver.

La migration `20261118202930_seller_products_checks` ajoute deux contraintes `CHECK` sur `products` : la vérification ne
concerne que les produits d'une boutique de vendeur, et un produit de vendeur n'est publié qu'après une vérification
favorable. Les conserver.

La migration `20261118210259_seller_orders` ajoute l'auteur `seller` aux étapes de commande et rend facultatif
`payments.staff_id` : un encaissement sans membre de l'équipe est déclaré par le vendeur qui a livré lui-même
(cahier des charges 1.2, 32.6). Migration additive.
