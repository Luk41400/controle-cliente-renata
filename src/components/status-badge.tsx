import { statusLabel, type Status } from "@/lib/clientes";

export function StatusBadge({ status }: { status: Status }) {
  const style = status === "novo" ? "new" : status === "em_andamento" ? "active" : "done";
  return <span className={`status-badge status-${style}`}><span aria-hidden="true" />{statusLabel[status]}</span>;
}

