# 🇫🇷 FranceSim

**Simulateur socio-économique citoyen.** Créez un profil de citoyen français,
actionnez les leviers de l'État (impôts, SMIC, retraite, APL, taxe carbone…) et
observez **en temps réel** l'effet sur votre pouvoir d'achat, votre logement,
votre retraite et votre niveau de précarité — de **2000 à 2026**.

> Ce dépôt contient une **première tranche verticale fonctionnelle** (MVP
> vertical slice) du projet décrit dans `FRANCESIM_PLAN_OPUS.md` : un parcours
> complet et jouable de bout en bout, plutôt qu'un squelette de toutes les
> couches. Voir [Périmètre](#périmètre) ci-dessous.

---

## Démarrage rapide

```bash
npm install
npm run dev
# ouvrir http://localhost:3000
```

Aucune base de données, ni Redis, ni clé d'API n'est nécessaire : le moteur de
simulation tourne entièrement en TypeScript dans Next.js, à partir de données
économiques pré-chargées (`/data`).

| Script | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run start` | Sert le build de production |
| `npm run typecheck` | Vérification TypeScript (`tsc --noEmit`) |
| `npm run lint` | Lint Next.js |

---

## Architecture

Conformément au choix d'architecture retenu (application **Next.js unique**,
moteur en **TypeScript**, données **JSON embarquées**), pour obtenir un produit
qui tourne immédiatement sans dépendances d'infrastructure :

```
app/
  page.tsx              Écran d'accueil (3 portes d'entrée, animations)
  simulateur/page.tsx   Tableau de bord : profil · indicateurs · timeline · leviers
components/
  ProfilePanel.tsx      Profil citoyen éditable + archétypes
  StatePanel.tsx        Curseurs d'État ("Et si ?") groupés par domaine
  Slider.tsx            Curseur réutilisable avec comparaison à la valeur réelle
  IndicatorCard.tsx     Carte d'indicateur + tooltip de formule + delta vs réel
  TimelineChart.tsx     Graphique d'évolution (Recharts), réel vs scénario
lib/
  engine/               Moteur de simulation
    types.ts            Types Profil citoyen / Curseurs d'État / Indicateurs
    data.ts             Accès aux séries pré-chargées + curseurs par défaut
    tax.ts              Impôt sur le revenu progressif + quotient familial
    index.ts            simulate() — chaîne causale → 5 indicateurs + timeline
  archetypes.ts         4 profils types (Fatima, Bernard, Claire, Mohamed)
  store.ts              État global Zustand (profil, curseurs, année, mode)
    csp.ts              Caractéristiques par catégorie socioprofessionnelle
  format.ts             Formatage € / % / nombres en français
data/
  legal-parameters.json PARAMÈTRES LÉGAUX RÉELS (SMIC, barème IR par année, TVA,
                        RSA, allocations, cotisations, PSS) — OpenFisca-France
  pension-parameters.json PARAMÈTRES RETRAITE RÉELS par génération (âge légal,
                        trimestres) — OpenFisca-France-Pension, réforme 2023 incluse
  economic-series.json  Séries statistiques (IPC, carburant, loyers, crédit, APL)
                        — ordres de grandeur, non officiels (cf. ci-dessous)
scripts/
  ingest-openfisca.ts   Régénère legal-parameters.json (npm run ingest)
  ingest-pension.ts     Régénère pension-parameters.json (npm run ingest:pension)
```

### Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** — design system « Tableau de bord République » (marine / or /
  blanc République / rouge action)
- **Framer Motion** — animations et transitions
- **Recharts** — séries temporelles
- **Zustand** — état global

### Comment marche la simulation

1. Un **profil citoyen** (salaire, contrat, logement, enfants, santé…) et les
   **curseurs d'État** pour l'année choisie alimentent `simulate()`.
2. Le moteur calcule une **chaîne causale simplifiée** : revenu net → cotisations
   → impôt → aides (APL, allocations, RSA) → dépenses contraintes (loyer,
   transport, énergie, alimentation, reste à charge santé).
3. Il en déduit **5 indicateurs** : pouvoir d'achat net, taux d'effort logement,
   reste à vivre, pension de retraite estimée, score de précarité.
4. Tout est recalculé sur **chaque année 2000–2026** pour la timeline, et les
   montants sont **réindexés sur l'IPC**.
5. En mode **« Et si ? »**, les indicateurs du scénario sont comparés à ceux de
   la **France réelle** (curseurs historiques), avec deltas et double courbe.

Chaque indicateur expose sa **formule de calcul** via le bouton `?` (exigence du
plan : traçabilité et pédagogie).

---

## Périmètre

### Inclus dans cette tranche (MVP jouable)
- Profil citoyen éditable + 4 archétypes pré-configurés
- 12 curseurs d'État sur 5 domaines (fiscalité, social, retraites, logement/santé, énergie)
- Timeline 2000–2026 scrubable avec données pré-chargées
- 5 indicateurs citoyens calculés en temps réel, avec tooltips de formule
- Mode « Et si ? » : comparaison scénario vs France réelle (deltas + double courbe)
- Design complet animé (Framer Motion), responsive

### À venir (V2+, cf. plan)
- Ingestion réelle des APIs publiques (INSEE, data.gouv, Banque de France) + PostgreSQL
- Backend Python/FastAPI, cache Redis, calcul asynchrone Celery
- Vue impact par décile, mode Politique complet, mode Mandat 5 ans, comparateur
- Export PDF, authentification, mode Parti et classement communautaire

### Sur les données — deux niveaux

**1. Paramètres légaux RÉELS** (`data/legal-parameters.json` + `data/pension-parameters.json`)
SMIC, barème de l'impôt sur le revenu (par année), TVA, RSA, allocations
familiales, cotisations salariales et plafond Sécu proviennent
d'[**OpenFisca-France**](https://github.com/openfisca/openfisca-france) ; l'âge
légal de départ et la durée d'assurance retraite (par génération, **réforme
2023 incluse**) d'[**OpenFisca-France-Pension**](https://github.com/openfisca/openfisca-france-pension).
Ces dépôts encodent le droit fiscal et social français : chaque valeur y est
**datée et sourcée** (références JO / Légifrance / décrets). Fichiers
régénérables, commits épinglés pour la reproductibilité :

```bash
npm run ingest           # paramètres légaux (SMIC, IR, TVA, RSA, cotisations…)
npm run ingest:pension   # retraite par génération (âge légal, trimestres)
```

**2. Séries statistiques** (`data/economic-series.json`)
IPC/inflation, prix des carburants, loyers, taux de crédit et APL sont des
**ordres de grandeur calibrés, non officiels**. OpenFisca encode le *droit*, pas
les *statistiques* ; et les APIs INSEE / data.gouv / Banque de France ne sont
**pas accessibles** depuis l'environnement d'exécution actuel (politique réseau
— `host_not_allowed`). Ces séries seront remplacées par l'ingestion INSEE dès
que le réseau l'autorisera.

---

*Outil pédagogique — comprendre la politique et ses effets réels.*
