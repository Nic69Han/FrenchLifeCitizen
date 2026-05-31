# Plan pour la prochaine session — FranceSim

> **Comment reprendre :** démarre une nouvelle session sur la branche
> `claude/new-session-Lbu9i` et dis simplement « lis NEXT_SESSION.md et continue ».
> Ce fichier est la mémoire inter-sessions (le conteneur est éphémère, seul git
> persiste).

Dernière mise à jour : 2026-05-31 · Branche : `claude/new-session-Lbu9i` · PR : #1 (draft)

---

## 1. Où on en est (état réel des données)

FranceSim distingue **deux niveaux de données** :

| Donnée | Statut | Source | Fichier |
|---|---|---|---|
| SMIC, barème IR, TVA, RSA, allocs familiales, cotisations salariales, PSS | 🟢 **Réel** | OpenFisca-France | `data/legal-parameters.json` |
| Âge légal retraite + trimestres (par génération, réforme 2023) | 🟢 **Réel** | OpenFisca-France-Pension | `data/pension-parameters.json` |
| IPC / inflation | 🟢 **Réel** | INSEE BDM série 001763852 (2000–2025, 26 ans) | `data/economic-series.json` |
| Taux crédit immo | 🟡 Calibré | Banque de France Webstat (sources identifiées, voir §3) | `data/economic-series.json` |
| Prix carburant | 🟡 Calibré | data.gouv.fr (pas d'agrégat national simple, voir §3) | `data/economic-series.json` |
| Loyers au m² | 🟡 Calibré | Observatoires des loyers (laisser calibré, voir §3) | `data/economic-series.json` |
| APL (barème moyen) | 🟡 Calibré | CAF (pas d'API simple) | `data/economic-series.json` |

Scripts d'ingestion (commits sources épinglés pour reproductibilité) :
- `npm run ingest` → `scripts/ingest-openfisca.ts` (paramètres légaux)
- `npm run ingest:pension` → `scripts/ingest-pension.ts` (retraite par génération)
- `npm run ingest:insee` → `scripts/ingest-insee.ts` (IPC ✅ — parse SDMX-XML)

Vérifs qui doivent toujours passer : `npm run typecheck` et `npm run build`.

---

## 2. Réseau — état actuel

Dans cette session (2026-05-31), **tous les APIs gouvernementaux sont accessibles** :

```
api.insee.fr   → 200 ✅      data.gouv.fr   → 301 ✅ (redirect HTTPS)
webstat.banque-france.fr → 200 ✅   ECB API → 400 🚫 (bloqué)
```

**Premier réflexe dans une nouvelle session : re-tester le réseau.**

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 "https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/001763852?startPeriod=2024&endPeriod=2024"
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 "https://www.data.gouv.fr/api/1/datasets/?q=carburant"
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 "https://webstat.banque-france.fr/"
```

---

## 3. Plan d'exécution (par ordre de priorité)

### ✅ Étape A — IPC réel (TERMINÉ)

Parser SDMX-XML ajouté dans `scripts/ingest-insee.ts` (`parseSdmxXml()` + détection
automatique du format). IPC 2000–2025 ingéré : base 100 en 2000, 147.9 en 2025.
Commit : `b900f2c`.

### Étape B — Taux crédit immo (BdF)

L'API BdF Webstat expose ses données via un endpoint ODS :
`https://webstat.banque-france.fr/api/explore/v2.1/catalog/datasets/tableaux_rapports_preetablis/`

Fichiers identifiés mais non téléchargés (timeout dans ce conteneur) :
- `tmf_mens_france_fr_tauxdebiteur.csv` → taux débiteurs trimestriels (archivé 2017)
- `tmf_mens_france_fr_txcrediteurs.csv` → taux créditeurs

⚠ **Ces fichiers sont des archives pré-formatées (CSV), pas une API temps-réel.**
Les téléchargements individuels ont du mal (timeout 20-30s dans ce conteneur).

**Approche recommandée pour la prochaine session :**
1. Essayer `curl -L --max-time 60` sur l'URL du fichier `tmf_mens_france_fr_tauxdebiteur`
   (URL : `https://webstat.banque-france.fr/api/explore/v2.1/catalog/datasets/tableaux_rapports_preetablis/files/b8242d67f0450fa076780c21b5534695`)
2. Inspecter le CSV : les taux habitat sont peut-être dans les colonnes MLM (>2 ans)
3. Écrire un `fetchBdfCsv()` qui télécharge, parse (séparateur `;`, encodage Latin-1)
   et extrait la colonne habitat en taux annuel

**Alternative si BdF reste bloqué :** chercher l'idbank de la série BdF dans
l'INSEE BDM — la BdF y publie parfois ses MIR (Monetary Interest Rates).
Ex. : chercher dans l'interface BDM des séries contenant "crédit" + "habitat" + "France".

### Étape C — Prix carburant (data.gouv.fr)

Les jeux de données data.gouv.fr pour le carburant sont tous **régionaux ou instantanés**
(Île-de-France, Corse, Dijon, Orléans Métropole, etc.) — pas d'agrégat national mensuel.

**Piste principale :** le dataset `5d6de66206e3e74dabd78afe` ("Prix des carburants - Flux
Quotidien") est Île-de-France. Mais l'API prix-carburants.gouv.fr expose les prix
par station en temps réel, pas d'historique annuel.

**Recommandation :** laisser calibré et documenter. Les données SDES/DGEC sur les prix
des produits pétroliers sont publiées en PDF/Excel sur le site du ministère
(`statistiques.developpement-durable.gouv.fr`) — trop complexe à automatiser.

### Étape D — Loyers (laisser calibré)

Pas de série nationale simple. Les OLL (observatoires locaux des loyers) publient des
données par ville, pas une série temporelle nationale unifiée. Laisser calibré + documenter.

### Étape E — Commit + PR

- Pousser sur `claude/new-session-Lbu9i` ; la **PR #1 existe déjà** (draft).
- Mettre à jour le tableau du README « Sur les données » si des séries passent au vert.

---

## 4. Pistes produit (travaux sans dépendance réseau)

1. **Tests + CI** — ajouter quelques tests du moteur (`lib/engine/`) : cas connus
   (IR d'un célibataire au SMIC, pension par génération 1965 = 172 trim / 63,25 ans,
   RSA socle), puis un workflow GitHub Actions `typecheck + build + test`.
   Voir la skill `session-start-hook` pour garantir que les tests tournent en session web.
2. **Vue par décile** — exploiter le moteur existant pour afficher l'effet d'un
   scénario par décile de revenu (côté `app/` + `lib/engine/`).
3. **Robustesse ingestion** — extraire la logique commune des 3 scripts
   `ingest-*.ts` (fetch + résolution datée + écriture) dans un util partagé.

---

## 5. Repères techniques rapides

- **Stack** : Next.js (app router) + TypeScript + moteur pur dans `lib/engine/`.
  Données JSON embarquées dans `data/`. Pas de backend ni de base.
- **IPC** : série INSEE BDM `001763852` (IPC ensemble ménages France, base 2015
  rebasée 2000=100). Parser SDMX-XML dans `scripts/ingest-insee.ts:parseSdmxXml()`.
- **Moteur retraite** : la pension dépend de l'**année de naissance** du profil
  (= année simulée − âge), résolue via `ageLegalGeneration()` /
  `trimestresCiblesGeneration()` dans `lib/engine/data.ts`. Le curseur d'État
  « Et si ? » peut surcharger ces valeurs.
- **Commits sources épinglés** :
  - OpenFisca-France : `9793bc729d0fb914bfc3b270f8f1aba47a700015`
  - OpenFisca-France-Pension : `1c454230b1114e9197af509606cfff1de4e16b6b`
- **Validation grille CNAV** (doit rester vraie) : gén. 1945 = 60 ans/160 trim ·
  1955 = 62/166 · 1965 = 63,25/172 · 1968 = 64/172.
- **Git** : développer sur `claude/new-session-Lbu9i`,
  `git push -u origin claude/new-session-Lbu9i`, PR #1 déjà ouverte en draft.
