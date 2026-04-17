
DROP POLICY IF EXISTS "Qualquer pessoa pode enviar lead" ON public.enterprise_leads;

CREATE POLICY "Visitantes podem enviar lead"
  ON public.enterprise_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(company_name) BETWEEN 1 AND 200
    AND char_length(contact_name) BETWEEN 1 AND 200
    AND char_length(email) BETWEEN 3 AND 320
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND team_size IN ('1-10','11-50','51-200','200+')
    AND (message IS NULL OR char_length(message) <= 2000)
    AND status = 'new'
  );
