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
| IPC / inflation | 🟡 Calibré → **pipeline prêt** | INSEE BDM (à exécuter) | `data/economic-series.json` |
| Taux crédit immo | 🟡 Calibré | Banque de France Webstat (à brancher) | `data/economic-series.json` |
| Prix carburant | 🟡 Calibré | DGEC / data.gouv (à brancher) | `data/economic-series.json` |
| Loyers au m² | 🟡 Calibré | Observatoires des loyers (à brancher) | `data/economic-series.json` |
| APL (barème moyen) | 🟡 Calibré | CAF (pas d'API simple) | `data/economic-series.json` |

Scripts d'ingestion (commits sources épinglés pour reproductibilité) :
- `npm run ingest` → `scripts/ingest-openfisca.ts` (paramètres légaux)
- `npm run ingest:pension` → `scripts/ingest-pension.ts` (retraite par génération)
- `npm run ingest:insee` → `scripts/ingest-insee.ts` (séries INSEE — **bloqué réseau**)

Vérifs qui doivent toujours passer : `npm run typecheck` et `npm run build`.

---

## 2. Le blocage réseau (à lever en priorité)

L'environnement applique une **politique réseau par allowlist**. Aujourd'hui seul
`raw.githubusercontent.com` répond ; tout le reste renvoie **`403 host_not_allowed`** :

```
data.gouv.fr   → 403      api.insee.fr   → 403/000
www.insee.fr   → 403      webstat BdF    → 403
geo.api.gouv.fr→ 403      github raw     → 200 ✅
```

**Cette politique est figée au démarrage du conteneur.** Pour la lever :
1. Dans la config de l'environnement (app Claude Code web/mobile), autoriser les
   hôtes gouvernementaux **avant** de démarrer la session.
2. Démarrer une **nouvelle** session (le changement ne s'applique pas à une
   session déjà en cours).
3. **Premier réflexe dans la nouvelle session : tester le réseau** avant tout.

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 "https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/001763852?startPeriod=2024&endPeriod=2024"
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 "https://www.data.gouv.fr/api/1/datasets/?q=carburant"
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 "https://webstat.banque-france.fr/"
```
- `200` ⇒ on enchaîne les ingestions ci-dessous.
- `403 host_not_allowed` ⇒ réseau toujours fermé : reboucler sur l'étape 1
  (rien dans le code ne peut contourner ce mur).

---

## 3. Plan d'exécution (par ordre de priorité)

### Étape A — IPC réel (le plus important, déjà câblé)
Le pipeline est écrit ; il ne manque que le réseau.
```bash
npm run ingest:insee -- --dry-run   # vérifier le parsing sans écrire
npm run ingest:insee                # écrit data/economic-series.json
npm run typecheck && npm run build
```
- Si l'API exige une clé : `INSEE_API_KEY=... npm run ingest:insee`.
- Vérifier que `meta.seriesReelles` contient `"ipc"` et que `data.ipc[0] === 100`
  (base 2000). Comparer 2-3 points à l'INSEE (inflation cumulée ~+50 % sur 2000→2024).
- Si le SDMX-JSON n'est pas parsé : inspecter une réponse brute
  (`curl ... | head -c 2000`), ajuster `parseSdmxJson()` dans
  `scripts/ingest-insee.ts` (peut renvoyer du SDMX-ML/XML par défaut → forcer
  `?format=json` ou ajouter un parseur XML).

### Étape B — Brancher les 3 séries `idbank: null` du registre
Dans `scripts/ingest-insee.ts`, le `REGISTRY` documente déjà les sources. Pour
chacune : trouver la série, vérifier le format, écrire un fetcher dédié, brancher,
re-tester en `--dry-run`.
1. **Taux crédit immo** — Banque de France **Webstat** (taux moyen des crédits
   à l'habitat aux particuliers). API différente d'INSEE → fetcher séparé
   (probablement `fetchBdfSeries()`), même logique d'agrégation annuelle.
2. **Prix carburant** — **data.gouv.fr** (jeu « prix des carburants » DGEC) ou
   série DPEnergie. Données souvent quotidiennes/par station → agréger en
   moyenne nationale annuelle (SP95-E10 ou Gazole). Volume potentiellement gros :
   privilégier un agrégat si disponible.
3. **Loyers au m²** — pas de série BDM nationale simple. Sources possibles :
   observatoires locaux des loyers (OLL) / data.gouv « carte des loyers ».
   À défaut d'une série annuelle propre, **laisser calibré** et le documenter
   plutôt que d'inventer.

Garder le principe **non destructif** déjà en place : une série non trouvée
reste calibrée et marquée non officielle (`meta.seriesReelles`).

### Étape C — Commit + PR
- Commit par lot cohérent (ex. « feat(data): IPC réel INSEE » séparé de
  « feat(data): crédit immo BdF »).
- Pousser sur `claude/new-session-Lbu9i` ; la **PR #1 existe déjà** (draft), pas
  besoin d'en créer une autre.
- Mettre à jour le tableau de la section README « Sur les données » au fur et à
  mesure que des séries passent au vert.

---

## 4. Pistes produit (si le réseau reste fermé / en parallèle)

Travaux sans dépendance réseau, utiles quoi qu'il arrive :
1. **Tests + CI** — ajouter quelques tests du moteur (`lib/engine/`) : cas connus
   (IR d'un célibataire au SMIC, pension par génération 1965 = 172 trim / 63,25 ans,
   RSA socle), puis un workflow GitHub Actions `typecheck + build + test`.
   Voir la skill `session-start-hook` pour garantir que les tests tournent en
   session web.
2. **Vue par décile** — exploiter le moteur existant pour afficher l'effet d'un
   scénario par décile de revenu (côté `app/` + `lib/engine/`).
3. **Robustesse ingestion** — extraire la logique commune des 3 scripts
   `ingest-*.ts` (fetch + résolution datée + écriture) dans un util partagé.

---

## 5. Repères techniques rapides

- **Stack** : Next.js (app router) + TypeScript + moteur pur dans `lib/engine/`.
  Données JSON embarquées dans `data/`. Pas de backend ni de base.
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
