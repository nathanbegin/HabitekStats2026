# HabiTEK Stats 2026

Dashboard React/Vite pour les statistiques **HabiTEK 2026**, prêt pour **Vercel + Supabase**. La plateforme 2026 présente uniquement les deux cabanes HabiTEK : **Code** et **PassiveHouse**.

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
MILESIGHT_API_BASE_URL=https://us-openapi.milesight.com
MILESIGHT_CLIENT_ID=...
MILESIGHT_CLIENT_SECRET=...
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


## Structure HabiTEK 2026

La plateforme ne présente plus les équipes/bâtiments 2025. Elle est organisée ainsi :

- **HabiTEK**
  - **Cabane Code**
  - **Cabane PassiveHouse**

Le capteur extérieur est partagé entre les deux cabanes. Les capteurs intérieurs sont associés individuellement à chaque cabane.

Les DevEUI peuvent être configurés dans Vercel avec :

```
VITE_CODE_INDOOR_DEVICE_UUID
VITE_PASSIVEHOUSE_INDOOR_DEVICE_UUID
VITE_OUTDOOR_DEVICE_UUID
```

Les valeurs présentes dans `.env.example` sont des valeurs de migration provenant de l'installation précédente. Remplace-les lorsque les DevEUI définitifs des capteurs 2026 sont connus.


## Administration des capteurs Milesight 2026

La plateforme possède maintenant une console d'administration accessible à :

```
/admin
```

Exemple avec le domaine recommandé :

```
https://stats.habitek.ca/admin
```

Ajouter dans les variables d'environnement Vercel :

```
ADMIN_PASSWORD=un_mot_de_passe_long_et_unique
```

Le mot de passe n'est jamais envoyé au frontend au chargement de la page. Une connexion réussie crée un cookie de session `HttpOnly`, `SameSite=Strict` et `Secure` en production.

### Fonctionnement

Chaque webhook Milesight reçu :

1. enregistre la mesure dans `device_data`;
2. extrait le `devEUI` (ou le numéro de série en secours);
3. crée ou met à jour automatiquement le DevEUI dans `milesight_devices`;
4. le DevEUI devient visible dans `/admin`.

Dans `/admin`, chaque DevEUI peut être assigné à :

- **Code — intérieur**
- **PassiveHouse — intérieur**
- **Extérieur — partagé**
- **Non assigné**

Les assignations sont enregistrées dans Supabase et le dashboard recharge automatiquement les mappings environ toutes les 60 secondes. Aucun redéploiement Vercel n'est nécessaire lorsqu'une assignation change.

### État du Gateway SG50

La console `/admin` interroge aussi la **Milesight Development Platform Open API** pour enrichir la carte du SG50 avec :

- le statut `ONLINE / OFFLINE / DISCONNECT`;
- le niveau de batterie;
- l'état de charge/décharge;
- l'état solaire;
- la température batterie;
- le firmware et l'heure du dernier rapport.

Variables Vercel requises :

```
MILESIGHT_API_BASE_URL=https://us-openapi.milesight.com
MILESIGHT_CLIENT_ID=...
MILESIGHT_CLIENT_SECRET=...
```

Le Client Secret doit rester uniquement côté serveur et ne doit jamais utiliser le préfixe `VITE_`.

Si plusieurs gateways sont associés à la même Application Milesight, il est possible de forcer celui à afficher avec l'une des variables suivantes :

```
MILESIGHT_GATEWAY_DEVICE_ID=...
MILESIGHT_GATEWAY_DEVEUI=...
```

Sans ces variables optionnelles, le backend recherche automatiquement un device de type `GATEWAY` et privilégie le modèle `SG50`.


### Mise à jour Supabase requise

Après cette mise à jour, réexécuter entièrement :

```
supabase/schema.sql
```

dans **Supabase → SQL Editor**. Le script est idempotent et ajoute notamment la table `milesight_devices`.
