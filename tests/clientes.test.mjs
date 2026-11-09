import test from "node:test";
import assert from "node:assert/strict";
import { emptyClient, fields, maskCpf, maskRg, validCpf, validateClient } from "../src/lib/clientes.ts";

test("CPF com máscara e dígitos verificadores", () => {
  assert.equal(maskCpf("52998224725"), "529.982.247-25");
  assert.equal(maskCpf("5299822472"), "529.982.247-2");
  assert.equal(maskCpf("529982"), "529.982");
  assert.equal(validCpf("52998224725"), true);
  assert.equal(validCpf("52998224720"), false);
  assert.equal(validCpf("11111111111"), false);
});

test("validação preserva os formatos de RG e exige classificação", () => {
  assert.equal(fields.length, 11);
  const empty = validateClient(emptyClient());
  assert.equal(Object.keys(empty.errors).length, 7);
  assert.equal(maskRg("12345678x"), "12.345.678-X");
  assert.equal(maskRg("MG-123456"), "MG-123456");
  const data = { ...Object.fromEntries(fields.map(({ key }) => [key, "Exemplo sintético"])), cpf: "529.982.247-25", nome_social: "", tipo_caso: "administrativo" };
  assert.equal(validateClient(data).data.cpf, "52998224725");
  assert.equal(validateClient(data).valid, true);
  assert.equal(validateClient({ ...data, caso_juridico: "x".repeat(12001) }).valid, false);
  assert.equal(validateClient({ ...data, cpf: "abc52998224725" }).valid, false);
  assert.equal(validateClient({ endereco: "Rua nova" }, true).valid, true);
  assert.ok(validateClient({ endereco: "Rua" }, true).errors.endereco);
  for (const rg of ["", "RG-TESTE"]) {
    for (const cpf of ["", "529.982.247-25"]) {
      for (const tipo_caso of ["administrativo", "judicial"]) assert.equal(validateClient({ ...data, rg, cpf, tipo_caso }).valid, true);
    }
  }
  assert.ok(validateClient({ ...data, tipo_caso: "" }).errors.tipo_caso);
  assert.ok(validateClient({ ...data, tipo_caso: "outro" }).errors.tipo_caso);
  assert.ok(validateClient({ ...data, rg: "X" }).errors.rg);
  assert.equal(validateClient({ rg: null, cpf: null }, true).valid, true);
});

test("andamento é opcional, preserva parágrafos e não tem limite de caracteres", () => {
  const text = "  Primeiro parágrafo.\n\n" + "Atualização extensa. ".repeat(20000) + "\nÚltimo parágrafo.\n";
  for (const value of ["", "Curto", text]) {
    const result = validateClient({ andamento_caso: value }, true);
    assert.equal(result.valid, true);
    assert.equal(result.data.andamento_caso, value);
  }
  assert.equal(validateClient({ andamento_caso: null }, true).valid, true);
  assert.ok(validateClient({ andamento_caso: "Inválido\0" }, true).errors.andamento_caso);
});

