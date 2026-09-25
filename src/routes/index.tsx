import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

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
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const normalizeName = (name: string) =>
      name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.|\.$/g, "");

    const accountEmail = (name: string) => `${normalizeName(name)}@vendetta.local`;

    const reply = (id: string, ok: boolean, data?: unknown, error?: string) => {
      frameRef.current?.contentWindow?.postMessage(
        { source: "vendetta-cloud", id, ok, data, error },
        window.location.origin,
      );
    };

    const loadData = async (userId: string, displayName: string) => {
      const [salesResult, ordersResult, productsResult] = await Promise.all([
        supabase.from("sales").select("*").order("sale_date", { ascending: false }),
        supabase.from("orders").select("*").order("order_date", { ascending: false }),
        supabase.from("products").select("*").order("sort_order"),
      ]);
      const error = salesResult.error ?? ordersResult.error ?? productsResult.error;
      if (error) throw error;

      return {
        userId,
        user: displayName,
        sales: (salesResult.data ?? []).map((sale) => ({
          id: sale["id"],
          createdAt: new Date(sale.created_at).getTime(),
          date: sale.sale_date,
          seller: sale["seller"],
          buyer: sale["buyer"],
          phone: sale["phone"],
          family: sale["family"],
          note: sale["note"],
          mode: sale["mode"],
          priceMode: sale.price_mode,
          base: Number(sale["base"]),
          total: Number(sale["total"]),
          items: Array.isArray(sale["items"]) ? sale["items"] : [],
        })),
        orders: (ordersResult.data ?? []).map((order) => ({
          id: order["id"],
          createdAt: new Date(order.created_at).getTime(),
          date: order.order_date,
          day: order["day"],
          seller: order["seller"],
          buyer: order["buyer"],
          phone: order["phone"],
          family: order["family"],
          product: order["product"]_id,
          qty: order.quantity,
          mode: order["mode"],
          total: Number(order["total"]),
          note: order["note"],
          status: order["status"],
        })),
        products: (productsResult.data ?? []).map((product) => ({
          id: product.id,
          name: product.name,
          price: Number(product.price),
          partner: Number(product.partner_price),
          unit: product.unit,
        })),
      };
    };

    const ensureProfile = async (userId: string, displayName: string) => {
      const normalized = normalizeName(displayName);
      const { error } = await supabase.from("profiles").upsert(
        { id: userId, display_name: displayName, normalized_name: normalized, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
      if (error) throw error;
    };

    const importLegacyData = async (
      userId: string,
      legacy?: { sales?: Array<Record<string, unknown>>; orders?: Array<Record<string, unknown>> },
    ) => {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const sales = (legacy?.sales ?? []).map((sale) => ({
        id: typeof sale["id"] === "string" && uuid.test(sale["id"]) ? sale["id"] : crypto.randomUUID(),
        created_by: userId,
        created_at: new Date(Number(sale["createdAt"]) || Date.now()).toISOString(),
        sale_date: typeof sale["date"] === "string" ? sale["date"] : new Date(Number(sale["createdAt"]) || Date.now()).toISOString(),
        seller: String(sale["seller"] ?? ""), buyer: String(sale["buyer"] ?? ""), phone: String(sale["phone"] ?? ""),
        family: String(sale["family"] ?? ""), note: String(sale["note"] ?? ""),
        mode: sale["mode"] === "dirty" ? "dirty" : "clean",
        price_mode: sale["priceMode"] === "partner" ? "partner" : "standard",
        base: Number(sale["base"]) || 0, total: Number(sale["total"]) || 0,
        items: Array.isArray(sale["items"]) ? sale["items"] : [],
      }));
      const orders = (legacy?.orders ?? []).map((order) => ({
        id: typeof order["id"] === "string" && uuid.test(order["id"]) ? order["id"] : crypto.randomUUID(),
        created_by: userId,
        created_at: new Date(Number(order["createdAt"]) || Date.now()).toISOString(),
        order_date: typeof order["date"] === "string" ? order["date"] : new Date(Number(order["createdAt"]) || Date.now()).toISOString(),
        day: String(order["day"] ?? ""), seller: String(order["seller"] ?? ""), buyer: String(order["buyer"] ?? ""),
        phone: String(order["phone"] ?? ""), family: String(order["family"] ?? ""), product_id: String(order["product"] ?? "rifle"),
        quantity: Math.max(1, Number(order["qty"]) || 1), mode: order["mode"] === "dirty" ? "dirty" : "clean",
        total: Number(order["total"]) || 0, note: String(order["note"] ?? ""),
        status: order["status"] === "done" || order["status"] === "cancelled" ? order["status"] : "pending",
      }));
      if (sales.length) {
        const { error } = await supabase.from("sales").upsert(sales, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
      }
      if (orders.length) {
        const { error } = await supabase.from("orders").upsert(orders, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
      }
    };

    const authenticatedData = async (legacy?: { sales?: Array<Record<string, unknown>>; orders?: Array<Record<string, unknown>> }, fallbackName?: string) => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      const metadataName = typeof data.user.user_metadata?.["display_name"] === "string" ? data.user.user_metadata.display_name : "";
      const displayName = fallbackName || metadataName || data.user.email?.split("@")[0] || "Usuário";
      await ensureProfile(data.user.id, displayName);
      await importLegacyData(data.user.id, legacy);
      return loadData(data.user.id, displayName);
    };

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as { source?: string; id?: string; action?: string; payload?: Record<string, unknown> };
      if (message.source !== "vendetta-frame" || !message.id || !message.action) return;
      const { id, action, payload = {} } = message;
      try {
        if (action === "initialize") {
          reply(id, true, await authenticatedData(payload["legacy"] as never));
          return;
        }
        if (action === "register") {
          const name = String(payload["name"] ?? "").trim();
          const password = String(payload["pass"] ?? "");
          const { data, error } = await supabase.auth.signUp({
            email: accountEmail(name), password,
            options: { data: { display_name: name }, emailRedirectTo: window.location.origin },
          });
          if (error) throw error;
          if (!data.user) throw new Error("Não foi possível criar a conta.");
          await ensureProfile(data.user.id, name);
          reply(id, true, await authenticatedData(payload["legacy"] as never, name));
          return;
        }
        if (action === "login") {
          const name = String(payload["name"] ?? "").trim();
          const password = String(payload["pass"] ?? "");
          const signIn = await supabase.auth.signInWithPassword({ email: accountEmail(name), password });
          const legacyUsers = Array.isArray((payload["legacy"] as { users?: unknown[] } | undefined)?.users)
            ? (payload["legacy"] as { users: Array<{ name?: string; pass?: string }> }).users
            : [];
          const legacyMatch = legacyUsers.some((user) => user.name?.toLowerCase() === name.toLowerCase() && user.pass === password);
          let authenticatedUser = signIn.data.user;
          let authError = signIn.error;
          if (authError && legacyMatch) {
            const signup = await supabase.auth.signUp({ email: accountEmail(name), password, options: { data: { display_name: name } } });
            authenticatedUser = signup.data.user;
            authError = signup.error;
          }
          if (authError || !authenticatedUser) throw authError ?? new Error("Nome ou senha incorretos.");
          await ensureProfile(authenticatedUser.id, name);
          reply(id, true, await authenticatedData(payload["legacy"] as never, name));
          return;
        }
        if (action === "google") {
          const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
          if (result.error) throw result.error;
          if (!result.redirected) reply(id, true, await authenticatedData(payload["legacy"] as never));
          return;
        }
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error("Sua sessão expirou. Entre novamente.");
        if (action === "saveSale") {
          const sale = payload["sale"] as Record<string, unknown>;
          const { error } = await supabase.from("sales").insert({
            id: String(sale["id"]), created_by: userData.user.id,
            created_at: new Date(Number(sale["createdAt"]) || Date.now()).toISOString(), sale_date: String(sale["date"]),
            seller: String(sale["seller"] ?? ""), buyer: String(sale["buyer"] ?? ""), phone: String(sale["phone"] ?? ""),
            family: String(sale["family"] ?? ""), note: String(sale["note"] ?? ""), mode: String(sale["mode"]),
            price_mode: String(sale["priceMode"] ?? "standard"), base: Number(sale["base"]), total: Number(sale["total"]),
            items: sale["items"] as never,
          });
          if (error) throw error;
        } else if (action === "saveOrder") {
          const order = payload["order"] as Record<string, unknown>;
          const { error } = await supabase.from("orders").insert({
            id: String(order["id"]), created_by: userData.user.id,
            created_at: new Date(Number(order["createdAt"]) || Date.now()).toISOString(), order_date: String(order["date"]),
            day: String(order["day"] ?? ""), seller: String(order["seller"] ?? ""), buyer: String(order["buyer"] ?? ""),
            phone: String(order["phone"] ?? ""), family: String(order["family"] ?? ""), product_id: String(order["product"]),
            quantity: Number(order["qty"]), mode: String(order["mode"]), total: Number(order["total"]), note: String(order["note"] ?? ""),
            status: String(order["status"] ?? "pending"),
          });
          if (error) throw error;
        } else if (action === "updateOrder") {
          const { error } = await supabase.from("orders").update({ status: String(payload["status"]) }).eq("id", String(payload["id"]));
          if (error) throw error;
        } else if (action === "deleteOrder") {
          const { error } = await supabase.from("orders").delete().eq("id", String(payload["id"]));
          if (error) throw error;
        } else if (action === "deleteSale") {
          const { error } = await supabase.from("sales").delete().eq("id", String(payload["id"]));
          if (error) throw error;
        } else if (action === "clearSales") {
          const ids = Array.isArray(payload["id"]s) ? payload["id"]s.map(String) : [];
          if (ids.length) {
            const { error } = await supabase.from("sales").delete().in("id", ids);
            if (error) throw error;
          }
        } else if (action === "logout") {
          await supabase.auth.signOut();
        }
        reply(id, true, { ok: true });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
        reply(id, false, undefined, messageText);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="vendetta-shell">
      <iframe
        ref={frameRef}
        className="vendetta-frame"
        src="/vendetta.html"
        title="VENDETTA Gestão de Vendas"
      />
    </main>
  );
}