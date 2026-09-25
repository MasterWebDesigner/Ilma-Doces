"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Algo deu errado</h2>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#888" }}>{error.message}</p>
          <button
            onClick={reset}
            style={{ marginTop: "1.5rem", padding: "0.625rem 1.5rem", borderRadius: "0.5rem", backgroundColor: "#d95383", color: "#fff", fontWeight: 600, fontSize: "0.875rem", border: "none", cursor: "pointer" }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
