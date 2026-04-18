export interface TimezoneOption {
  value: string;
  label: string;
  group: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // Brasil
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3) — São Paulo, Rio, BH", group: "Brasil" },
  { value: "America/Bahia", label: "Salvador (GMT-3)", group: "Brasil" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)", group: "Brasil" },
  { value: "America/Recife", label: "Recife (GMT-3)", group: "Brasil" },
  { value: "America/Belem", label: "Belém (GMT-3)", group: "Brasil" },
  { value: "America/Manaus", label: "Manaus (GMT-4) — Amazonas", group: "Brasil" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT-4) — Mato Grosso", group: "Brasil" },
  { value: "America/Porto_Velho", label: "Porto Velho (GMT-4) — Rondônia", group: "Brasil" },
  { value: "America/Boa_Vista", label: "Boa Vista (GMT-4) — Roraima", group: "Brasil" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5) — Acre", group: "Brasil" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)", group: "Brasil" },

  // Américas
  { value: "America/New_York", label: "Nova York (GMT-5/-4)", group: "Américas" },
  { value: "America/Chicago", label: "Chicago (GMT-6/-5)", group: "Américas" },
  { value: "America/Denver", label: "Denver (GMT-7/-6)", group: "Américas" },
  { value: "America/Los_Angeles", label: "Los Angeles (GMT-8/-7)", group: "Américas" },
  { value: "America/Toronto", label: "Toronto (GMT-5/-4)", group: "Américas" },
  { value: "America/Mexico_City", label: "Cidade do México (GMT-6)", group: "Américas" },
  { value: "America/Buenos_Aires", label: "Buenos Aires (GMT-3)", group: "Américas" },
  { value: "America/Santiago", label: "Santiago (GMT-4/-3)", group: "Américas" },
  { value: "America/Bogota", label: "Bogotá (GMT-5)", group: "Américas" },
  { value: "America/Lima", label: "Lima (GMT-5)", group: "Américas" },

  // Europa
  { value: "Europe/London", label: "Londres (GMT+0/+1)", group: "Europa" },
  { value: "Europe/Lisbon", label: "Lisboa (GMT+0/+1)", group: "Europa" },
  { value: "Europe/Madrid", label: "Madri (GMT+1/+2)", group: "Europa" },
  { value: "Europe/Paris", label: "Paris (GMT+1/+2)", group: "Europa" },
  { value: "Europe/Berlin", label: "Berlim (GMT+1/+2)", group: "Europa" },
  { value: "Europe/Rome", label: "Roma (GMT+1/+2)", group: "Europa" },
  { value: "Europe/Amsterdam", label: "Amsterdã (GMT+1/+2)", group: "Europa" },
  { value: "Europe/Moscow", label: "Moscou (GMT+3)", group: "Europa" },

  // Ásia / Oceania / África
  { value: "Asia/Dubai", label: "Dubai (GMT+4)", group: "Outros" },
  { value: "Asia/Kolkata", label: "Mumbai / Nova Délhi (GMT+5:30)", group: "Outros" },
  { value: "Asia/Shanghai", label: "Xangai (GMT+8)", group: "Outros" },
  { value: "Asia/Tokyo", label: "Tóquio (GMT+9)", group: "Outros" },
  { value: "Australia/Sydney", label: "Sydney (GMT+10/+11)", group: "Outros" },
  { value: "Africa/Johannesburg", label: "Joanesburgo (GMT+2)", group: "Outros" },
  { value: "UTC", label: "UTC (GMT+0)", group: "Outros" },
];

export function getTimezoneLabel(value: string): string {
  return TIMEZONE_OPTIONS.find((t) => t.value === value)?.label ?? value;
}
