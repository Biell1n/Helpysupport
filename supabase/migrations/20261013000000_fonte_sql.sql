-- Tabela ligada direto a um banco SQL do cliente (PostgreSQL, MySQL, SQL Server).
-- A senha usa o mesmo cofre (Vault) das chaves de API: o gatilho tabelas_segredo
-- tira "header_valor" do api_config e guarda criptografado.
alter table public.tabelas drop constraint if exists tabelas_fonte_check;
alter table public.tabelas add constraint tabelas_fonte_check check (fonte in ('manual', 'url', 'api', 'sql'));
