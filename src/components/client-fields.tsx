"use client";

import { caseLabel, caseOptions, fields, maskCpf, maskRg, type ClientInput, type Field, type FieldErrors } from "@/lib/clientes";

export function ClientFields({ names, values, errors, onChange, prefix }: {
  names: Field[];
  values: ClientInput;
  errors: FieldErrors;
  onChange: (key: Field, value: string) => void;
  prefix: string;
}) {
  return names.map((key) => {
    const field = fields.find((candidate) => candidate.key === key)!;
    const id = `${prefix}-${key}`;
    if (key === "tipo_caso") return <fieldset className="case-options field-wide" key={key}
      aria-describedby={errors[key] ? `${id}-error` : undefined} aria-invalid={Boolean(errors[key])}>
      <legend>Tipo de caso jurídico {prefix === "cadastro" && <span className="required" aria-hidden="true">*</span>}</legend>
      <div className="radio-options">{caseOptions.map((option, index) => <label key={option}>
        <input id={index === 0 ? id : `${id}-${option}`} type="radio" name={id} value={option}
          checked={values[key] === option} required={prefix === "cadastro"} onChange={() => onChange(key, option)} />
        {caseLabel[option]}
      </label>)}</div>
      {errors[key] && <p id={`${id}-error`} className="field-error">{errors[key]}</p>}
    </fieldset>;
    const help = key === "caso_juridico" ? "Conte o que aconteceu, quando ocorreu e como o escritório pode ajudar. Inclua apenas informações necessárias ao atendimento." : "";
    const control = {
      id, name: key, value: values[key], maxLength: field.limit, required: field.required,
      placeholder: field.placeholder, autoComplete: prefix === "cadastro" ? field.autocomplete : "off",
      "aria-invalid": errors[key] ? true : undefined,
      "aria-describedby": [help && `${id}-help`, errors[key] && `${id}-error`].filter(Boolean).join(" ") || undefined,
    };
    return <div key={key} className={`field${key === "caso_juridico" || key === "endereco" ? " field-wide" : ""}`}>
      <label htmlFor={id}>{field.label} {field.required ? <span className="required" aria-hidden="true">*</span> : <span className="optional">Opcional</span>}</label>
      {help && <p id={`${id}-help`} className="field-help">{help}</p>}
      {key === "caso_juridico"
        ? <textarea {...control} rows={6} onChange={(event) => onChange(key, event.target.value)} />
        : <input {...control} inputMode={key === "cpf" ? "numeric" : undefined}
            onBlur={key === "rg" ? () => onChange(key, maskRg(values[key].trim())) : undefined}
            onChange={(event) => onChange(key, key === "cpf" ? maskCpf(event.target.value) : event.target.value)} />}
      {errors[key] && <p id={`${id}-error`} className="field-error">{errors[key]}</p>}
    </div>;
  });
}

