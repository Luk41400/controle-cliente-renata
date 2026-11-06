export const statusOptions = ["novo", "em_andamento", "concluido"] as const;
export type Status = (typeof statusOptions)[number];
export const statusLabel: Record<Status, string> = { novo: "Novo", em_andamento: "Em andamento", concluido: "Concluído" };

export const fields = [
  { key: "nome", label: "Nome completo", min: 2, limit: 200, required: true, placeholder: "Como consta no documento", autocomplete: "name" },
  { key: "nome_social", label: "Nome Social", min: 0, limit: 200, required: false, placeholder: "Como prefere ser chamado(a)", autocomplete: "nickname" },
  { key: "endereco", label: "Endereço", min: 5, limit: 500, required: true, placeholder: "Rua, número, complemento, bairro, cidade, UF e CEP", autocomplete: "street-address" },
  { key: "rg", label: "RG", min: 3, limit: 35, required: true, placeholder: "Número do documento", autocomplete: "off" },
  { key: "cpf", label: "CPF", min: 0, limit: 14, required: true, placeholder: "000.000.000-00", autocomplete: "off" },
  { key: "filiacao", label: "Filiação", min: 2, limit: 360, required: true, placeholder: "Nome dos pais ou responsáveis", autocomplete: "off" },
  { key: "nacionalidade", label: "Nacionalidade", min: 2, limit: 80, required: true, placeholder: "Ex.: brasileira", autocomplete: "off" },
  { key: "cidade_nascimento", label: "Cidade de nascimento", min: 2, limit: 150, required: true, placeholder: "Cidade e UF ou país", autocomplete: "off" },
  { key: "caso_juridico", label: "Caso Jurídico", min: 10, limit: 12000, required: true, placeholder: "Descreva sua situação com suas próprias palavras…", autocomplete: "off" },
] as const;

export type Field = (typeof fields)[number]["key"];
export type ClientInput = Record<Field, string>;
export type FieldErrors = Partial<Record<Field, string>>;
export type ClientRow = Pick<ClientInput, "nome"> & { id: string; criado_em: string; status: Status };
export type Client = ClientRow & Omit<ClientInput, "nome" | "nome_social"> & { nome_social: string | null; versao: number };
export type Lawyer = { nome: string; oab_numero: string; oab_uf: string; permissao: "consulta" | "gestao" };
export type Note = { id: string; texto: string; advogado_nome: string; criado_em: string };
export type History = { id: string; acao: "cadastro" | "atualizacao" | "observacao"; advogado_nome: string | null; criado_em: string; detalhes: { campos?: string[]; status_anterior?: Status; status_novo?: Status } };

export const ufs = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export function isStatus(value: unknown): value is Status {
  return statusOptions.some((status) => status === value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function maskCpf(value: string) {
  return value.replace(/\D/g, "").slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, "$1-$2");
}

export function validCpf(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  return [9, 10].every((length) => {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    return ((sum * 10) % 11) % 10 === Number(cpf[length]);
  });
}

export function maskRg(value: string) {
  // Formato reconhecível com oito dígitos e verificador X. Preserve os demais formatos.
  return value.replace(/^(\d{2})(\d{3})(\d{3})(x)$/i, "$1.$2.$3-X");
}

export function emptyClient(): ClientInput {
  return Object.fromEntries(fields.map(({ key }) => [key, ""])) as ClientInput;
}

export function validateClient(input: Record<string, unknown>, partial = false) {
  const data = emptyClient();
  const errors: FieldErrors = {};
  for (const { key, min, limit, required } of fields) {
    if (partial && !Object.hasOwn(input, key)) continue;
    const raw = input[key];
    if (typeof raw !== "string") {
      if (required || raw != null) errors[key] = "Informe um valor válido.";
      continue;
    }
    const value = raw.trim();
    if (required && !value) errors[key] = "Preencha este campo.";
    else if ([...value].length < min) errors[key] = `Informe pelo menos ${min} caracteres.`;
    else if (value.length > limit) errors[key] = `Use até ${limit} caracteres.`;
    else if (value.includes("\0") || /\p{Cs}/u.test(value)) errors[key] = "Remova caracteres inválidos.";
    else if (key === "cpf") {
      const digits = value.replace(/\D/g, "");
      if (!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value) || !validCpf(digits)) {
        errors[key] = "Informe um CPF válido com 11 dígitos.";
      }
      data[key] = digits;
    } else {
      data[key] = key === "rg" ? maskRg(value) : value;
    }
  }
  return { data, errors, valid: Object.keys(errors).length === 0 };
}

export const brDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" });
export const brDateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" });

