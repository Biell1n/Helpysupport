import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';
import { TERMOS_VERSAO } from '@/lib/termos';
import { EMPRESA } from '@/lib/empresa';

const QUEM = `${EMPRESA.responsavel}, ${EMPRESA.documento}, ${EMPRESA.cidade}/${EMPRESA.uf}`;
const CONTATO = EMPRESA.emailPrivacidade
  ? `pelo e-mail ${EMPRESA.emailPrivacidade}`
  : 'pelos canais de suporte do Helpy';

const TEXTOS = {
  termos: {
    titulo: 'Termos de uso',
    intro:
      `O Helpy é oferecido por ${QUEM} ("Helpy", "nós"). Estes termos valem para quem cria e administra assistentes no Helpy (o "Cliente"), para os funcionários que o Cliente convida e para quem conversa com esses assistentes (o "Usuário final"). Ao criar uma conta, entrar ou usar o chat, você declara que leu e aceita estes termos e a Política de Privacidade.`,
    blocos: [
      ['1. O serviço', 'O Helpy permite criar atendentes virtuais com inteligência artificial que conversam com o público do seu negócio pelo link do chat, pelo botão no seu site, pelo WhatsApp, pelo Instagram e pelo Discord; consultam informações e tabelas que você cadastra ou conecta; anotam pedidos; marcam horários na agenda; e abrem chamados para a sua equipe.'],
      ['2. Conta e segurança', 'Você deve informar dados verdadeiros, manter sua senha em sigilo e é responsável pelo que acontece na sua conta. Recomendamos ativar a verificação em duas etapas. O cadastro exige confirmar que você não é um robô. Podemos suspender contas usadas para fraude, spam ou abuso.'],
      ['3. Responsabilidade do Cliente (quem cria o assistente)', 'Você é responsável pelas informações, preços, regras, documentos e tabelas que coloca no assistente; por ter o direito de usar esses dados; por revisar as respostas; e por informar ao seu público que o atendimento é feito por um assistente virtual. Respostas de IA podem conter erros: configure o assistente para encaminhar a uma pessoa os assuntos sensíveis. Em relação aos dados do seu público, você é o Controlador e o Helpy atua como Operador (LGPD, art. 5º).'],
      ['4. Usuário final (quem conversa com o assistente)', 'Qualquer pessoa pode conversar sem conta. Para abrir um chamado, falar com a equipe ou deixar recado é preciso entrar com uma conta. Não envie senhas, dados de cartão ou dados sensíveis (saúde, religião, biometria etc.) no chat. As respostas são geradas automaticamente e não substituem orientação profissional.'],
      ['5. Integrações e fontes de dados', 'Ao conectar planilhas (arquivo, Google Sheets, SharePoint ou OneDrive), bancos de dados SQL, APIs ou sistemas de gestão (como SAP e TOTVS), você declara ter autorização da sua empresa para isso e autoriza o Helpy a ler esses dados apenas para responder no atendimento e mostrar relatórios. Chaves de acesso ficam criptografadas e são usadas só pelo servidor. Use credenciais com permissão mínima (somente leitura sempre que possível). Cada conexão pede uma autorização expressa no momento em que é criada.'],
      ['6. Agenda e atualização automática', 'Se você ativar, o assistente pode marcar horários na sua agenda sozinho (ou deixar pendente para você confirmar) e registrar automaticamente os agendamentos, valores e pedidos nas tabelas que você autorizar. Você pode desligar essas permissões a qualquer momento.'],
      ['7. Planos, cotas e cobrança', 'Os planos são pagos por mês ou por ano, por Pix, cartão ou boleto, com cobrança feita pelo nosso parceiro de pagamentos (Asaas). Cada plano tem limites mensais de atendimentos, mensagens, assistentes, canais, tabelas e pessoas na equipe; as cotas renovam no dia 1º de cada mês, à meia-noite de Brasília. Quando a cota acaba, as conversas passam a virar recados e chamados para a equipe até a renovação, a menos que você ligue o uso extra. Para proteger sua cota, o Helpy aplica limites contra abuso (por exemplo, muitas conversas seguidas da mesma rede).'],
      ['7.1 Uso extra', 'O uso extra é opcional e vem desligado. Ligado, o atendimento continua depois da cota e cada atendimento e mensagem a mais é cobrado pelo valor mostrado na página Plano, até o limite mensal que você escolher. O valor vem numa fatura à parte no começo do mês seguinte; abaixo de R$ 5, passa para o mês seguinte. Fatura atrasada pausa o uso extra até ser paga.'],
      ['7.2 Troca de plano, atraso e cancelamento', 'Na troca de plano, o novo começa quando a primeira fatura dele é paga, e o que falta do período já pago não é descontado. Se você passar para um plano menor, o que passar dos limites dele (assistentes, canais, tabelas e pessoas na equipe, dos mais novos para os mais antigos) deixa de funcionar até você voltar a um plano que cubra, sem ser apagado. Você pode cancelar a qualquer momento na página Plano: o plano continua até o fim do período já pago e depois a conta volta ao teste encerrado. Com mais de 5 dias de atraso, o mesmo acontece. Na primeira contratação, você pode desistir em até 7 dias e pedir o valor de volta pelo suporte (Código de Defesa do Consumidor, art. 49).'],
      ['7.3 Vendas pelo chat', 'Se você ativar, o assistente anota pedidos ou manda link de pagamento ao seu cliente. Para cobrar pelo link, você liga a sua própria conta de pagamentos (Asaas) em Carteira: o dinheiro cai nessa conta, e as tarifas e regras dela valem para você. Sobre cada venda paga pelo link, o Helpy cobra uma taxa conforme o plano (de 1% a 2%, mostrada em Carteira), somada no mês e cobrada no mês seguinte; venda devolvida tira a taxa daquela venda. Você é o vendedor: preços, estoque, entrega, trocas, notas fiscais e o atendimento pós-venda são de sua responsabilidade.'],
      ['8. Uso proibido', 'É proibido usar o Helpy para spam, fraude, golpes, discriminação, conteúdo ilegal, coleta de dados sem base legal, tentativas de invadir ou sobrecarregar o sistema, ou para enganar o assistente a fim de obter dados de terceiros.'],
      ['9. Disponibilidade e limitação', 'Trabalhamos para manter o serviço no ar, mas podem ocorrer interrupções. O Helpy não se responsabiliza por decisões tomadas apenas com base em respostas automáticas nem por dados incorretos cadastrados pelo Cliente.'],
      ['10. Encerramento e alterações', 'Você pode excluir a conta a qualquer momento na página Conta; os dados são apagados na hora. Podemos atualizar estes termos; quando isso acontecer, pediremos um novo aceite ao entrar.'],
      ['11. Funcionários', 'O Cliente pode convidar funcionários por link. O funcionário atende os chamados, cuida dos pedidos e da agenda e pode bloquear quem abusa do chat, sem acesso a plano, cobrança, assistentes, canais ou dados. O Cliente responde pelo uso que a sua equipe faz do Helpy e pode remover o acesso a qualquer momento; se a conta da empresa for excluída, os funcionários perdem o acesso a ela.'],
      ['11.1 Canais de terceiros', 'WhatsApp, Instagram e Discord são serviços de outras empresas (Meta e Discord), com regras e aprovações próprias. Ao conectar, você aceita também os termos desses serviços. O Helpy não controla prazos de aprovação, bloqueios ou mudanças feitas por eles.'],
      ['11.2 Aprendizado', 'Se o aprendizado estiver ligado, o assistente lê os atendimentos que a sua equipe respondeu e guarda as respostas que servem para os próximos clientes (sem dados pessoais). Você vê, corrige e apaga o que ele aprendeu na página do assistente.'],
      ['12. Lei e foro', `Estes termos seguem as leis do Brasil. Fica eleito o foro da comarca de ${EMPRESA.cidade}/${EMPRESA.uf}, salvo quando a lei garantir ao consumidor o foro do seu domicílio.`],
      ['13. Contato', `Responsável: ${QUEM}. Dúvidas e reclamações ${CONTATO}.`],
    ],
  },
  privacidade: {
    titulo: 'Política de privacidade (LGPD)',
    intro:
      `Esta política explica quais dados o Helpy trata, por quê e quais são os seus direitos, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Controlador dos dados da plataforma: ${QUEM}.`,
    blocos: [
      ['1. Quem é quem', 'Para os dados da sua conta, o Helpy é o Controlador. Para as conversas e dados do público de cada negócio, o negócio que criou o assistente é o Controlador e o Helpy é o Operador, tratando os dados conforme as instruções dele.'],
      ['2. Dados que tratamos', 'Conta: nome, e-mail, empresa, telefone, data do aceite dos termos e registros de acesso. Assistentes: configuração, documentos e tabelas que o Cliente cadastra ou conecta. Conversas: mensagens, nome e contato informados, horários marcados e avaliações. Segurança: um código aleatório do navegador e um resumo irreversível (hash) do endereço IP, usados só para impedir abuso; o IP em si não é guardado.'],
      ['3. Para que usamos e base legal', 'Para prestar o serviço (execução de contrato); para segurança e prevenção a fraude e spam (legítimo interesse); para cumprir obrigações legais; e, quando for o caso, com o seu consentimento, que você dá ao aceitar estes termos e ao autorizar cada integração.'],
      ['4. Inteligência artificial', 'As mensagens são enviadas a um provedor de IA (Anthropic) apenas para gerar a resposta daquele momento. Não usamos as conversas para treinar modelos.'],
      ['5. Integrações (SharePoint, OneDrive, SQL, SAP, TOTVS e outras)', 'Os dados vindos dessas fontes são lidos só quando necessários para responder ou atualizar a tabela, e só com a autorização dada pelo Cliente ao conectar. Senhas e chaves de API são guardadas criptografadas e nunca voltam para o navegador.'],
      ['6. Compartilhamento', 'Usamos fornecedores para operar o serviço, cada um só com o necessário: banco de dados e servidores (Supabase), site (Vercel), IA (Anthropic), verificação contra robôs (Cloudflare), pagamentos e cobrança (Asaas), entrar com o Google (Google), e os canais que o Cliente conectar (Meta, para WhatsApp e Instagram, e Discord). Mensagens enviadas por esses canais passam também pelos sistemas deles, com as regras deles. Não vendemos dados.'],
      ['6.1 Transferência internacional', 'Alguns desses fornecedores guardam ou processam dados fora do Brasil (por exemplo, nos Estados Unidos). Isso acontece com as garantias previstas na LGPD (art. 33), por meio de contratos e cláusulas de proteção de dados desses fornecedores.'],
      ['6.2 Aprendizado e conversas de teste', 'O aprendizado do assistente usa apenas o que a equipe do próprio negócio respondeu, sem guardar nome, contato ou outros dados pessoais. Conversas de teste do dono não contam como atendimento e não são usadas para aprender.'],
      ['6.3 Armazenamento no navegador', 'O Helpy guarda no seu navegador a sessão de login, a conversa em andamento no chat e preferências como o tema e o som de chamados. Não usamos cookies de publicidade nem rastreadores de terceiros.'],
      ['7. Segurança', 'Conexões criptografadas (HTTPS/TLS), dados criptografados em repouso, chaves de integração no cofre criptografado, acesso de cada conta só aos próprios dados, verificação em duas etapas opcional, proteção contra robôs no cadastro e no chat, e limites contra abuso. Uma conversa ligada a uma conta só abre para essa mesma conta.'],
      ['8. Por quanto tempo', 'Mantemos os dados enquanto a conta estiver ativa ou enquanto o negócio precisar deles para o atendimento. Ao excluir a conta, os dados são apagados, salvo o que a lei obriga a guardar.'],
      ['9. Seus direitos', 'Você pode pedir confirmação, acesso, correção, portabilidade, anonimização ou exclusão dos seus dados e revogar consentimentos. Se você conversou com o assistente de uma empresa, fale primeiro com essa empresa (ela é a Controladora); nós ajudamos a atender o pedido.'],
      ['10. Encarregado (DPO) e contato', `Encarregado pelo tratamento de dados: ${EMPRESA.responsavel}. Pedidos sobre privacidade ${CONTATO}; respondemos em até 15 dias. Também é possível reclamar à Autoridade Nacional de Proteção de Dados (ANPD).`],
    ],
  },
};

export default function Legal({ tipo }) {
  const t = TEXTOS[tipo];
  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-in row">
          <Link to="/" aria-label="Helpy, início"><Logo size={28} /></Link>
        </div>
      </header>
      <main className="lp-in" style={{ maxWidth: 720, padding: '128px 24px 96px' }}>
        <h1 style={{ fontSize: 40, marginBottom: 8 }}>{t.titulo}</h1>
        <p className="muted" style={{ marginBottom: 12 }}>{t.intro}</p>
        <p className="faint" style={{ marginBottom: 32, fontSize: 13 }}>Versão {TERMOS_VERSAO}. Revise com um advogado antes de cobrar clientes.</p>
        <div className="stack stack-lg">
          {t.blocos.map(([h, p]) => (
            <section key={h}>
              <h2 style={{ fontSize: 22, marginBottom: 6 }}>{h}</h2>
              <p className="muted">{p}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
