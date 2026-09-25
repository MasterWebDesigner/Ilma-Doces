import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "2rem" }}>
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Página não encontrada</h2>
      <p style={{ marginTop: "0.5rem", color: "#888" }}>O link que você acessou não existe.</p>
      <Link href="/" style={{ marginTop: "1.5rem", padding: "0.625rem 1.5rem", borderRadius: "0.5rem", backgroundColor: "#d95383", color: "#fff", fontWeight: 600, fontSize: "0.875rem", textDecoration: "none" }}>
        Voltar à loja
      </Link>
    </div>
  );
}
