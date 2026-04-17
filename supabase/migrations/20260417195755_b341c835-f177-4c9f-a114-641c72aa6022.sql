-- Wrappers para o Supabase Vault, executáveis apenas pelo service_role
-- (usados pelas Edge Functions Telegram para guardar tokens com criptografia).

CREATE OR REPLACE FUNCTION public.vault_create_secret(
  secret_value text,
  secret_name text,
  secret_description text DEFAULT ''
)
RETURNS TABLE(secret_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  RETURN QUERY
  SELECT vault.create_secret(secret_value, secret_name, secret_description);
END;
$$;

REVOKE ALL ON FUNCTION public.vault_create_secret(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_create_secret(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.vault_decrypt_secret(secret_id uuid)
RETURNS TABLE(decrypted_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  RETURN QUERY
  SELECT ds.decrypted_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.id = secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_decrypt_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_decrypt_secret(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.vault_delete_secret(secret_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = secret_id;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_delete_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_delete_secret(uuid) TO service_role;