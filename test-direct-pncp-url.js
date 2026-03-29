import assert from "node:assert/strict";
import { buildPncpDirectUrl, hasPncpDirectIdentifiers } from "./src/lib/esaScoring.js";

function run() {
  const direct = buildPncpDirectUrl({
    orgaoCnpj: "12345678000199",
    ano: "2026",
    sequencial: "1",
    fallbackUrl: "https://pncp.gov.br/app/editais?pagina=1"
  });

  assert.equal(
    direct,
    "https://pncp.gov.br/app/editais/12345678000199/2026/1",
    "Deve usar link direto quando houver CNPJ/ano/sequencial"
  );

  const fromPncpId = buildPncpDirectUrl({
    pncpId: "12345678000199-1-000017/2026",
    fallbackUrl: "https://pncp.gov.br/app/editais?pagina=1"
  });

  assert.equal(
    fromPncpId,
    "https://pncp.gov.br/app/editais/12345678000199/2026/17",
    "Deve extrair identificadores do pncp_id quando campos dedicados ausentes"
  );

  const fallback = buildPncpDirectUrl({
    orgaoCnpj: "",
    ano: "",
    sequencial: "",
    pncpId: "",
    fallbackUrl: "https://pncp.gov.br/app/editais?q=teste"
  });

  assert.equal(
    fallback,
    "https://pncp.gov.br/app/editais?q=teste",
    "Deve cair no fallback quando nao houver identificadores suficientes"
  );

  assert.equal(
    hasPncpDirectIdentifiers({ orgaoCnpj: "12345678000199", ano: "2026", sequencial: "7" }),
    true,
    "Helper deve indicar disponibilidade de link direto"
  );

  assert.equal(
    hasPncpDirectIdentifiers({ pncpId: "12345678000199-1-000011/2026" }),
    true,
    "Helper deve reconhecer disponibilidade de link direto via pncp_id"
  );

  assert.equal(
    hasPncpDirectIdentifiers({ orgaoCnpj: "", ano: "", sequencial: "", pncpId: "" }),
    false,
    "Helper deve negar disponibilidade quando faltarem identificadores"
  );

  console.log("OK_DIRECT_URL_TEST");
}

run();
