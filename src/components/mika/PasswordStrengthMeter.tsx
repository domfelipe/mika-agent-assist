"use client";

import { passwordStrength, passwordStrengthLabel } from "@/lib/password";
import { cn } from "@/lib/utils";

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordStrength(password);
  const colors = [
    "bg-destructive",
    "bg-destructive",
    "bg-warning",
    "bg-success",
  ];
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < score ? colors[score] : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className={cn(
        "text-xs",
        score < 2 ? "text-destructive" : score === 2 ? "text-warning" : "text-success",
      )}>
        Força: {passwordStrengthLabel(score)}
      </p>
    </div>
  );
}
