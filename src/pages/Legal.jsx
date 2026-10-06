import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';
import { TERMOS_VERSAO } from '@/lib/termos';

const TEXTOS = {
  termos: {
    titulo: 'Termos de uso',
    intro:
      'Estes termos valem para quem cria e administra assistentes no Helpy (o "Cliente") e para quem conversa com esses assistentes (o "Usuário final"). Ao criar uma conta, entrar ou usar o chat, você declara que leu e aceita estes termos e a Política de Privacidade.',
    blocos: [
      ['1. O serviço', 'O Helpy permite criar atendentes virtuais com inteligência artificial que conversam com o público do seu negócio, consultam informações e tabelas que você cadastra ou conecta, marcam horários na agenda e abrem chamados para a sua equipe.'],
      ['2. Conta e segurança', 'Você deve informar dados verdadeiros, manter sua senha em sigilo e é responsável pelo que acontece na sua conta. Recomendamos ativar a verificação em duas etapas. O cadastro exige confirmar que você não é um robô. Podemos suspender contas usadas para fraude, spam ou abuso.'],
      ['3. Responsabilidade do Cliente (quem cria o assistente)', 'Você é responsável pelas informações, preços, regras, documentos e tabelas que coloca no assistente; por ter o direito de usar esses dados; por revisar as respostas; e por informar ao seu público que o atendimento é feito por um assistente virtual. Respostas de IA podem conter erros: configure o assistente para encaminhar a uma pessoa os assuntos sensíveis. Em relação aos dados do seu público, você é o Controlador e o Helpy atua como Operador (LGPD, art. 5º).'],
      ['4. Usuário final (quem conversa com o assistente)', 'Qualquer pessoa pode conversar sem conta. Para abrir um chamado, falar com a equipe ou deixar recado é preciso entrar com uma conta. Não envie senhas, dados de cartão ou dados sensíveis (saúde, religião, biometria etc.) no chat. As respostas são geradas automaticamente e não substituem orientação profissional.'],
      ['5. Integrações e fontes de dados', 'Ao conectar planilhas (arquivo, Google Sheets, SharePoint ou OneDrive), bancos de dados SQL, APIs ou sistemas de gestão (como SAP e TOTVS), você declara ter autorização da sua empresa para isso e autoriza o Helpy a ler esses dados apenas para responder no atendimento e mostrar relatórios. Chaves de acesso ficam criptografadas e são usadas só pelo servidor. Use credenciais com permissão mínima (somente leitura sempre que possível). Cada conexão pede uma autorização expressa no momento em que é criada.'],
      ['6. Agenda e atualização automática', 'Se você ativar, o assistente pode marcar horários na sua agenda sozinho (ou deixar pendente para você confirmar) e registrar automaticamente os agendamentos, valores e pedidos nas tabelas que você autorizar. Você pode desligar essas permissões a qualquer momento.'],
      ['7. Planos, cotas e cobrança', 'Os planos têm limites mensais de atendimentos e recursos. Quando a cota acaba, o atendimento automático pausa até a renovação ou a compra de um pacote extra. Para proteger sua cota, o Helpy aplica limites contra abuso (por exemplo, muitas conversas seguidas da mesma rede).'],
      ['8. Uso proibido', 'É proibido usar o Helpy para spam, fraude, golpes, discriminação, conteúdo ilegal, coleta de dados sem base legal, tentativas de invadir ou sobrecarregar o sistema, ou para enganar o assistente a fim de obter dados de terceiros.'],
      ['9. Disponibilidade e limitação', 'Trabalhamos para manter o serviço no ar, mas podem ocorrer interrupções. O Helpy não se responsabiliza por decisões tomadas apenas com base em respostas automáticas nem por dados incorretos cadastrados pelo Cliente.'],
      ['10. Encerramento e alterações', 'Você pode encerrar a conta a qualquer momento. Podemos atualizar estes termos; quando isso acontecer, pediremos um novo aceite ao entrar.'],
    ],
  },
  privacidade: {
    titulo: 'Política de privacidade (LGPD)',
    intro:
      'Esta política explica quais dados o Helpy trata, por quê e quais são os seus direitos, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).',
    blocos: [
      ['1. Quem é quem', 'Para os dados da sua conta, o Helpy é o Controlador. Para as conversas e dados do público de cada negócio, o negócio que criou o assistente é o Controlador e o Helpy é o Operador, tratando os dados conforme as instruções dele.'],
      ['2. Dados que tratamos', 'Conta: nome, e-mail, empresa, telefone, data do aceite dos termos e registros de acesso. Assistentes: configuração, documentos e tabelas que o Cliente cadastra ou conecta. Conversas: mensagens, nome e contato informados, horários marcados e avaliações. Segurança: um código aleatório do navegador e um resumo irreversível (hash) do endereço IP, usados só para impedir abuso; o IP em si não é guardado.'],
      ['3. Para que usamos e base legal', 'Para prestar o serviço (execução de contrato); para segurança e prevenção a fraude e spam (legítimo interesse); para cumprir obrigações legais; e, quando for o caso, com o seu consentimento, que você dá ao aceitar estes termos e ao autorizar cada integração.'],
      ['4. Inteligência artificial', 'As mensagens são enviadas a um provedor de IA (Anthropic) apenas para gerar a resposta daquele momento. Não usamos as conversas para treinar modelos.'],
      ['5. Integrações (SharePoint, OneDrive, SQL, SAP, TOTVS e outras)', 'Os dados vindos dessas fontes são lidos só quando necessários para responder ou atualizar a tabela, e só com a autorização dada pelo Cliente ao conectar. Senhas e chaves de API são guardadas criptografadas e nunca voltam para o navegador.'],
      ['6. Compartilhamento', 'Usamos fornecedores para operar o serviço: hospedagem e banco de dados (Supabase), IA (Anthropic) e envio de e-mails. Não vendemos dados.'],
      ['7. Segurança', 'Conexões criptografadas (HTTPS/TLS), dados criptografados em repouso, chaves de integração no cofre criptografado, acesso de cada conta só aos próprios dados, verificação em duas etapas opcional, proteção contra robôs no cadastro e no chat, e limites contra abuso. Uma conversa ligada a uma conta só abre para essa mesma conta.'],
      ['8. Por quanto tempo', 'Mantemos os dados enquanto a conta estiver ativa ou enquanto o negócio precisar deles para o atendimento. Ao excluir a conta, os dados são apagados, salvo o que a lei obriga a guardar.'],
      ['9. Seus direitos', 'Você pode pedir confirmação, acesso, correção, portabilidade, anonimização ou exclusão dos seus dados e revogar consentimentos. Se você conversou com o assistente de uma empresa, fale primeiro com essa empresa (ela é a Controladora); nós ajudamos a atender o pedido.'],
      ['10. Contato do encarregado (DPO)', 'Para pedidos sobre privacidade, escreva para o canal de privacidade informado na sua conta ou pelo suporte do Helpy. Também é possível reclamar à ANPD.'],
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
