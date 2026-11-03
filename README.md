# Gestão de Limpeza · Web Summit Lisboa

Sistema web para o gestor de limpeza registar, gerir e consultar toda a informação sobre a limpeza do evento e os pedidos de limpeza, organizada pelos **5 pavilhões** e pelos respetivos expositores e áreas comuns.

Não tem dependências: só precisa de um browser e, para uso em equipa, de Node.js 18 ou superior.

## Como usar

### Uso em equipa (recomendado durante o evento)
```bash
npm start
```
Abra `http://<ip-do-computador>:8080` em qualquer computador, tablet ou telemóvel da rede do evento. Todos os supervisores veem os mesmos dados, que se sincronizam a cada 5 segundos.

| Variável | Valor por omissão | Para que serve |
|---|---|---|
| `PORT` | `8080` | Porta HTTP |
| `DATA_DIR` | `./data` | Pasta da base de dados (`db.json`) e das cópias automáticas (`backups/`) |
| `AUTH_USER` / `AUTH_PASS` | — | Ativa a proteção por utilizador e palavra-passe (recomendado) |

```bash
AUTH_USER=limpeza AUTH_PASS='palavra-forte' PORT=8080 npm start
```

- **Cópias de segurança automáticas** a cada 10 minutos em `data/backups/`. São guardadas as últimas 150.
- **Funciona sem rede.** Se a ligação falhar, o browser guarda as alterações numa fila e envia-as quando a ligação voltar. O indicador no canto inferior esquerdo mostra o estado da sincronização.

### Uso individual (sem servidor)
Abra o `index.html` diretamente no browser. Os dados ficam guardados nesse browser. Use **Relatórios → Cópia de segurança** para os exportar ou passar para outro computador.

## Funcionalidades

**Painel de controlo**
- Indicadores do dia para as 5 categorias.
- Um cartão por pavilhão com o progresso de cada categoria.
- Alertas automáticos: pedidos urgentes, rondas em atraso, limpezas não realizadas, apoio dedicado sem pessoal suficiente, orçamentos por enviar há mais de 24h ou a aguardar resposta do cliente, e limpezas de abertura atrasadas.

**Pavilhões (1 a 5)**
- Lista de expositores e áreas comuns com código, tipologia, m², pavimento e contactos.
- Para cada área, o estado das 5 categorias. O botão `+` cria um pedido nessa categoria.
- Ao clicar numa área abre a ficha completa, com todos os pedidos, alteração de estado e ficha para imprimir.

**As 5 categorias de limpeza**

| Categoria | O que gere |
|---|---|
| **Limpeza de abertura** | Data e hora prevista, equipa e estados *Pendente → Em curso → Concluída → Verificada*. Gera em massa os pedidos de todas as áreas que ainda não têm. |
| **Limpeza noturna** | Estado de cada noite (pendente / feita / verificada pelo supervisor / não realizada). Quando não é realizada, regista o motivo. Permite alterar o estado e atribuir equipa a vários pedidos de uma vez, gerar em massa por pavilhão e tipologia, e imprimir a folha de trabalho do dia. |
| **Apoio dedicado ao stand** | Número de pessoas, horário, dias, horas totais e valor (tarifa por hora configurável, com IVA). Mostra quantas pessoas estão alocadas face às necessárias. |
| **Áreas comuns** (WC, corredores, restauração, palcos, entradas, lounges, imprensa) | Intervalo entre rondas, horário e **registo de rondas** com hora e autor. Deteta rondas em atraso em tempo real e permite fechar o dia. |
| **Limpezas com orçamento** | Fluxo *Pedido → Em orçamentação → Enviado → Aprovado/Recusado → Em execução → Concluído*, com referência, âmbito, valor com e sem IVA, validade, totais por fase e taxa de aprovação. |

**Gestão**
- **Equipa:** funções, turnos, pavilhão, telefone (pode ligar diretamente do telemóvel) e tarefas em aberto de cada pessoa.
- **Relatórios:**
  - resumo por pavilhão de todo o evento;
  - relatório diário para imprimir ou guardar em PDF, com espaço para assinaturas;
  - exportação em CSV (abre no Excel) por categoria, stands, equipa e registo;
  - cópia de segurança e restauro em JSON.
- **Importação de expositores por CSV:** atualiza as áreas pelo código do stand e pode criar logo os serviços contratados (colunas `abertura`, `noturna` e `dedicada_pessoas`). O modelo está disponível na aplicação.
- **Registo de atividade:** cada alteração fica registada com quem a fez e quando. Cada pedido tem também o seu próprio histórico.
- **Definições:** nome do evento, local, datas (abertura e dias do evento), horários, tarifa por hora, IVA, e nome, descrição e cor de cada pavilhão.
- **Pesquisa global:** tecla `/`. Procura stands, empresas, contactos, pedidos e pessoas.

## Dados de demonstração
Na primeira utilização o sistema arranca com dados **fictícios**, para ver como funciona:
- 5 pavilhões;
- cerca de 100 stands e 32 áreas comuns;
- cerca de 40 pessoas na equipa;
- pedidos nas 5 categorias.

Antes do evento, em **Definições → Zona de risco**, escolha **Começar do zero** e importe a lista oficial de expositores.

As datas são configuráveis. Por omissão estão definidas a abertura a 09/11/2026 e o evento de 10 a 13/11/2026; confirme as datas oficiais.

## Estrutura
```
index.html        Estrutura da interface
css/styles.css    Estilos (tema claro/escuro, telemóvel, impressão)
js/data.js        Constantes do domínio e dados de demonstração
js/store.js       Persistência (servidor partilhado com fila offline, ou local)
js/app.js         Vistas, formulários, regras de negócio, exportações
server.js         Servidor HTTP + API JSON (sem dependências)
```
