# Portal Licita-E

## Objetivo

Automatizar o monitoramento, análise de viabilidade e gestão de documentos para licitações nos nichos socioambiental e técnico.

## Telas

### Login e Acesso

**Rota:** `/`

**Objetivo:** Autenticação de usuários no sistema. Lougout e recuperação de conta.

**Componentes:**

- **Input E-mail e Senha**: Realiza o login do usuário e redireciona para /dashboard.
- **Botão Esqueci Minha Senha**: Redireciona para recuperação de senha.

### Dashboard de Monitoramento

**Rota:** `/dashboard`

**Objetivo:** Visualização consolidada de novos editais, prazos urgentes e estatísticas de sucesso.

**Componentes:**

- **Seletor de Período**: Filtra a visão geral por período ou categoria.
- **Widget Licitações de Hoje**: Redireciona para o edital específico.
- **Cards de Resumo Estatístico**: Exibe status de documentos e prazos próximos.

### Explorar Editais

**Rota:** `/bids`

**Objetivo:** Listagem de editais recém-capturados via web scraping filtrados pelo nicho da empresa.

**Componentes:**

- **Campo de Busca e Filtros Avançados**: Filtra resultados por CNAE ou palavra-chave (ex: P&D).
- **Lista de Licitações Capturadas (Scraping)**: Redireciona para os detalhes técnicos do edital.
- **Botão Sincronizar Agora**: Inicia nova busca nos portais integrados (Comprasnet, etc).

### Detalhes da Licitação

**Rota:** `/bids/:id`

**Objetivo:** Análise detalhada do edital com auxílio de IA para verificação de compatibilidade de CNAE.

**Componentes:**

- **Visualizador de PDF**: Abre o documento original para leitura completa.
- **Botão Gerar Análise de Viabilidade (IA)**: Processa o edital via IA para gerar resumo de requisitos e prazos.
- **Ações de Status do Edital**: Marca o edital como Favorito ou Rejeitado.

### Gestão de Documentos

**Rota:** `/documents`

**Objetivo:** Repositório centralizado de documentos e certidões da empresa para habilitação.

**Componentes:**

- **Botão Novo Upload**: Permite o upload de novas certidões e documentos.
- **Alerta de Validade de Documento**: Notifica proximidade de vencimento da certidão.
- **Lista de Documentos de Habilitação**: Download do arquivo para inclusão em propostas.

### Calendário de Prazos

**Rota:** `/calendar`

**Objetivo:** Controle visual e gestão de alertas para datas de lances e entrega de propostas.

**Componentes:**

- **Visualização Mensal/Semanal de Eventos**: Exibe detalhes do evento e envia lembrete por e-mail.
- **Botão Criar Alerta Manual**: Adiciona lembretes manuais para reuniões ou lances.

### Configurações do Sistema

**Rota:** `/settings`

**Objetivo:** Ajuste de parâmetros de busca, CNAEs da empresa e preferências de conta.

**Componentes:**

- **Input de Palavras-chave e CNAEs (Config)**: Atualiza os termos monitorados pelo sistema.
- **Configurações de Notificações**: Altera preferências de e-mail e notificação.

## Personas

### Administrador de Licitações

Responsável pela estratégia de participação e configuração técnica do sistema. Possui acesso total para gerenciar termos de busca, CNAEs e usuários, além de monitorar o desempenho global através do dashboard.

**User Stories:**

- Como Administrador de Licitações, eu quero Configurar palavras-chave e CNAEs da empresa para garantir que o scraping traga editais altamente relevantes ao nicho socioambiental
- Como Administrador de Licitações, eu quero Visualizar o resumo estatístico e métricas de sucesso para entender o volume de oportunidades capturadas e a eficiência da operação
- Como Administrador de Licitações, eu quero Sincronizar manualmente a busca nos portais integrados para garantir o acesso imediato a editais publicados em tempo real

### Analista Técnico

Focado na triagem e análise de viabilidade dos editais. Utiliza as ferramentas de IA para agilizar a leitura técnica e decide quais oportunidades valem o esforço da empresa.

**User Stories:**

- Como Analista Técnico, eu quero Gerar análise de viabilidade via IA para identificar rapidamente requisitos técnicos complexos sem precisar ler editais de centenas de páginas
- Como Analista Técnico, eu quero Filtrar e favoritar licitações capturadas para organizar o fluxo de trabalho e priorizar os editais com maior potencial de ganho
- Como Analista Técnico, eu quero Visualizar o calendário de prazos para planejar a elaboração das propostas técnicas e não perder as datas de lances

### Gestor de Documentação

Perfil operacional focado na manutenção da habilitação jurídica e técnica. Garante que todas as certidões estejam em dia para evitar desclassificações por burocracia.

**User Stories:**

- Como Gestor de Documentação, eu quero Fazer o upload de novas certidões e documentos de habilitação para manter o repositório centralizado e atualizado
- Como Gestor de Documentação, eu quero Acompanhar os alertas de validade de documentos para providenciar renovações antes que as certidões atuais vençam
- Como Gestor de Documentação, eu quero Baixar arquivos da lista de habilitação para agilizar a montagem do envelope de documentos exigido no edital

## Banco de Dados

### documents

Repositório centralizado de documentos e certidões da empresa para habilitação.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | pk | - |
| name | text | - |
| file_url | text | - |
| expiration_date | timestamp | - |

### bids

Licitações capturadas via web scraping.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | pk | - |
| title | text | - |
| url | text | - |
| published_date | timestamp | - |
| closing_date | timestamp | - |
| status | text | - |
| ia_analysis_summary | text | - |
| is_favorite | boolean | - |
| is_rejected | boolean | - |

### company_cnae

Lista de CNAEs da empresa para filtragem de editais.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | pk | - |
| cnae_code | text | - |
| cnae_description | text | - |

### bid_filters

Configurações de palavras-chave e CNAEs para monitoramento de editais.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | pk | - |
| keywords | text | - |
| cnae_id | fk | - |

### users

Informações de autenticação dos usuários.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | pk | - |
| email | text | - |

### notifications

Configurações de preferências de notificação do usuário.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | pk | - |
| user_id | fk | - |
| email_notifications | boolean | - |

### manual_alerts

Alertas manuais criados pelo usuário para prazos e eventos.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | pk | - |
| user_id | fk | - |
| event_date | timestamp | - |
| description | text | - |

