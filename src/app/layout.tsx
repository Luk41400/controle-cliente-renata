import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Advocacia Rodrigues e Alves", template: "%s | Advocacia Rodrigues e Alves" },
  description: "Portal do escritório para cadastro de clientes e acompanhamento de atendimentos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}

