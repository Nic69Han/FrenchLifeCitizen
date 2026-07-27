import { create } from "zustand";
import type { CitizenProfile, StateParams } from "@/lib/engine/types";
import { defaultStateParams } from "@/lib/engine";
import { DEFAULT_PROFILE } from "@/lib/archetypes";

const DEFAULT_YEAR = 2026;

interface SimStore {
  profile: CitizenProfile;
  /** Curseurs d'État modifiés par l'utilisateur (mode "Et si ?"). */
  state: StateParams;
  /** Curseurs d'État "France réelle" pour l'année — base de comparaison. */
  baseline: StateParams;
  year: number;
  etSiActif: boolean;

  setProfile: (p: Partial<CitizenProfile>) => void;
  loadProfile: (p: CitizenProfile) => void;
  setStateParam: <K extends keyof StateParams>(
    key: K,
    value: StateParams[K]
  ) => void;
  setYear: (y: number) => void;
  resetState: () => void;
  toggleEtSi: () => void;
}

export const useSim = create<SimStore>((set, get) => ({
  profile: DEFAULT_PROFILE,
  state: defaultStateParams(DEFAULT_YEAR),
  baseline: defaultStateParams(DEFAULT_YEAR),
  year: DEFAULT_YEAR,
  etSiActif: false,

  setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
  loadProfile: (p) => set({ profile: p }),
  setStateParam: (key, value) =>
    set((s) => ({ state: { ...s.state, [key]: value }, etSiActif: true })),
  setYear: (y) => {
    const base = defaultStateParams(y);
    // Si l'utilisateur n'a rien modifié, on suit la "France réelle".
    set((s) => ({
      year: y,
      baseline: base,
      state: s.etSiActif ? s.state : base,
    }));
  },
  resetState: () =>
    set((s) => ({ state: defaultStateParams(s.year), etSiActif: false })),
  toggleEtSi: () => set((s) => ({ etSiActif: !s.etSiActif })),
}));
