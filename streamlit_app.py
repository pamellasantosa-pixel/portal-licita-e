import os
import requests
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Licita-E | Radar ESA", layout="wide")
st.title("Licita-E | Radar de Oportunidades ESA")
st.caption("Consolidacao multi-fonte: PNCP, Licitacoes-e (BB), Compras.gov.br e Portal de Compras Publicas")

DEFAULT_TERMS = [
    "Estudo de Componente Quilombola",
    "Plano de Manejo",
    "Diagnostico Socioterritorial",
    "Consulta Previa OIT 169",
]

api_base = os.getenv("LICITAE_API_BASE_URL", "https://portal-licita-e.vercel.app")
api_url = f"{api_base.rstrip('/')}/api/multi-source-search"

terms_text = st.text_area(
    "Termos de busca ESA (um por linha)",
    value="\n".join(DEFAULT_TERMS),
    height=140,
)

col1, col2 = st.columns([1, 4])
with col1:
    run = st.button("Buscar oportunidades", use_container_width=True)
with col2:
    st.write(f"Endpoint: {api_url}")

if run:
    keywords = [line.strip() for line in terms_text.splitlines() if line.strip()]
    if not keywords:
        st.warning("Informe ao menos um termo de busca.")
    else:
        with st.spinner("Consultando fontes e consolidando por score ESA..."):
            try:
                response = requests.post(api_url, json={"keywords": keywords}, timeout=90)
                response.raise_for_status()
                payload = response.json()
            except Exception as exc:
                st.error(f"Falha ao consultar API consolidada: {exc}")
                st.stop()

        warnings = payload.get("warnings") or []
        if warnings:
            for msg in warnings:
                st.warning(msg)

        rows = payload.get("data") or []
        if not rows:
            st.info("Nenhuma oportunidade encontrada para os termos informados.")
            st.stop()

        df = pd.DataFrame(rows)
        cols = [
            "esa_score",
            "source",
            "title",
            "organization",
            "published_date",
            "url",
            "matched_signals",
            "keyword_hits",
        ]

        for col in cols:
            if col not in df.columns:
                df[col] = None

        df = df[cols].sort_values(by="esa_score", ascending=False)
        st.subheader("Tabela Consolidada (ordenada por Score de Relevancia ESA)")
        st.dataframe(df, use_container_width=True, hide_index=True)

        st.download_button(
            label="Baixar CSV",
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="licitacoes_esa_consolidado.csv",
            mime="text/csv",
        )
