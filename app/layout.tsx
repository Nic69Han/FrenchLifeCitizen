import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FranceSim — Simulez votre vie de citoyen",
  description:
    "Simulateur socio-économique citoyen : manipulez les leviers de l'État et observez en temps réel l'effet sur votre pouvoir d'achat, votre logement, votre retraite.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
