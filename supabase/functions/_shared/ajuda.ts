// ============================================================
// Central de ajuda do Helpy: categorias e artigos.
//
// Fonte única: a página /ajuda (src) importa este arquivo, e a função
// "suporte" usa os mesmos textos para a primeira resposta do chamado.
// Sem imports: roda igual no navegador e no Deno.
//
// Texto com formatação leve: "- " vira lista, "1. " lista numerada,
// **negrito** e endereços viram link.
// ============================================================

export interface Categoria {
  id: string;
  nome: string;
  descricao: string;
  /** chave do ícone (o front escolhe o desenho) */
  icone: string;
}

export interface Artigo {
  id: string;
  cat: string;
  titulo: string;
  resumo: string;
  texto: string;
  /** palavras que a pessoa digitaria na busca */
  busca: string;
}

export const CATEGORIAS: Categoria[] = [
  { id: 'comecar', nome: 'Primeiros passos', descricao: 'Montar, testar e pôr o assistente no ar', icone: 'rocket' },
  { id: 'respostas', nome: 'Respostas do assistente', descricao: 'Quando ele erra, inventa ou não sabe', icone: 'chat' },
  { id: 'canais', nome: 'WhatsApp, Instagram e Discord', descricao: 'Conectar e quando para de responder', icone: 'canais' },
  { id: 'vendas', nome: 'Vendas e pagamentos', descricao: 'Carteira, pedidos, frete e repasses', icone: 'carteira' },
  { id: 'agenda', nome: 'Agenda', descricao: 'Horários, cobrança para marcar e remarcar', icone: 'agenda' },
  { id: 'chamados', nome: 'Chamados e equipe', descricao: 'Fila, assumir, convites de funcionário', icone: 'equipe' },
  { id: 'plano', nome: 'Plano e cobrança', descricao: 'Cotas, uso extra, fatura e cancelamento', icone: 'plano' },
  { id: 'conta', nome: 'Conta e segurança', descricao: 'Login, senha, dados e exclusão da conta', icone: 'conta' },
];

