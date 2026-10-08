// Funções herdadas do Horizons: desligadas. Respondem 410 para qualquer chamada.
Deno.serve(() =>
  new Response(JSON.stringify({ error: 'Esta função foi desativada.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  })
);
