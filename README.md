# AFYA SPACE : système complet

Surveillance de la santé d'un équipage en mission longue durée et suivi du syndrome neuro-oculaire associé aux vols spatiaux (SANS), conçue pour fonctionner même avec une liaison radio limitée et différée.

Projet du **NASA Space Apps Challenge 2026 – Lubumbashi (RDC)**, réalisé par l'équipe AFYA SPACE.

> **Prototype de recherche, pas un dispositif médical.** Toutes les données sont simulées. Le SANS n'a pas de traitement établi et sa cause exacte reste inconnue : le projet ne pose aucun diagnostic, ne prescrit rien et ne choisit aucune dose. Les seuils et protocoles par défaut sont des valeurs de démonstration.

## Démo en ligne

Site : **https://victoirendala.github.io/AFYA-SPACE_0.2/**

| Page | Contenu |
|---|---|
| [`/`](https://victoirendala.github.io/AFYA-SPACE_0.2/) | Accueil du système complet |
| [`/afya-space/`](https://victoirendala.github.io/AFYA-SPACE_0.2/afya-space/) | Afya Space : suivi de l'équipage, la simulation tourne dans le navigateur (scénarios interactifs, assistant vocal) |
| [`/sans-guardian/`](https://victoirendala.github.io/AFYA-SPACE_0.2/sans-guardian/) | SANS Guardian : **instantané en lecture seule** enregistré depuis le vrai serveur, flux temps réel rejoué en boucle |

Sur le site, SANS Guardian ne peut pas écrire (séances, journal, voix, avancement de la mission) : ces actions demandent le serveur, à lancer en local (voir plus bas).

## Composition du projet

| Brique | Dossier | Technologies | Rôle |
|---|---|---|---|
| Afya Space, client | `afya-space/client` | React, Vite, Recharts | Suivi de l'équipage : constantes vitales, alertes, tendances, exercice, moral, mode hors ligne, jumeau numérique, assistant vocal. Mode démo sans serveur (`demoEngine.js`) |
| Afya Space, serveur | `afya-space/server` | Node, Express, WebSocket | Simulateur de constantes et règles d'alerte (port 3001) |
| Backend FastAPI | `backend/` | FastAPI, SQLAlchemy, SQLite, Alembic | Même API que le serveur Node (REST + WebSocket `/stream`), avec base de données et tests (port 8000) |
| SANS Guardian | `sans-guardian/` | React (client), Node + SQLite (serveur), Python (analyse) | Suivi neuro-oculaire : score de priorité expliqué, alertes graduées, contre-mesures, synchronisation prioritaire, données NASA OSDR, modèle de prédiction, rapports. Voir [sans-guardian/README.md](sans-guardian/README.md) |
| Simulation radio MQTT | `simulation_radio/` et `sans-guardian/tools/radio-mqtt/` | Python, paho-mqtt | Liaison station spatiale / sol : trames avec CRC, pertes, délai Terre-Lune, accusés de réception |
| Analyse et modèles | `sans/`, `models/`, `utils/`, `dashboard/` | Python, scikit-learn, XGBoost, Streamlit | Simulation d'équipage, pipeline de prédiction du risque, alertes, tableau de bord. Voir [docs/CREW_ANALYSIS.md](docs/CREW_ANALYSIS.md) |
| Données | `data/osdr`, `sans-guardian/analysis/data` | CSV, XLSX | Jeux de données NASA OSDR (GLDS-700, LSDS-132/135, OSD-815/817) et données d'équipage simulées |

## Démarrage rapide

Prérequis : Node 22 ou plus récent ; Python 3.12 pour le backend, l'analyse et la radio.

> Si la variable d'environnement `NODE_ENV` vaut `production` sur votre machine, `npm ci` ignore les devDependencies et `vite` est introuvable. Utilisez alors `npm ci --include=dev`.

**1. Afya Space** (serveur Node + client)

```bash
cd afya-space/server && npm install && npm start     # http://localhost:3001
cd afya-space/client && npm install && npm run dev   # http://localhost:5173
```

Pour la version sans serveur (comme sur le site) : `VITE_DEMO=1 npm run dev` dans `afya-space/client`.

**2. Afya Space avec le backend FastAPI**

```bash
cd backend && uv sync && uv run -m afya_space_api    # http://localhost:8000
cd afya-space/client && VITE_API_URL=http://localhost:8000 npm run dev
```

Sans `VITE_API_URL`, le client utilise `http://localhost:3001`. Le WebSocket est déduit de cette adresse. Les deux serveurs Node utilisent le port 3001 par défaut : lancez-les avec `PORT=...` si vous les démarrez ensemble.

**3. SANS Guardian** (serveur embarqué + tableau de bord)

```bash
cd sans-guardian/server && npm install && npm run simulate && npm start   # http://localhost:3001
cd sans-guardian/client && npm install && npm run dev                     # http://localhost:5173
```

Mode « tout-en-un » : `npm run build` dans `sans-guardian/client`, puis `npm start` dans `sans-guardian/server` et ouvrir http://localhost:3001.

**4. Analyse et modèles** (à la racine)

```bash
pip install -r requirements.txt
python -m sans.simulate --n_hist 200 --n_current 8 --seed 42
python -m sans.pipeline --data data/sans_crew_daily.csv --out outputs
streamlit run dashboard/app.py
```

**5. Simulation radio MQTT**

```bash
cd simulation_radio && pip install -r requirements.txt && python run_simulation.py
```

## Tests et intégration continue

La CI (`.github/workflows/ci.yml`) exécute les étapes ci-dessous à chaque push ; toutes passent sur `main`.

| Composant | Commande | Résultat |
|---|---|---|
| Backend FastAPI | `cd backend && uv run pytest` | 12 tests |
| Simulation radio (2 copies) | `cd simulation_radio && pytest` | 10 + 10 tests |
| Serveur SANS Guardian | `cd sans-guardian/server && npm test` | 13 tests |
| Pipeline d'analyse | `python -m sans.simulate` puis `python -m sans.pipeline` | meilleur modèle : Random Forest (AUC 0,99) sur données simulées |
| Clients React | `npm run build` (afya-space, sans-guardian) | compilation OK |
| Serveur Afya Space | démarrage + `GET /api/health` | OK |
| Lint Ruff | informatif, ne bloque pas | remarques de style restantes dans l'ancien code (`dashboard`, `models`, `utils`, `sans`) |

## Déploiement du site

Le workflow `.github/workflows/pages.yml` construit les deux clients et assemble le site (`site/index.html` pour l'accueil) à chaque push sur `main` qui touche `afya-space/`, `sans-guardian/client/` ou `site/`. À activer une fois : Settings → Pages → Source : « GitHub Actions ».

L'instantané de SANS Guardian est dans `sans-guardian/client/public/demo-data/`. Pour le régénérer après un changement du serveur :

```bash
cd sans-guardian/server && npm start                                   # dans un terminal
node scripts/export-static-demo.js --api http://localhost:3001         # dans un autre
```

La compilation statique du client se fait avec `VITE_STATIC=1` (et `VITE_BASE` pour le sous-chemin).

## Historique, branches et contributeurs

Ce dépôt réunit le travail de toute l'équipe à partir de [divinefeliciteyamba-cpu/AFYA-SPACE](https://github.com/divinefeliciteyamba-cpu/AFYA-SPACE).

- `main` contient le système complet, avec le contenu de toutes les branches d'origine.
- Les branches d'origine sont conservées telles quelles comme archives : `upstream-main` (le `main` d'origine), `Frontend-BEN`, `dkz`, `feat/prediction-model`, `feature/assistant-vocal` et `sans-guardian`.
- Leur historique est rattaché à `main` par une fusion de stratégie `ours` (le contenu de `main` n'a pas changé), pour que les contributeurs apparaissent dans le dépôt.

Contributeurs : Victoire Ndala, Jerez Jeremy, ENOCKDKZ, Divine Felicite Yamba, Enars Lukutu.

## Limites

- Données simulées uniquement ; le score de risque et les seuils ne sont pas validés cliniquement.
- Les vitamines B, les brassards de cuisse et la LBNP sont des pistes de recherche de la NASA, pas des traitements éprouvés. Les brassards agissent sur la circulation veineuse (la NASA a observé un flux veineux ralenti et un caillot chez des membres d'équipage) : tout usage exige une supervision médicale.
- L'authentification est un jeton statique, acceptable pour un prototype seulement.
- Sur le site, SANS Guardian est en lecture seule et la vidéo de couverture (`nasa-vision.mp4`) n'est pas incluse dans le dépôt.

## Sources de données

NASA Human Research Program (risque SANS), NASA Cardiovascular and Vision Laboratory, étude Thigh Cuff, NASA Open Science Data Repository (OSDR). Détail de ce qui est utilisé : [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) et [sans-guardian/docs/DATA_SOURCES.md](sans-guardian/docs/DATA_SOURCES.md). Rapport complet (français) : [sans-guardian/docs/Rapport_SANS.pdf](sans-guardian/docs/Rapport_SANS.pdf).

## Utilisation de l'IA

Ce projet a été développé avec l'assistance de Claude (Anthropic) pour la synthèse de recherche, la spécification, le code et l'intégration des branches. Voir `docs/DATA_SOURCES.md`.

## Licence

Apache License 2.0 : voir [LICENSE](LICENSE).
