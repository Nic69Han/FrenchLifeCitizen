# 🇫🇷 FranceSim

**Simulateur socio-économique citoyen.** Créez un profil de citoyen français,
actionnez les leviers de l'État (impôts, SMIC, retraite, APL, taxe carbone…) et
observez **en temps réel** l'effet sur votre pouvoir d'achat, votre logement,
votre retraite et votre niveau de précarité — de **2000 à 2026**.

> Ce dépôt contient une **tranche verticale fonctionnelle** du projet : un parcours
> complet et jouable de bout en bout, avec données officielles et analyse macro-budgétaire.

---

## Démarrage rapide

```bash
npm install
npm run dev
# ouvrir http://localhost:3000
```

Aucune base de données, ni Redis, ni clé d'API n'est nécessaire : le moteur de
simulation tourne entièrement en TypeScript dans Next.js, à partir de données
officielles pré-chargées (`/data`).

| Script | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Suite de tests (vitest, 53 tests) |
| `npm run ingest` | Régénère les paramètres légaux (OpenFisca) |
| `npm run ingest:pension` | Régénère les paramètres retraite |
| `npm run ingest:insee` | Met à jour IPC + taux crédit (INSEE + BCE) |
| `npm run ingest:eurostat` | Met à jour les finances publiques APU |

---

## Architecture

```
app/
  page.tsx              Écran d'accueil (3 portes d'entrée, animations)
  simulateur/page.tsx   Tableau de bord : profil · indicateurs · timeline · leviers · macro · déciles
components/
  ProfilePanel.tsx      Profil citoyen éditable + archétypes
  StatePanel.tsx        Curseurs d'État ("Et si ?") groupés par domaine
  Slider.tsx            Curseur réutilisable avec comparaison à la valeur réelle
  IndicatorCard.tsx     Carte d'indicateur + tooltip de formule + delta vs réel
  TimelineChart.tsx     Graphique d'évolution (Recharts), réel vs scénario
  MacroPanel.tsx        Panneau finances publiques : solde APU, dette, impact par levier
  DecilePanel.tsx       Vue impact par décile D1–D9 : pouvoir d'achat / précarité
lib/
  engine/
    types.ts            Types Profil / Curseurs / Indicateurs
    data.ts             Accès aux séries pré-chargées + curseurs par défaut
    tax.ts              Impôt sur le revenu progressif + quotient familial
    index.ts            simulate() — chaîne causale → 5 indicateurs + timeline
    macro.ts            computeMacroImpact() — delta solde APU en pp PIB + Md€
    deciles.ts          simulateDeciles() — 9 profils D1–D9 (INSEE DADS 2023)
    csp.ts              Caractéristiques par catégorie socioprofessionnelle
  archetypes.ts         4 profils types (Fatima, Bernard, Claire, Mohamed)
  store.ts              État global Zustand (profil, curseurs, année, mode)
  format.ts             Formatage € / % / nombres en français
data/
  legal-parameters.json   PARAMÈTRES LÉGAUX RÉELS — OpenFisca-France
  pension-parameters.json PARAMÈTRES RETRAITE RÉELS par génération — OpenFisca-France-Pension
  economic-series.json    Séries statistiques (IPC ✅, taux crédit ✅, carburant*, loyers*)
  macro-series.json       FINANCES PUBLIQUES APU RÉELLES — Eurostat (13 séries)
scripts/
  ingest-utils.ts       Utilitaires partagés (YEAR_MIN/MAX, toAlignedArray…)
  ingest-openfisca.ts   Régénère legal-parameters.json
  ingest-pension.ts     Régénère pension-parameters.json
  ingest-insee.ts       Met à jour economic-series.json (IPC INSEE + taux BCE)
  ingest-eurostat.ts    Régénère macro-series.json (Eurostat SDMX-JSON)
```

### Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** — design system « Tableau de bord République »
- **Framer Motion** — animations et transitions
- **Recharts** — séries temporelles et graphiques
- **Zustand** — état global
- **Vitest** — tests unitaires (53 tests, CI GitHub Actions)

