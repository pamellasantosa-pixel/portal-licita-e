/**
 * @typedef {"ambiental" | "social" | "combinados"} KeywordCategory
 */

/**
 * @typedef {Record<KeywordCategory, string[]>} CategoryDictionary
 */

/**
 * Dicionario de termos de busca por categoria socioambiental.
 * @type {CategoryDictionary}
 */
export const CATEGORY_TERMS = {
  ambiental: [
    "meio ambiente",
    "saneamento",
    "resíduos sólidos",
    "coleta seletiva",
    "arborização",
    "licença ambiental",
    "ESG",
    "sustentabilidade",
    "carbono"
  ],
  social: [
    "inclusão",
    "acessibilidade",
    "assistência social",
    "CRAS",
    "CREAS",
    "pessoas com deficiência",
    "baixa renda",
    "habitação social"
  ],
  combinados: [
    "licitação sustentável",
    "critérios socioambientais",
    "margem preferencial ME EPP"
  ]
};

/**
 * Remove acentos e normaliza caixa para comparacao.
 *
 * @param {string} value Texto bruto.
 * @returns {string} Texto normalizado sem acentos.
 */
export function normalizeKeyword(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Retorna os termos agregados das categorias selecionadas.
 *
 * @param {KeywordCategory[]} categories Categorias selecionadas no filtro.
 * @returns {string[]} Lista de termos da taxonomia.
 */
export function getCategoryTerms(categories) {
  const validCategories = Array.isArray(categories) ? categories : [];
  return validCategories.flatMap((category) => CATEGORY_TERMS[category] || []);
}

/**
 * Construi lista de queries enriquecidas para distribuicao nas fontes.
 *
 * Regras:
 * - Combina palavras do usuario com termos das categorias selecionadas.
 * - Remove duplicatas usando comparacao sem acento.
 * - Mantem ordem de insercao para priorizar termos do usuario.
 *
 * @param {string[] | null | undefined} userKeywords Palavras-chave informadas pelo usuario.
 * @param {KeywordCategory[] | null | undefined} categories Categorias marcadas no painel.
 * @returns {string[]} Array de queries unicas para uso no orquestrador.
 */
export function buildSearchQuery(userKeywords, categories) {
  /** @type {string[]} */
  const keywordList = Array.isArray(userKeywords) ? userKeywords : [];
  const categoryTerms = getCategoryTerms(Array.isArray(categories) ? categories : []);
  const merged = [...keywordList, ...categoryTerms];

  const seen = new Set();
  /** @type {string[]} */
  const output = [];

  for (const rawTerm of merged) {
    const original = String(rawTerm || "").trim();
    if (!original) continue;

    const normalized = normalizeKeyword(original);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    output.push(original);
  }

  return output;
}
