/**
 * Traduz mensagens de erro do Supabase Auth para mensagens em português específicas.
 */
export function translateAuthError(message: string | undefined): string {
  if (!message) return "Algo deu errado. Tente novamente.";
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials") || m.includes("invalid_credentials"))
    return "E-mail ou senha incorretos. Tente novamente.";
  if (m.includes("user already registered") || m.includes("already been registered") || m.includes("already exists"))
    return "Esse e-mail já possui cadastro. Deseja fazer login?";
  if (m.includes("password") && (m.includes("short") || m.includes("weak") || m.includes("characters")))
    return "A senha precisa de pelo menos 8 caracteres, 1 maiúscula e 1 número.";
  if (m.includes("email") && m.includes("invalid"))
    return "Formato de e-mail inválido.";
  if (m.includes("rate limit") || m.includes("too many requests"))
    return "Muitas tentativas. Aguarde 1 minuto e tente novamente.";
  if (m.includes("expired") || m.includes("jwt") || m.includes("session"))
    return "Sua sessão expirou. Faça login novamente.";
  if (m.includes("email not confirmed"))
    return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  if (m.includes("pwned") || m.includes("compromised") || m.includes("breach"))
    return "Esta senha apareceu em vazamentos públicos. Escolha outra mais forte.";

  return message;
}