### Comment marche la simulation

1. Un **profil citoyen** (salaire, contrat, logement, enfants, santé…) et les
   **curseurs d'État** pour l'année choisie alimentent `simulate()`.
2. Le moteur calcule une **chaîne causale** : revenu net → cotisations
   → impôt → aides (APL, allocations, RSA) → dépenses contraintes (loyer,
   transport, énergie, alimentation, reste à charge santé).
3. Il en déduit **5 indicateurs** : pouvoir d'achat net, taux d'effort logement,
   reste à vivre, pension de retraite estimée, score de précarité.
4. Tout est recalculé sur **chaque année 2000–2026** pour la timeline, les
   montants étant **réindexés sur l'IPC réel INSEE**.
5. En mode **« Et si ? »**, les indicateurs du scénario sont comparés à ceux de
   la **France réelle** (curseurs historiques), avec deltas et double courbe.
6. `computeMacroImpact()` estime l'effet de chaque levier sur le **solde APU**
   (pp PIB, Md€) à partir d'élasticités calibrées (CPO, OCDE).

---

## Périmètre

### Inclus dans cette version

- Profil citoyen éditable + 4 archétypes pré-configurés
- 12 curseurs d'État sur 5 domaines (fiscalité, social, retraites, logement/santé, énergie)
- Timeline 2000–2026 scrubable avec données officielles pré-chargées
- 5 indicateurs citoyens calculés en temps réel, avec tooltips de formule
- Mode « Et si ? » : comparaison scénario vs France réelle
- **Vue par décile D1–D9** : impact de chaque mesure sur les différents niveaux de revenu
- **Panneau finances publiques** : solde APU, dette Maastricht, impact budgétaire par levier
- Design complet animé, responsive

### À venir (V2+)

- Backend Python/FastAPI, PostgreSQL, cache Redis
- Mode Politique complet (mandat 5 ans), comparateur, classement communautaire
- Export PDF, authentification

---

## Sur les données — deux niveaux

### Paramètres légaux RÉELS

`data/legal-parameters.json` + `data/pension-parameters.json`

SMIC, barème IR (par année), TVA, RSA, allocations familiales, cotisations
salariales et plafond Sécu proviennent d'[**OpenFisca-France**](https://github.com/openfisca/openfisca-france) ;
l'âge légal de départ et la durée d'assurance retraite (par génération, **réforme
2023 incluse**) d'[**OpenFisca-France-Pension**](https://github.com/openfisca/openfisca-france-pension).

```bash
npm run ingest           # SMIC, IR, TVA, RSA, cotisations…
npm run ingest:pension   # âge légal, trimestres requis par génération
```

### Séries statistiques et finances publiques

| Série | Statut | Source |
|---|---|---|
| IPC / inflation | 🟢 Réel | INSEE BDM série 001763852 (2000–2025) |
| Taux crédit immobilier | 🟢 Réel | BCE MIR — M.FR.B.A2C.F.R.A.2250.EUR.N |
| Solde APU (% PIB) | 🟢 Réel | Eurostat gov_10dd_edpt1 — déficit B9 |
| Dette Maastricht (% PIB) | 🟢 Réel | Eurostat gov_10dd_edpt1 — dette GD |
| PIB nominal | 🟢 Réel | Eurostat nama_10_gdp |
| Recettes/dépenses APU | 🟢 Réel | Eurostat gov_10a_main (TVA, IR, cotisations…) |
| Prix carburant | 🟡 Calibré | DGEC (données PDF/Excel, pas d'API nationale) |
| Loyers au m² | 🟡 Calibré | OLL locaux, pas de série nationale unifiée |

```bash
npm run ingest:insee      # IPC (INSEE) + taux crédit (BCE)
npm run ingest:eurostat   # finances publiques APU (Eurostat)
```

Aucune clé API requise. Les données officielles sont accessibles sans authentification.

---

*Outil pédagogique — comprendre la politique et ses effets réels.*
