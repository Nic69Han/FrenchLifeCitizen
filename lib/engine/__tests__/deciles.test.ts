import { describe, it, expect } from "vitest";
import { simulateDeciles } from "../deciles";
import { defaultStateParams } from "../data";

const state2026 = defaultStateParams(2026);

describe("simulateDeciles — structure", () => {
  const points = simulateDeciles(state2026, state2026, 2026);

  it("retourne exactement 9 déciles", () => {
    expect(points).toHaveLength(9);
  });

  it("déciles nommés D1 à D9", () => {
    expect(points.map((p) => p.decile)).toEqual(
      ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"]
    );
  });

  it("rang 1 à 9 cohérent", () => {
    points.forEach((p, i) => expect(p.rank).toBe(i + 1));
  });

  it("salaires bruts strictement croissants D1→D9", () => {
    for (let i = 1; i < points.length; i++) {
      expect(points[i].salaireBrutAnnuel).toBeGreaterThan(
        points[i - 1].salaireBrutAnnuel
      );
    }
  });

  it("salaire net mensuel estimé positif", () => {
    points.forEach((p) => expect(p.salaireNetMensuel).toBeGreaterThan(0));
  });

  it("chaque décile a 5 indicateurs baseline et scenario", () => {
    points.forEach((p) => {
      expect(p.baseline).toHaveLength(5);
      expect(p.scenario).toHaveLength(5);
    });
  });
});

describe("simulateDeciles — monotonie des indicateurs (baseline = scenario)", () => {
  const points = simulateDeciles(state2026, state2026, 2026);

  it("pouvoir d'achat croissant de D1 à D9", () => {
    const pa = points.map(
      (p) => p.baseline.find((i) => i.key === "pouvoirAchat")!.value
    );
    for (let i = 1; i < pa.length; i++) {
      expect(pa[i]).toBeGreaterThan(pa[i - 1]);
    }
  });

  it("score de précarité décroissant de D1 à D9", () => {
    const scores = points.map(
      (p) => p.baseline.find((i) => i.key === "scorePrecarite")!.value
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("pouvoir d'achat D9 au moins 3× celui de D1", () => {
    const pa = points.map(
      (p) => p.baseline.find((i) => i.key === "pouvoirAchat")!.value
    );
    expect(pa[8]).toBeGreaterThan(pa[0] * 3);
  });

  it("score de précarité D1 > D9", () => {
    const scores = points.map(
      (p) => p.baseline.find((i) => i.key === "scorePrecarite")!.value
    );
    expect(scores[0]).toBeGreaterThan(scores[8]);
  });

  it("tous les indicateurs sont des nombres finis", () => {
    points.forEach((p) => {
      [...p.baseline, ...p.scenario].forEach((ind) => {
        expect(Number.isFinite(ind.value)).toBe(true);
      });
    });
  });
});

describe("simulateDeciles — cohérence scénario vs baseline", () => {
  it("baseline = scenario quand les curseurs sont identiques (delta nul)", () => {
    const points = simulateDeciles(state2026, state2026, 2026);
    points.forEach((p) => {
      const bPa = p.baseline.find((i) => i.key === "pouvoirAchat")!.value;
      const sPa = p.scenario.find((i) => i.key === "pouvoirAchat")!.value;
      expect(Math.abs(sPa - bPa)).toBeLessThan(1); // moins de 1€ d'écart
    });
  });

  it("hausse SMIC +10 % améliore le pouvoir d'achat des déciles bas", () => {
    const scenarioPlusSmic = {
      ...state2026,
      smicBrutMensuel: state2026.smicBrutMensuel * 1.1,
    };
    const points = simulateDeciles(state2026, scenarioPlusSmic, 2026);
    // D1 (proche SMIC) doit bénéficier de la hausse
    const d1Base = points[0].baseline.find((i) => i.key === "pouvoirAchat")!.value;
    const d1Scen = points[0].scenario.find((i) => i.key === "pouvoirAchat")!.value;
    expect(d1Scen).toBeGreaterThan(d1Base);
  });

  it("hausse IR tranche haute n'affecte pas D1 (en-dessous du seuil imposable)", () => {
    // D9 à 85k€ brut reste sous la tranche à 45 % (seuil ~182k€ imposable).
    // Ce test vérifie uniquement que D1 (SMIC) n'est pas affecté.
    const scenarioIRHaut = {
      ...state2026,
      tauxMarginalIR: 0.60,
    };
    const points = simulateDeciles(state2026, scenarioIRHaut, 2026);
    // D1 (SMIC, loin de toute tranche haute) ne doit pas être impacté
    const d1Base = points[0].baseline.find((i) => i.key === "pouvoirAchat")!.value;
    const d1Scen = points[0].scenario.find((i) => i.key === "pouvoirAchat")!.value;
    expect(Math.abs(d1Scen - d1Base)).toBeLessThan(50); // impact < 50€
  });
});

describe("simulateDeciles — types de ménage", () => {
  const cel = simulateDeciles(state2026, state2026, 2026, "celibataire");
  const fam = simulateDeciles(state2026, state2026, 2026, "famille");
  const ret = simulateDeciles(state2026, state2026, 2026, "retraite");

  it("famille : 9 déciles valides", () => {
    expect(fam).toHaveLength(9);
    fam.forEach((p) => {
      [...p.baseline, ...p.scenario].forEach((ind) => {
        expect(Number.isFinite(ind.value)).toBe(true);
      });
    });
  });

  it("retraite : 9 déciles valides", () => {
    expect(ret).toHaveLength(9);
    ret.forEach((p) => {
      [...p.baseline, ...p.scenario].forEach((ind) => {
        expect(Number.isFinite(ind.value)).toBe(true);
      });
    });
  });

  it("famille D5 (médiane) a un pouvoir d'achat positif malgré les charges familiales", () => {
    const paFamD5 = fam[4].baseline.find((i) => i.key === "pouvoirAchat")!.value;
    expect(paFamD5).toBeGreaterThan(0);
  });

  it("retraité a un pouvoir d'achat positif à chaque décile", () => {
    ret.forEach((p) => {
      const pa = p.baseline.find((i) => i.key === "pouvoirAchat")!.value;
      expect(pa).toBeGreaterThan(0);
    });
  });

  it("score de précarité retraite D1 inférieur au célibataire D1 (propriétaire sans charges)", () => {
    const scoreCel = cel[0].baseline.find((i) => i.key === "scorePrecarite")!.value;
    const scoreRet = ret[0].baseline.find((i) => i.key === "scorePrecarite")!.value;
    // Propriétaire sans crédit = pas de loyer → charge fixe moindre
    expect(scoreRet).toBeLessThan(scoreCel);
  });
});
