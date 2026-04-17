"use client";

/**
 * Sanitiza um primeiro nome para uso em sugestões de username do Telegram.
 * - remove acentos via NFD
 * - remove caracteres não-alfanuméricos
 * - lowercase
 */
export function sanitizeForUsername(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function suggestBotName(fullName: string | null | undefined): string {
  const first = (fullName || "").trim().split(/\s+/)[0] || "Você";
  return `Mika de ${first}`;
}

export function suggestBotUsername(fullName: string | null | undefined): string {
  const first = sanitizeForUsername((fullName || "").trim().split(/\s+/)[0] || "voce");
  return `mika_${first || "voce"}_bot`;
}
