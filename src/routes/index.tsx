import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VENDETTA • Gestão de Vendas" },
      { name: "description", content: "Central operacional de vendas, encomendas e produtos VENDETTA." },
      { property: "og:title", content: "VENDETTA • Gestão de Vendas" },
      { property: "og:description", content: "Central operacional de vendas, encomendas e produtos VENDETTA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="vendetta-shell">
      <iframe
        className="vendetta-frame"
        src="/vendetta.html"
        title="VENDETTA Gestão de Vendas"
      />
    </main>
  );
}