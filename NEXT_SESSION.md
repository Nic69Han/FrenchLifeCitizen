# Plan pour la prochaine session — FranceSim

> **Comment reprendre :** démarre une nouvelle session sur la branche
> `claude/next-session-review-gZUsM` et dis simplement « lis NEXT_SESSION.md et continue ».
> Ce fichier est la mémoire inter-sessions (le conteneur est éphémère, seul git persiste).

Dernière mise à jour : 2026-06-01 (session 2) · Branche : `claude/next-session-review-gZUsM` · PR : #2 (draft)

---

## 1. Où on en est (état réel des données)

| Donnée | Statut | Source | Fichier |
|---|---|---|---|
| SMIC, barème IR, TVA, RSA, allocs familiales, cotisations salariales, PSS | 🟢 **Réel** | OpenFisca-France | `data/legal-parameters.json` |
| Âge légal retraite + trimestres (par génération, réforme 2023) | 🟢 **Réel** | OpenFisca-France-Pension | `data/pension-parameters.json` |
| IPC / inflation | 🟢 **Réel** | INSEE BDM série 001763852 (2000–2025, 26 ans) | `data/economic-series.json` |
| Taux crédit immo | 🟢 **Réel** | BCE — MIR/M.FR.B.A2C.F.R.A.2250.EUR.N (2000–2025) | `data/economic-series.json` |
| Déficit APU, dette, PIB, recettes/dépenses APU | 🟢 **Réel** | Eurostat (gov_10dd_edpt1, nama_10_gdp, gov_10a_main) | `data/macro-series.json` |
| Prix carburant | 🟡 Calibré | data.gouv.fr (pas d'agrégat national simple, voir §3) | `data/economic-series.json` |
| Loyers au m² | 🟡 Calibré | Observatoires des loyers (laisser calibré) | `data/economic-series.json` |
| APL (barème moyen) | 🟡 Calibré | CAF (pas d'API simple) | `data/economic-series.json` |

Scripts d'ingestion :
- `npm run ingest` → `scripts/ingest-openfisca.ts` (paramètres légaux)
- `npm run ingest:pension` → `scripts/ingest-pension.ts` (retraite par génération)
- `npm run ingest:insee` → `scripts/ingest-insee.ts` (IPC ✅ + taux crédit immo ✅ BCE MIR)
- `npm run ingest:eurostat` → `scripts/ingest-eurostat.ts` (finances publiques APU ✅)

Vérifs qui doivent toujours passer : `npm run typecheck`, `npm test`, `npm run build`.

---

## 2. Réseau — état session 2026-06-01

```
api.insee.fr   → 301 ✅ (redirect HTTPS)
webstat.banque-france.fr → 200 ✅
data-api.ecb.europa.eu → 200 ✅  (BCE MIR fonctionne !)
ec.europa.eu/eurostat → 200 ✅
```

**Premier réflexe dans une nouvelle session : re-tester les APIs critiques.**

```bash
# BCE MIR (taux crédit immo)
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 \
  "https://data-api.ecb.europa.eu/service/data/MIR/M.FR.B.A2C.F.R.A.2250.EUR.N?format=jsondata&startPeriod=2024-01&endPeriod=2024-12"
# Eurostat
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 \
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10dd_edpt1?geo=FR&format=JSON"
```

---

## 3. Ce qui a été fait (session 2026-06-01)

### ✅ Taux crédit immo — BCE MIR (Étape B)

Série `MIR/M.FR.B.A2C.F.R.A.2250.EUR.N` de l'API BCE SDW. Format SDMX-JSON,
parser `parseSdmxJson()` réutilisé dans `scripts/ingest-insee.ts`. Données 2000–2025 :
5,9 % en 2000, creux 1,23 % en 2021, remonté à 3,93 % en 2024.

### ✅ Finances publiques APU — Eurostat (Étape macro)

Script `scripts/ingest-eurostat.ts` + fichier `data/macro-series.json` (13 séries).
Moteur `lib/engine/macro.ts` : `computeMacroImpact()` calcule le delta solde APU
en pp PIB et Md€ pour chaque levier d'État (élasticités calibrées CPO/OCDE).
Composant `components/MacroPanel.tsx` dans le simulateur.

### ✅ Vue par décile D1–D9

`lib/engine/deciles.ts` : `simulateDeciles()` — 9 profils représentatifs célibataire
ETP (D1≈SMIC, D5≈médiane, D9≈cadre senior), calibrés INSEE DADS 2023.
`components/DecilePanel.tsx` : graphique à barres interactif avec baseline vs scénario
et barre de delta. Affiché dans le simulateur sous la timeline.

### ✅ Robustesse ingestion — util partagé

`scripts/ingest-utils.ts` : `YEAR_MIN`, `YEAR_MAX`, `YEARS`, `toAlignedArray()`,
`toAnnualMean()`, `readDataFile()`, `writeDataFile()`. Importé dans `ingest-eurostat.ts`.

### ✅ Tests + CI (session précédente)

53 tests vitest (data, tax, engine, macro). Workflow GitHub Actions (typecheck → test → build).

---

## 4. Pistes produit (travaux futurs)

1. **Prix carburant** — Laisser calibré. Sources identifiées mais non accessibles
   proprement en national : DGEC publie des PDF, data.gouv.fr n'a que du régional.
   Alternative future : série INSEE `001762384` (indice prix carburant dans l'IPC) ?
   
2. **Tests décile** — ✅ **Fait.** 19 tests dans `lib/engine/__tests__/deciles.test.ts` :
   structure (9 déciles, nommage, monotonie salaires), monotonie indicateurs
   (pouvoirAchat croissant D1→D9, scorePrecarite décroissant), cohérence scénario
   vs baseline, et 5 tests par type de ménage (famille, retraite). Total : 72 tests.

3. **Vue "Et si ?" décile élargie** — ✅ **Fait.** `DecilePanel.tsx` dispose d'un
   sélecteur de type de ménage (Célibataire / Famille 2 enf. / Retraité).
   `simulateDeciles()` accepte un 4e paramètre `menage: MenageType = "celibataire"`.
   Trois profils : célibataire 35 ans locataire, couple 2 enfants locataire 70m²,
   retraité 67 ans propriétaire sans crédit.

4. **README mise à jour** — Mettre à jour le tableau "Sur les données" dans README.md
   pour refléter les 5 séries désormais réelles (IPC, taux crédit, dette, déficit, PIB).

5. **OpenFisca re-ingestion** — Les paramètres légaux (legal-parameters.json) sont
   épinglés sur commit `9793bc7`. Si une nouvelle version d'OpenFisca-France sort
   avec des mises à jour 2026, relancer `npm run ingest`.

---

## 5. Repères techniques rapides

- **Stack** : Next.js (app router) + TypeScript + moteur pur dans `lib/engine/`.
  Données JSON embarquées dans `data/`. Pas de backend ni de base.
- **BCE MIR** : `data-api.ecb.europa.eu/service/data/MIR/{key}?format=jsondata`.
  Format identique SDMX-JSON (même `parseSdmxJson()` que Eurostat/INSEE).
- **Eurostat SDMX-JSON** : format 2.0 avec `value` (map à index plat), `id`
  (ordre des dimensions), `size`, `dimension` (labels/indices). Stride calculation
  dans `extractSeries()`.
- **Moteur retraite** : la pension dépend de l'**année de naissance** du profil
  (= année simulée − âge), résolue via `ageLegalGeneration()` /
  `trimestresCiblesGeneration()` dans `lib/engine/data.ts`.
- **Commits sources épinglés** :
  - OpenFisca-France : `9793bc729d0fb914bfc3b270f8f1aba47a700015`
  - OpenFisca-France-Pension : `1c454230b1114e9197af509606cfff1de4e16b6b`
- **Validation grille CNAV** (doit rester vraie) : gén. 1945 = 60 ans/160 trim ·
  1955 = 62/166 · 1965 = 63,25/172 · 1968 = 64/172.
- **Git** : développer sur `claude/next-session-review-gZUsM`,
  `git push -u origin claude/next-session-review-gZUsM`, PR #2 ouverte en draft.
