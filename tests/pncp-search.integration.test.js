import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup.js";

const createClientMock = vi.hoisted(() => vi.fn());
const bllFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../server/sources/common.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    withRetry: async (operation) => operation()
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock
}));

vi.mock("../server/sources/bll-adapter.js", () => ({
  fetch: bllFetchMock
}));

const { default: handler } = await import("../api/pncp-search.js");

function createMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
}

function createSupabaseMock() {
  const upsertBids = vi.fn().mockResolvedValue({ error: null });
  const upsertSourceHealth = vi.fn().mockResolvedValue({ error: null });
  const selectSourceHealth = vi.fn().mockResolvedValue({ data: [], error: null });

  return {
    upsertBids,
    upsertSourceHealth,
    selectSourceHealth,
    client: {
      from(tableName) {
        if (tableName === "bids") {
          return {
            upsert: upsertBids
          };
        }

        if (tableName === "source_health") {
          return {
            select: selectSourceHealth,
            upsert: upsertSourceHealth
          };
        }

        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
          upsert: vi.fn().mockResolvedValue({ error: null })
        };
      }
    }
  };
}

function installSuccessHandlers() {
  server.use(
    http.get("https://pncp.gov.br/api/search", ({ request }) => {
      const url = new URL(request.url);
      const page = url.searchParams.get("pagina");

      if (page === "1") {
        return HttpResponse.json({
          data: [
            {
              numeroControlePNCP: "CTRL-1",
              objetoCompra: "Edital PNCP completo",
              dataPublicacaoPncp: "2026-03-10",
              orgaoEntidade: { razaoSocial: "Orgao PNCP" },
              valorTotalEstimado: 10000,
              linkSistemaOrigem: "https://pncp.gov.br/app/editais/1"
            }
          ]
        });
      }

      return HttpResponse.json({ data: [] });
    }),
    http.get("https://api.compras.gov.br/licitacoes/v1/licitacoes", ({ request }) => {
      const url = new URL(request.url);
      const termo = url.searchParams.get("termo") || "licitacao";
      return HttpResponse.json({
        data: [
          {
            title: `Edital ${termo} ativo`,
            descricao: "Registro de preco",
            orgao_nome: "Orgao Compras",
            data_publicacao: "2026-03-11",
            status: "recebendo proposta",
            url: "https://www.gov.br/compras/edital-2"
          }
        ]
      });
    }),
    http.post("https://google.serper.dev/search", () => {
      return HttpResponse.json({
        organic: [
          {
            title: "Edital Serper ativo",
            link: "https://www.gov.br/ministerio/edital-3",
            snippet: "contratacao publica",
            date: "2026-03-12"
          }
        ]
      });
    })
  );
}

describe("api/pncp-search integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERPER_API_KEY = "test-key";
    process.env.SUPABASE_URL = "https://supabase.local";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    bllFetchMock.mockResolvedValue([
      {
        titulo: "Edital BLL ativo",
        href: "https://bll.org.br/edital-4",
        orgao: "BLL",
        data: "2026-03-12",
        tags: ["energia"]
      }
    ]);
  });

  it("todos os adapters retornam resultados com sucesso", async () => {
    const supabase = createSupabaseMock();
    createClientMock.mockReturnValue(supabase.client);
    installSuccessHandlers();

    const req = {
      method: "POST",
      body: {
        keywords: ["energia", "saneamento"],
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31"
      }
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.bySource).toEqual({ pncp: 1, compras: 2, serper: 1, bll: 0 });
    expect(supabase.upsertBids).toHaveBeenCalledTimes(1);
    const upsertPayload = supabase.upsertBids.mock.calls[0][0];
    expect(upsertPayload).toHaveLength(3);
  });

  it("um adapter falha e os demais persistem normalmente", async () => {
    const supabase = createSupabaseMock();
    createClientMock.mockReturnValue(supabase.client);

    installSuccessHandlers();
    server.use(http.post("https://google.serper.dev/search", () => HttpResponse.json({ message: "down" }, { status: 502 })));

    const req = {
      method: "POST",
      body: {
        keywords: ["ambiental"],
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31"
      }
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.bySource).toEqual({ pncp: 1, compras: 1, serper: 0, bll: 0 });
    expect(res.payload.errors.serper).toBeDefined();
    expect(supabase.upsertBids).toHaveBeenCalledTimes(1);

    const upsertPayload = supabase.upsertBids.mock.calls[0][0];
    expect(Array.isArray(upsertPayload)).toBe(true);
    expect(upsertPayload).toHaveLength(2);
  });

  it("todos falham e o endpoint retorna summary zerado sem excecao", async () => {
    const supabase = createSupabaseMock();
    createClientMock.mockReturnValue(supabase.client);

    server.use(
      http.get("https://pncp.gov.br/api/search", () => HttpResponse.json({ message: "error" }, { status: 500 })),
      http.get("https://api.compras.gov.br/licitacoes/v1/licitacoes", () => HttpResponse.json({ message: "error" }, { status: 503 })),
      http.post("https://google.serper.dev/search", () => HttpResponse.json({ message: "error" }, { status: 502 }))
    );
    bllFetchMock.mockRejectedValue(new Error("bll_all_pages_failed"));

    const req = {
      method: "POST",
      body: {
        keywords: ["social"],
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31"
      }
    };
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.total).toBe(0);
    expect(res.payload.summary).toEqual({
      total: 0,
      bySource: {
        pncp: 0,
        compras: 0,
        serper: 0,
        bll: 0
      }
    });
    expect(supabase.upsertBids).not.toHaveBeenCalled();
  });
});
