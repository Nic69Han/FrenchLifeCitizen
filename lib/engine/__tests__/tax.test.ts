import { describe, it, expect } from "vitest";
import { impotRevenuAnnuel, impotMensuel, partsFiscales } from "../tax";
import { irBrackets, defaultStateParams } from "../data";
import type { CitizenProfile } from "../types";

// Profil de base réutilisé dans plusieurs tests
const baseProfile: CitizenProfile = {
  nom: "Test",
  age: 35,
  situationFamiliale: "celibataire",
  nbEnfants: 0,
  csp: "employe",
  salaireBrutAnnuel: 21876,
  contrat: "cdi",
  anciennete: 10,
  logement: "locatairePrive",
  surfaceM2: 40,
  chauffage: "electrique",
  loyerOuMensualite: 700,
  transport: "transportCommun",
  distanceTravailKm: 10,
  sante: "bonne",
  budgetAlimentaireMensuel: 350,
  abonnementsMensuels: 50,
  loisirsMensuels: 100,
};

describe("partsFiscales", () => {
  it("célibataire sans enfant → 1 part", () => {
    expect(partsFiscales({ ...baseProfile, situationFamiliale: "celibataire", nbEnfants: 0 })).toBe(1);
  });

  it("marié sans enfant → 2 parts", () => {
    expect(partsFiscales({ ...baseProfile, situationFamiliale: "marie", nbEnfants: 0 })).toBe(2);
  });

  it("célibataire 2 enfants → 2 parts", () => {
    expect(partsFiscales({ ...baseProfile, situationFamiliale: "celibataire", nbEnfants: 2 })).toBe(2);
  });

  it("marié 3 enfants → 2 + 0.5 + 0.5 + 1 = 4 parts", () => {
    expect(partsFiscales({ ...baseProfile, situationFamiliale: "marie", nbEnfants: 3 })).toBe(4);
  });
});

describe("impotRevenuAnnuel — barème 2026", () => {
  const brackets2026 = irBrackets(2026);
  const tauxHaut2026 = 0.45;

  it("revenu nul → 0 €", () => {
    expect(impotRevenuAnnuel(0, 2026, 1, tauxHaut2026)).toBe(0);
  });

  it("revenu imposable < première tranche (11 600 €) → 0 €", () => {
    expect(impotRevenuAnnuel(11000, 2026, 1, tauxHaut2026)).toBe(0);
  });

  it("célibataire au SMIC 2026 — IR annuel ≈ 593 €", () => {
    // SMIC 2026 = 1823 €/mois. Cotisations 13.71 %. Net 1573 €/mois.
    // Imposable = 1573*12 * 0.9 = 16 989 €. IR = (16 989 - 11 600) * 11 % = 593 €.
    const imposable = 1573.07 * 12 * 0.9;
    const ir = impotRevenuAnnuel(imposable, 2026, 1, tauxHaut2026);
    expect(ir).toBeGreaterThan(580);
    expect(ir).toBeLessThan(610);
  });

  it("quotient familial réduit l'impôt (marié 2 enfants vs célibataire)", () => {
    const imposable = 50000;
    const irCelib = impotRevenuAnnuel(imposable, 2026, 1, tauxHaut2026);
    const irCouple = impotRevenuAnnuel(imposable, 2026, 4, tauxHaut2026);
    expect(irCouple).toBeLessThan(irCelib);
  });

  it("IR proportionnel au nombre de parts (4 parts → moins que 1 part)", () => {
    const imposable = 80000;
    const ir1 = impotRevenuAnnuel(imposable, 2026, 1, tauxHaut2026);
    const ir4 = impotRevenuAnnuel(imposable, 2026, 4, tauxHaut2026);
    expect(ir4).toBeLessThan(ir1);
  });
});

describe("impotMensuel", () => {
  const state2026 = defaultStateParams(2026);

  it("sans emploi (RSA) → 0 €", () => {
    const profile: CitizenProfile = { ...baseProfile, contrat: "sansEmploi" };
    // impotMensuel n'est pas appelé pour sansEmploi dans computeYear,
    // mais la fonction elle-même doit calculer un IR sur le revenu passé.
    // On vérifie juste qu'elle ne plante pas.
    expect(() => impotMensuel(profile, 0, 2026, state2026)).not.toThrow();
  });

  it("célibataire au SMIC → IR mensuel ≈ 49 €", () => {
    const netAnnuel = 1573.07 * 12;
    const ir = impotMensuel(baseProfile, netAnnuel, 2026, state2026);
    expect(ir).toBeGreaterThan(45);
    expect(ir).toBeLessThan(55);
  });

  it("revenu élevé → IR mensuel non nul", () => {
    const ir = impotMensuel(baseProfile, 100000, 2026, state2026);
    expect(ir).toBeGreaterThan(1000);
  });
});
