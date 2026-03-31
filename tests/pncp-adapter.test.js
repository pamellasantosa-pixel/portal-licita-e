import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/sources/common.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    withRetry: async (operation) => operation()
  };
});

const { fetch: fetchPncp } = await import("../api/sources/pncp-adapter.js");

function buildPncpItem(index, overrides = {}) {
  return {
    numeroControlePNCP: `CTRL-${index}`,
    objetoCompra: `Objeto ${index}`,
    dataPublicacaoPncp: "2026-03-01",
    orgaoEntidade: { razaoSocial: `Orgao ${index}` },
    valorTotalEstimado: 1000 + index,
    linkSistemaOrigem: `/app/editais/${index}`,
    modalidadeNome: "Pregao",
    situacaoCompraNome: "Recebendo proposta",
    ...overrides
  };
}

function mockJsonResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload)
  };
}

describe("pncp-adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.PNCP_REQUEST_TIMEOUT_MS = "20";
  });

  afterEach(() => {
    delete process.env.PNCP_REQUEST_TIMEOUT_MS;
  });

  it("processa resposta no formato .data", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({ data: [buildPncpItem(1)] }));

    const result = await fetchPncp(["energia"], null, null);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      titulo: "Objeto 1",
      orgao: "Orgao 1",
      data: "2026-03-01",
      chaves: ["energia"]
    });
  });

  it("processa resposta no formato .itens", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({ itens: [buildPncpItem(2)] }));

    const result = await fetchPncp(["saude"], null, null);

    expect(result).toHaveLength(1);
    expect(result[0].titulo).toBe("Objeto 2");
    expect(result[0].chaves).toEqual(["saude"]);
  });

  it("processa resposta como array direto", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse([buildPncpItem(3)]));

    const result = await fetchPncp(["educacao"], null, null);

    expect(result).toHaveLength(1);
    expect(result[0].orgao).toBe("Orgao 3");
  });

  it("lanca erro para resposta malformada", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockJsonResponse({ data: [{ objetoCompra: "Sem campos obrigatorios" }] }));

    await expect(fetchPncp(["infra"], null, null)).rejects.toThrow(/pncp_payload_validation_failed/);
  });

  it("lanca erro de timeout em 10s configuravel por request", async () => {
    process.env.PNCP_REQUEST_TIMEOUT_MS = "5";

    global.fetch = vi.fn().mockImplementation((_url, options = {}) => {
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    await expect(fetchPncp(["seguranca"], null, null)).rejects.toThrow(/pncp_timeout_5ms/);
  });

  it("pagina ate obter menos itens que tamanhoPagina", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => buildPncpItem(index + 1));
    const secondPage = Array.from({ length: 10 }, (_, index) => buildPncpItem(index + 51));

    global.fetch = vi.fn().mockImplementation((url) => {
      const parsed = new URL(String(url));
      const page = parsed.searchParams.get("pagina");

      if (page === "1") {
        return Promise.resolve(mockJsonResponse({ data: firstPage }));
      }

      if (page === "2") {
        return Promise.resolve(mockJsonResponse({ data: secondPage }));
      }

      return Promise.resolve(mockJsonResponse({ data: [] }));
    });

    const result = await fetchPncp(["transporte"], null, null);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(60);
    expect(result[0].chaves).toEqual(["transporte"]);
  });
});
