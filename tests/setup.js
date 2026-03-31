import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const handlers = [
  http.get("https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao", () => {
    return HttpResponse.json({
      data: [
        {
          numeroControlePNCP: "12345678901234-1-000001/2026",
          objetoCompra: "Aquisicao de bens de TI",
          dataPublicacaoPncp: "2026-03-01",
          orgaoEntidade: { razaoSocial: "Orgao Federal Exemplo" },
          valorTotalEstimado: 150000
        }
      ]
    });
  }),
  http.get("https://api.compras.gov.br/licitacoes/v1/licitacoes", () => {
    return HttpResponse.json({
      _embedded: {
        licitacoes: [
          {
            objeto: "Contratacao de servicos",
            uasg: "123456",
            data_publicacao: "2026-03-01",
            link: "https://www.gov.br/compras/pt-br"
          }
        ]
      }
    });
  }),
  http.post("https://google.serper.dev/search", () => {
    return HttpResponse.json({
      organic: [
        {
          title: "Edital de exemplo",
          link: "https://www.gov.br/exemplo/edital-001",
          snippet: "Licitacao para servicos especializados",
          date: "2026-03-01"
        }
      ]
    });
  })
];

export const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
