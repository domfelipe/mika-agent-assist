export const DEFAULT_OLLAMA_PROVIDER = "ollama-cloud";
export const DEFAULT_OLLAMA_MODEL = "gemma4:31b-cloud";

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "openrouter/google/gemma-4-27b-a4b-it": DEFAULT_OLLAMA_MODEL,
  "openrouter/google/gemma-4-31b-it": DEFAULT_OLLAMA_MODEL,
  "ollama-cloud/gemma4:31b-cloud": DEFAULT_OLLAMA_MODEL,
};

export function normalizeOllamaModelSelection(value?: string | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_OLLAMA_MODEL;

  const mapped = LEGACY_MODEL_ALIASES[trimmed];
  if (mapped) return mapped;

  if (trimmed.includes("/") && trimmed.includes(":")) {
    const candidate = trimmed.split("/").pop()?.trim();
    if (candidate) return candidate;
  }

  return trimmed;
}

export function formatOllamaModelLabel(modelName: string): string {
  if (modelName === DEFAULT_OLLAMA_MODEL) {
    return "Gemma 4 31B Cloud — Padrão Mika";
  }

  if (modelName.startsWith("gemma4:")) {
    return modelName.replace("gemma4:", "Gemma 4 ");
  }

  return modelName;
}
