const steps = [
  { n: 1, title: "Escolha seu plano", description: "4 planos pensados para diferentes níveis de uso." },
  { n: 2, title: "Conecte seu Telegram", description: "Em 30 segundos. Escaneie um QR code e pronto." },
  { n: 3, title: "Personalize seu agente", description: "Defina nome, tom de voz, integrações e skills." },
  { n: 4, title: "Converse e produza mais", description: "Mande mensagens como faria com um assistente humano." },
];

export function HowItWorksSection() {
  return (
    <section id="como-funciona" className="py-20 sm:py-28 bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Como funciona</h2>
          <p className="mt-4 text-lg text-muted-foreground">Do cadastro à primeira conversa em menos de 5 minutos.</p>
        </div>

        <ol className="mt-16 grid grid-cols-1 lg:grid-cols-4 gap-10 lg:gap-4 relative">
          {steps.map((s, i) => (
            <li key={s.n} className="relative flex flex-col items-center text-center lg:px-4">
              {i < steps.length - 1 && (
                <div
                  className="hidden lg:block absolute top-8 left-[calc(50%+2.5rem)] right-[-50%] h-px bg-primary/30"
                  aria-hidden
                />
              )}
              <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold text-xl shadow-glow z-10">
                {s.n}
              </div>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-xs">{s.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
