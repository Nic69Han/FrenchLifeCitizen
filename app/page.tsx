"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const portes = [
  {
    titre: "Je suis Citoyen",
    desc: "Créez votre profil et voyez l'effet réel des politiques sur votre vie.",
    emoji: "🧑‍🤝‍🧑",
    href: "/simulateur",
    accent: "from-or/30",
  },
  {
    titre: "Je suis Politique",
    desc: "Actionnez les leviers de l'État et mesurez l'impact sur les citoyens.",
    emoji: "🏛️",
    href: "/simulateur?mode=etsi",
    accent: "from-action/30",
  },
  {
    titre: "Je veux comprendre",
    desc: "Explorez les données publiques et la méthode de calcul, en clair.",
    emoji: "📊",
    href: "/simulateur",
    accent: "from-marine-600/40",
  },
];

export default function Landing() {
  return (
    <main className="bg-republique min-h-screen overflow-hidden">
      <div className="tricolore h-1 w-full" />

      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-12 text-center">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-4 text-sm uppercase tracking-[0.3em] text-or"
        >
          République numérique · Simulateur citoyen
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="font-display text-6xl font-bold leading-none md:text-8xl"
        >
          France<span className="text-or">Sim</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-republique/80 md:text-xl"
        >
          Et si vous pouviez changer une loi, un impôt, le SMIC — et voir
          aussitôt l&apos;effet sur <em>votre</em> pouvoir d&apos;achat&nbsp;?
          Manipulez les leviers de l&apos;État de 2000 à 2026.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="mt-8 inline-flex items-center gap-2 rounded-full glass px-4 py-2 text-sm text-republique/70"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-vert" />
          12 480 citoyens ont simulé leur vie cette semaine
        </motion.div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-6 pb-24 md:grid-cols-3">
        {portes.map((p, i) => (
          <motion.div
            key={p.titre}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 + i * 0.12 }}
          >
            <Link
              href={p.href}
              className={`group relative block h-full overflow-hidden rounded-2xl glass p-7 transition hover:border-or/50 hover:shadow-glow`}
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${p.accent} to-transparent opacity-0 transition group-hover:opacity-100`}
              />
              <div className="relative">
                <div className="mb-4 text-4xl">{p.emoji}</div>
                <h2 className="font-display text-2xl font-semibold">
                  {p.titre}
                </h2>
                <p className="mt-2 text-sm text-republique/70">{p.desc}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-or">
                  Entrer
                  <span className="transition group-hover:translate-x-1">→</span>
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </section>

      <footer className="border-t border-white/5 px-6 py-6 text-center text-xs text-republique/40">
        Données pré-chargées (ordres de grandeur INSEE · DGFiP · URSSAF · Banque
        de France). Outil pédagogique — MVP.
      </footer>
    </main>
  );
}
