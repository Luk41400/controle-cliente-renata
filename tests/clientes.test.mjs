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

test("os nove campos são validados e os formatos de RG são preservados", () => {
  assert.equal(fields.length, 9);
  const empty = validateClient(emptyClient());
  assert.equal(Object.keys(empty.errors).length, 8);
  assert.equal(maskRg("12345678x"), "12.345.678-X");
  assert.equal(maskRg("MG-123456"), "MG-123456");
  const data = { ...Object.fromEntries(fields.map(({ key }) => [key, "Exemplo sintético"])), cpf: "529.982.247-25", nome_social: "" };
  assert.equal(validateClient(data).data.cpf, "52998224725");
  assert.equal(validateClient(data).valid, true);
  assert.equal(validateClient({ ...data, caso_juridico: "x".repeat(12001) }).valid, false);
  assert.equal(validateClient({ ...data, cpf: "abc52998224725" }).valid, false);
  assert.equal(validateClient({ endereco: "Rua nova" }, true).valid, true);
  assert.ok(validateClient({ endereco: "Rua" }, true).errors.endereco);
});