export const ARTIGOS: Artigo[] = [
  // ---------- primeiros passos ----------
  {
    id: 'montar-assistente',
    cat: 'comecar',
    titulo: 'Como montar o primeiro assistente',
    resumo: 'Conte como o negócio funciona e o Helpy preenche a ficha.',
    busca: 'criar novo assistente montar ficha começar builder',
    texto: `Em **Assistentes → Novo assistente**, escreva do seu jeito como o negócio funciona: o que vende, preços, horário, endereço e formas de pagamento. O Helpy preenche a ficha à direita e pergunta o que faltar.

- Pode mandar arquivo (PDF, planilha ou foto da tabela de preços): ele lê e anota.
- Os campos com * são obrigatórios para publicar. O resto fica em "Mais detalhes".
- O que não se aplica ao seu negócio, marque no menu ⋯ do campo como "Não se aplica".
- Errou? Use **Desfazer** (ou Ctrl+Z) para voltar a ficha.

Quando a barra chegar no que é obrigatório, clique em **Publicar**. O link do assistente já funciona na hora.`,
  },
  {
    id: 'testar-antes',
    cat: 'comecar',
    titulo: 'Testar o assistente antes de divulgar',
    resumo: 'Converse como se fosse um cliente, sem gastar a cota.',
    busca: 'testar teste simular cliente conversa antes divulgar',
    texto: `Em **Assistentes**, clique em **Testar** no cartão do assistente. A conversa de teste não conta na cota do mês e aparece marcada como teste.

Faça as perguntas que os seus clientes mais fazem: preço, horário, entrega, "quero falar com alguém". Se a resposta não ficou boa, clique em **Editar** e ajuste a ficha, ou explique no chat do montador o que mudar ("quando perguntarem de estacionamento, diga que tem na rua de trás").

O teste tem limite de 300 mensagens por dia.`,
  },
  {
    id: 'divulgar-link',
    cat: 'comecar',
    titulo: 'Pôr no ar: link, QR code e site',
    resumo: 'Onde divulgar o assistente para os clientes acharem.',
    busca: 'link qr code divulgar bio site instagram colocar no ar publicar',
    texto: `Cada assistente tem um link próprio. Em **Assistentes**, use **Copiar link** e cole na bio do Instagram, no WhatsApp, no Google Meu Negócio ou no seu site.

- No menu ⋯ do cartão tem o **QR code** para imprimir no balcão ou no cardápio.
- **Desligar o link** tira o assistente do ar sem apagar nada.
- **Trocar link** gera um endereço novo e desativa o antigo (útil se o link vazou para quem não devia). O QR code antigo para de funcionar.

Para atender direto no WhatsApp, Instagram ou Discord, veja a categoria de canais.`,
  },

  // ---------- respostas ----------
  {
    id: 'resposta-errada',
    cat: 'respostas',
    titulo: 'O assistente respondeu errado ou inventou',
    resumo: 'Como corrigir para ele não repetir o erro.',
    busca: 'errado inventou mentiu preço errado resposta errada corrigir alucinação',
    texto: `O assistente responde com o que está na ficha, nas tabelas de **Dados** e nos materiais que você mandou. Quando ele erra, quase sempre é porque a informação está faltando ou desatualizada.

1. Abra a conversa em **Atendimentos** e veja o que ele disse.
2. Em **Assistentes → Editar**, confira o campo ou a tabela daquele assunto.
3. Se for preço ou estoque, corrija em **Dados** (vale na hora, sem publicar de novo).
4. Se for regra do negócio, escreva no chat do montador: "quando perguntarem X, responda Y".

Depois de editar a ficha, clique em **Publicar alterações**.`,
  },
  {
    id: 'nao-soube',
    cat: 'respostas',
    titulo: '"Não soube responder": ensinar o assistente',
    resumo: 'As perguntas sem resposta aparecem nos Avisos.',
    busca: 'não soube responder lacuna pergunta sem resposta ensinar aprender avisos',
    texto: `Quando o cliente pergunta algo que não está na ficha, o assistente não inventa: ele avisa que vai confirmar e registra a pergunta.

Essas perguntas aparecem no sino de **Avisos** como "Não soube responder: …", com quantas vezes perguntaram. Responda ali mesmo: a resposta vira pergunta frequente do assistente e ele passa a saber na próxima vez.`,
  },
  {
    id: 'tom-de-voz',
    cat: 'respostas',
    titulo: 'Mudar o jeito de falar do assistente',
    resumo: 'Mais formal, mais descontraído, com ou sem emoji.',
    busca: 'tom de voz jeito de falar formal informal emoji nome do assistente personalidade',
    texto: `Em **Assistentes → Editar**, na seção **O assistente**, mude o campo **Como ele fala** (ex.: "formal, sem gírias e sem emoji" ou "leve, com no máximo um emoji"). O nome do assistente e em nome de quem ele fala ficam na mesma seção.

Publique as alterações e teste uma conversa para ver o resultado.`,
  },

  // ---------- canais ----------
  {
    id: 'whatsapp-conectar',
    cat: 'canais',
    titulo: 'Conectar o WhatsApp',
    resumo: 'Pela API oficial da Meta, com um número da empresa.',
    busca: 'whatsapp conectar api meta número token business',
    texto: `Em **Canais → WhatsApp**, siga o passo a passo da tela (leva uns 15 minutos). Você vai precisar de:

- Acesso ao Gerenciador de Negócios da empresa no Facebook.
- Um número que **não** esteja em uso no aplicativo do WhatsApp (pode ser um número novo).
- O token de um **usuário do sistema** com validade "Nunca" (o token da tela de Configuração da API vence em 24 h).

Depois de conectar, cole no app da Meta a URL de callback e o "Verificar token" que o Helpy mostra, assine o campo **messages** e troque o app para **Ao vivo**.`,
  },
  {
    id: 'canal-parou',
    cat: 'canais',
    titulo: 'O WhatsApp ou o Instagram parou de responder',
    resumo: 'As causas mais comuns e como resolver.',
    busca: 'parou de responder não responde whatsapp instagram canal erro token webhook',
    texto: `Primeiro use **Verificar minha conta** aqui no suporte: ele confere o canal e mostra o erro, se houver.

As causas mais comuns:
- **Token venceu ou foi revogado:** gere um token novo de usuário do sistema (validade "Nunca") e troque em **Canais**.
- **Webhook sem o campo messages:** no app da Meta, em WhatsApp → Configuração → Campos do webhook, assine **messages**.
- **App em modo Desenvolvimento:** só responde para os números de teste. Troque para **Ao vivo**.
- **Passaram 24 horas:** regra do WhatsApp; quando o cliente escrever de novo, a conversa reabre.
- **Cota do mês acabou:** as conversas novas vão para a equipe. Veja em **Plano**.
- **Link do assistente desligado** em Assistentes.`,
  },
  {
    id: 'discord',
    cat: 'canais',
    titulo: 'Discord: bot, tickets e mensagem no privado',
    resumo: 'Como funciona o bot do Helpy no seu servidor.',
    busca: 'discord bot ticket servidor privado dm botão painel avisos',
    texto: `Em **Canais → Discord**, clique em **Adicionar ao servidor** e escolha o servidor. O bot cria o painel com o botão de abrir ticket no canal que você escolher.

- Cada ticket vira um tópico privado e um atendimento no Helpy.
- Quando alguém da equipe assume, o cliente recebe aviso no tópico e no privado.
- Pedido fechado e pagamento confirmado também chegam no privado do cliente.

Se o bot ficou offline, confira em **Verificar minha conta**. O canal de avisos é opcional.`,
  },

  // ---------- vendas ----------
  {
    id: 'carteira-ativar',
    cat: 'vendas',
    titulo: 'Receber pelo chat: ativar a Carteira',
    resumo: 'Pix, cartão e boleto direto na conversa.',
    busca: 'carteira receber pagamento pix cartão boleto asaas ativar vender pelo chat',
    texto: `Em **Carteira**, preencha os dados da empresa para abrir a conta de recebimento. Com ela ativa, o assistente fecha o pedido, gera o link de pagamento (Pix, cartão ou boleto) e avisa na conversa quando o pagamento cai.

- O dinheiro fica na sua Carteira; você pede o saque para a sua conta.
- O Helpy cobra uma taxa por venda paga, conforme o plano (de 1% a 2%).
- Venda devolvida (estorno) tira a taxa daquela venda.`,
  },
  {
    id: 'frete',
    cat: 'vendas',
    titulo: 'Frete e retirada na venda pelo chat',
    resumo: 'Sem regra de frete, ele não gera link com entrega.',
    busca: 'frete entrega retirada valor do frete grátis acima de',
    texto: `O frete nunca é inventado pela IA: ele sai da regra que você escreve em **Carteira → Frete na venda pelo chat**. Exemplos que funcionam:

- "R$ 12"
- "grátis acima de R$ 100, senão R$ 12"
- "só retirada" (com o endereço, para o cliente saber onde buscar)

Se não houver regra e o cliente quiser entrega, o assistente não gera o link e você recebe um aviso para definir a regra.`,
  },
  {
    id: 'pedido-pago-nao-confirmou',
    cat: 'vendas',
    titulo: 'O cliente pagou e o pedido não confirmou',
    resumo: 'O que conferir antes de abrir chamado.',
    busca: 'pagou não confirmou pedido pago pagamento não caiu aguardando',
    texto: `A confirmação chega do banco em segundos no Pix e pode levar até 3 dias úteis no boleto. Cartão costuma ser na hora.

1. Em **Pedidos**, veja o status. "Aguardando" quer dizer que o pagamento ainda não foi confirmado.
2. Peça ao cliente o comprovante e confira o valor e a data.
3. Se passou mais de 1 hora num Pix, abra um chamado com o **número do pedido**.`,
  },

  // ---------- agenda ----------
  {
    id: 'agenda-ligar',
    cat: 'agenda',
    titulo: 'Ligar a agenda e marcar sozinho',
    resumo: 'Horários de atendimento, serviços e duração.',
    busca: 'agenda ligar horário marcar agendamento serviços duração',
    texto: `Em **Agenda**, ligue a agenda e preencha os dias e horários de atendimento e os serviços com a duração. O assistente consulta os horários livres e marca sozinho, ou anota o pedido para você confirmar (escolha no montador, em "O assistente marca sozinho?").

Os horários marcados aparecem na Agenda e na ficha do chamado. Dá para remarcar e cancelar por lá; o cliente recebe o aviso na conversa.`,
  },
  {
    id: 'agenda-cobrar',
    cat: 'agenda',
    titulo: 'Cobrar para marcar (sinal ou valor cheio)',
    resumo: 'O horário fica guardado 30 minutos esperando o pagamento.',
    busca: 'cobrar sinal agenda paga reserva horário guardado pagamento para marcar',
    texto: `Com a Carteira ativa, o assistente pode cobrar o serviço (ou um sinal, como "30%" ou "R$ 20") para marcar. O horário fica **guardado por 30 minutos**; pagou, confirma sozinho.

- Cada conversa guarda um horário por vez até pagar.
- Se muitos horários ficarem guardados sem pagamento ao mesmo tempo, o assistente para de guardar novos e você recebe um aviso.`,
  },

  // ---------- chamados e equipe ----------
  {
    id: 'fila-chamados',
    cat: 'chamados',
    titulo: 'Como funciona a fila de chamados',
    resumo: 'Quando o assistente passa a conversa para a equipe.',
    busca: 'chamado fila assumir devolver encerrar senha número atendimento humano',
    texto: `Quando o cliente pede uma pessoa ou o assunto foge do que o assistente resolve, ele abre um chamado com número (a "senha") e a conversa entra na fila de **Atendimentos**.

- **Assumir** pausa o assistente e você responde na mesma conversa.
- **Devolver** volta a conversa para o assistente.
- **Encerrar** fecha o atendimento; o cliente pode avaliar.
- Responder na conversa também assume o chamado.

Em **Assistentes → Editar → Chamados e equipe** você define quando ele abre chamado e quando não abre.`,
  },
  {
    id: 'convidar-funcionario',
    cat: 'chamados',
    titulo: 'Convidar funcionário',
    resumo: 'Link de convite para a equipe atender os chamados.',
    busca: 'convidar funcionário equipe convite link atendente membro',
    texto: `Em **Equipe**, clique em **Convidar** e mande o link para a pessoa. Ela cria a conta (ou entra) pelo link e já vê a fila de atendimentos, os pedidos e a agenda da empresa. Funcionário não vê a cobrança nem o plano.

Cada plano inclui um número de pessoas; acima disso, cada vaga extra custa à parte por mês. Se o plano diminuir, os acessos mais novos acima do limite saem da equipe.`,
  },

  // ---------- plano ----------
  {
    id: 'cota-acabou',
    cat: 'plano',
    titulo: 'Acabou a cota do mês',
    resumo: 'O que acontece e como continuar atendendo.',
    busca: 'cota acabou limite atendimentos mensagens mês recado uso extra',
    texto: `Cada plano tem um número de atendimentos e de mensagens por mês. Quando acaba, as conversas novas viram **recado para a equipe** até o mês virar (as cotas renovam todo dia 1º).

Para continuar com o atendimento automático:
- Ligue o **uso extra** em Plano (paga só o que passar, até o limite que você escolher), ou
- Mude para um plano maior.

Você recebe aviso quando chega em 80% da cota.`,
  },
  {
    id: 'assinar-trocar',
    cat: 'plano',
    titulo: 'Assinar, trocar de plano ou cancelar',
    resumo: 'Mensal ou anual, por Pix, cartão ou boleto.',
    busca: 'assinar trocar plano cancelar assinatura mensal anual upgrade downgrade fatura',
    texto: `Em **Plano**, escolha Mensal ou Anual e clique em **Assinar**. O pagamento é por Pix, cartão ou boleto.

- **Trocar de plano** gera a fatura do plano novo. Quando ela é paga, o plano novo passa a valer; se não for paga, você continua no plano de antes.
- **Cancelar**: em Plano, na sua assinatura. O plano continua até o fim do período pago.

Com a fatura atrasada, o plano segue por alguns dias de tolerância. Passado esse prazo sem pagamento, a conta volta para o básico (e a equipe extra sai) até a assinatura ficar em dia.`,
  },

  // ---------- conta ----------
  {
    id: 'senha-login',
    cat: 'conta',
    titulo: 'Não consigo entrar / esqueci a senha',
    resumo: 'Recuperar a senha e confirmar o e-mail.',
    busca: 'esqueci senha não consigo entrar login recuperar e-mail confirmação',
    texto: `Na tela **Entrar**, clique em **Esqueci a senha** e siga o link que chega no e-mail (veja também a caixa de spam).

- Conta nova precisa confirmar o e-mail antes do primeiro acesso. Na tela de entrar dá para **reenviar a confirmação**.
- Se entrou com o Google, use o botão do Google.
- Com verificação em duas etapas ligada, tenha o celular à mão para o código.`,
  },
  {
    id: 'excluir-conta',
    cat: 'conta',
    titulo: 'Excluir a conta e os dados (LGPD)',
    resumo: 'Apaga tudo da empresa, sem volta.',
    busca: 'excluir conta apagar dados lgpd privacidade remover',
    texto: `Em **Conta**, no fim da página, use **Excluir conta** e confirme com a senha. Isso apaga os assistentes, as conversas, as tabelas e os dados da empresa, e não dá para desfazer.

Cancele a assinatura antes, em Plano. Para pedir uma cópia dos seus dados, abra um chamado na categoria Conta e segurança.`,
  },
];

/** Busca simples: todas as palavras precisam aparecer no título, resumo, palavras-chave ou texto. */
export function buscarArtigos(consulta: string, limite = 8): Artigo[] {
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const termos = norm(consulta).split(/\s+/).filter((t) => t.length > 1);
  if (!termos.length) return [];
  const pontos = (a: Artigo) => {
    const titulo = norm(a.titulo + ' ' + a.resumo);
    const chave = norm(a.busca);
    const corpo = norm(a.texto);
    let p = 0;
    for (const t of termos) {
      if (titulo.includes(t)) p += 3;
      else if (chave.includes(t)) p += 2;
      else if (corpo.includes(t)) p += 1;
      else return 0;
    }
    return p;
  };
  return ARTIGOS.map((a) => [a, pontos(a)] as const).filter(([, p]) => p > 0).sort((x, y) => y[1] - x[1]).slice(0, limite).map(([a]) => a);
}
