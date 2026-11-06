import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Controle Cliente Renata", template: "%s | Controle Cliente Renata" },
  description: "Portal do escritório para cadastro de clientes e acompanhamento de atendimentos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}

