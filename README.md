# HabiTEK Stats 2026

Dashboard React/Vite pour les statistiques HabiTEK, prêt pour **Vercel + Supabase**.

## Architecture

- **Vercel** : héberge le frontend Vite et les fonctions API.
- **Supabase PostgreSQL** : stocke les mesures dans `device_data`.
- **Supabase Realtime** : pousse les nouvelles mesures au navigateur.
- **Milesight** : envoie les événements vers `/api/milesight-webhook`.

L'ancien serveur Flask/Socket.IO sur DuckDNS n'est plus requis.

## Routes API

- `GET /api/history`
- `GET /api/latest`
- `POST /api/milesight-webhook`

`/api/history` conserve les paramètres utilisés par l'ancienne application :

- `start_timestamp`
- `end_timestamp`
- `limit`

## 1. Préparer Supabase

Créer un projet Supabase, puis exécuter le fichier :

`supabase/schema.sql`

dans **SQL Editor**.

Ce script crée la table `device_data`, les index, la politique de lecture publique pour le dashboard et active Realtime pour cette table.

## 2. Variables d'environnement

Configurer dans Vercel :

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
MILESIGHT_WEBHOOK_SECRET=...
```

Important :

- `VITE_SUPABASE_ANON_KEY` peut être utilisée par le frontend.
- `SUPABASE_SERVICE_ROLE_KEY` doit rester exclusivement côté serveur/Vercel.
- Ne jamais préfixer la service-role key avec `VITE_`.

## 3. Déployer sur Vercel

Importer ce dépôt GitHub dans Vercel :

`nathanbegin/HabitekStats2026`

Framework : **Vite**

Commande de build :

```
npm run build
```

Répertoire de sortie :

```
dist
```

Après avoir ajouté les variables d'environnement, lancer un nouveau déploiement.

## 4. Configurer Milesight

Configurer le webhook Milesight vers :

```
https://VOTRE-DOMAINE/api/milesight-webhook
```

Si `MILESIGHT_WEBHOOK_SECRET` est défini, le endpoint accepte le secret avec :

- l'en-tête `x-webhook-secret`;
- `Authorization: Bearer <secret>`;
- ou, en dernier recours, `?secret=<secret>`.

## Données

La structure principale est :

```
device_data
├── id
├── device_uuid
├── timestamp
├── record_type
├── data (jsonb)
└── created_at
```

Les types reconnus sont `sensor`, `camera` et `unknown`.

## Migration 2025 → 2026

Le frontend conserve actuellement le mapping des UUID Milesight de l'application 2025 afin de rester compatible avec le matériel existant. Si les capteurs 2026 utilisent de nouveaux DevEUI, modifier `DEVICE_UUID_BUILDING_MAP` dans `src/App.jsx`.

L'historique PostgreSQL de l'ancien serveur n'est pas copié automatiquement vers Supabase.
