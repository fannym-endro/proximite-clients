# Potentiel client Endro — outil de proximité

Petite app Next.js à déployer sur Vercel. Un commercial saisit un **code postal**
et un **rayon**, l'app renvoie le **nombre de clients du site Endro** qui habitent
dans la zone. Objectif : chiffrer le potentiel BtoC d'un secteur pour argumenter un
référencement BtoB.

## Comment ça marche

- Un **cron quotidien** (`/api/refresh`) déclenche une extraction **Bulk Operations**
  de Shopify (tous les clients + leur code postal), l'agrège en un petit tableau
  « nombre de clients par code postal » et le range dans **Vercel Blob**.
- La page commerciaux appelle `/api/proximite?cp=16430&km=10`, qui somme les clients
  de tous les codes postaux dont le centre est dans le rayon (distance à vol
  d'oiseau, référentiel des codes postaux français embarqué dans `data/`).
- Les commerciaux n'ont **aucun accès** à Shopify : ils ouvrent juste l'URL. La page
  ne manipule que des **comptes agrégés**, jamais de données client individuelles.

Le nombre est donc « à jour à la journée près », ce qui est largement suffisant vu
la stabilité des chiffres par zone.

## Prérequis

1. **App Shopify (dev dashboard)** — on réutilise l'app qui alimente déjà le
   dashboard, authentifiée par **client_credentials** (client_id + client_secret,
   pas de jeton `shpat_`).
   - Scope Admin API : `read_customers` (déjà présent sur l'app dashboard).
   - Active l'accès aux **données client protégées** (Protected customer data),
     et coche en particulier le champ **adresse** — obligatoire pour lire le code
     postal. C'est le seul réglage qui manque souvent.
   - Récupère `SHOPIFY_CLIENT_ID` et `SHOPIFY_CLIENT_SECRET` (mêmes valeurs que le
     projet dashboard).
2. Un compte **Vercel** + le dépôt poussé sur GitHub (ou `vercel` en CLI).

## Déploiement

1. Pousse ce dossier sur un repo GitHub, puis « New Project » sur Vercel en pointant
   dessus. Framework détecté : Next.js, rien à configurer.
2. Active **Storage → Blob** sur le projet Vercel (un clic). Vercel injecte alors
   automatiquement `BLOB_READ_WRITE_TOKEN`.
3. Renseigne les **variables d'environnement** (Project → Settings → Environment
   Variables), d'après `.env.example` :
   - `SHOPIFY_SHOP` = `endro-cosmetiques.myshopify.com`
   - `SHOPIFY_CLIENT_ID` = le client_id de l'app (identique au projet dashboard)
   - `SHOPIFY_CLIENT_SECRET` = le client_secret de l'app (identique au dashboard)
   - `SHOPIFY_API_VERSION` = `2025-01`
   - `CRON_SECRET` = une longue chaîne aléatoire (protège `/api/refresh`)
   - `ACCESS_CODE` = optionnel, un code d'équipe pour verrouiller la page ; laisse
     vide pour une page ouverte.
4. Déploie. Le cron quotidien est déjà déclaré dans `vercel.json` (03h00 UTC).

## Premier chargement des données

Le cron ingère l'extraction **du jour précédent** puis en lance une nouvelle. Au
tout premier déploiement il n'y a encore rien à ingérer, donc :

1. Déclenche une première extraction manuellement :
   `https://TON-APP.vercel.app/api/refresh?secret=LE_CRON_SECRET`
   → réponse `startedNewOperation: gid://…` (l'extraction tourne côté Shopify).
2. Attends quelques minutes (~191 000 clients → généralement 2–4 min).
3. Rappelle la même URL une seconde fois : elle ingère l'extraction terminée et
   enregistre les compteurs (`ingested: true`).

Ensuite, tout est automatique : chaque nuit le cron ingère et relance.

## Rafraîchir à la demande

Rappelle simplement `/api/refresh?secret=…` deux fois (lancer, puis ingérer une fois
terminé), ou attends le cron du lendemain.

## Utilisation par les commerciaux

Ils ouvrent l'URL de l'app, tapent le code postal du prospect, choisissent un rayon,
et lisent le nombre de clients. La liste en dessous détaille les codes postaux qui
composent ce total, avec leur distance.

## Précision

La distance est calculée depuis le **centre de chaque code postal** (moyenne des
communes), pas adresse par adresse comme le fait Klaviyo. Sur un rayon de 10 km et
plus, l'écart est négligeable pour évaluer un potentiel de zone. Le référentiel
couvre 6 129 codes postaux (métropole + DOM).

## Structure

```
app/
  page.tsx                interface commerciaux
  api/proximite/route.ts  calcul du nombre de clients dans le rayon
  api/refresh/route.ts    cron : extraction Shopify → agrégat → Blob
lib/
  geo.ts                  haversine + comptage par rayon
  shopify.ts              Admin API + Bulk Operations
  storage.ts              lecture/écriture de l'agrégat (Vercel Blob)
data/
  codes_postaux.json      référentiel code postal → coordonnées (embarqué)
vercel.json               planification du cron
```
