import type { Metadata } from "next";
import { AdminPortal } from "@/components/admin-portal";

export const metadata: Metadata = { title: "Área do advogado", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminPortal />;
}

