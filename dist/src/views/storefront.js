import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "hono/jsx/jsx-runtime";
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function Layout({ title, children }) {
    return (_jsxs("html", { lang: "en", children: [_jsxs("head", { children: [_jsx("meta", { charset: "utf-8" }), _jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }), _jsx("title", { children: esc(title) }), _jsx("style", { children: `
          :root { --bg:#0f172a; --card:#1e293b; --text:#e2e8f0; --muted:#94a3b8; --accent:#22c55e; }
          * { box-sizing:border-box; }
          body { margin:0; font-family:'Segoe UI',system-ui,sans-serif; background:var(--bg); color:var(--text); }
          a { color:var(--accent); text-decoration:none; }
          .container { max-width:960px; margin:0 auto; padding:24px; }
          header { display:flex; align-items:center; justify-content:space-between; padding:16px 0; border-bottom:1px solid #334155; margin-bottom:24px; }
          .card { background:var(--card); border-radius:12px; padding:20px; margin-bottom:20px; border:1px solid #334155; }
          .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; }
          .btn { display:inline-block; background:var(--accent); color:#06210f; padding:10px 16px; border-radius:8px; font-weight:600; border:0; cursor:pointer; }
          .btn:hover { opacity:.9; }
          img { max-width:100%; border-radius:8px; }
          .price { color:var(--accent); font-weight:700; }
          input, select, textarea { width:100%; padding:10px; margin:6px 0 12px; border-radius:8px; border:1px solid #334155; background:#0b1220; color:var(--text); }
          .muted { color:var(--muted); }
          .badge { background:#334155; padding:2px 8px; border-radius:20px; font-size:12px; }
        ` })] }), _jsx("body", { children: _jsx("div", { class: "container", children: children }) })] }));
}
export function renderLanding({ stores }) {
    return (_jsxs(Layout, { title: "Multistore Commerce", children: [_jsx("header", { children: _jsx("h1", { children: "\uD83D\uDECD\uFE0F Marketplaces" }) }), _jsxs("div", { class: "grid", children: [stores.map((s) => (_jsxs("div", { class: "card", children: [_jsx("h3", { children: _jsx("a", { href: `/store/${esc(s.slug)}`, children: esc(s.name) }) }), _jsx("div", { class: "muted", children: esc(s.description || 'Browse products') })] }))), stores.length === 0 && _jsx("p", { class: "muted", children: "No stores yet. Create a store to begin." })] })] }));
}
export function renderCatalog({ store, products }) {
    return (_jsxs(Layout, { title: store.name, children: [_jsxs("header", { children: [_jsx("a", { href: "/", children: "\u2190 Home" }), _jsx("a", { href: `/store/${esc(store.slug)}`, children: esc(store.name) })] }), _jsx("h1", { children: esc(store.name) }), store.description && _jsx("p", { class: "muted", children: esc(store.description) }), _jsxs("div", { class: "grid", children: [products.map((p) => (_jsxs("div", { class: "card", children: [Array.isArray(p.images) && p.images[0]?.url && (_jsx("img", { src: p.images[0].url, alt: esc(p.name) })), _jsx("h3", { children: _jsx("a", { href: `/store/${esc(store.slug)}/product/${esc(p.slug)}`, children: esc(p.name) }) }), _jsxs("div", { class: "price", children: [p.price, " ", esc(p.currency)] }), _jsx("div", { class: "muted", children: esc(p.category || p.type) })] }))), products.length === 0 && _jsx("p", { class: "muted", children: "No products available yet." })] })] }));
}
export function renderProduct({ store, product, orderNumber, paymentUrl, }) {
    return (_jsxs(Layout, { title: `${product.name} — ${store.name}`, children: [_jsx("header", { children: _jsx("a", { href: `/store/${esc(store.slug)}`, children: "\u2190 Back" }) }), _jsxs("div", { class: "card", children: [Array.isArray(product.images) && product.images[0]?.url && (_jsx("img", { src: product.images[0].url, alt: esc(product.name) })), _jsx("h1", { children: esc(product.name) }), _jsx("p", { class: "muted", children: esc(product.description || '') }), _jsxs("div", { class: "price", children: [product.price, " ", esc(product.currency)] }), product.type === 'DIGITAL' && _jsx("div", { class: "badge", children: "Digital delivery" }), _jsxs("form", { method: "post", action: `/store/${esc(store.slug)}/checkout`, children: [_jsx("input", { type: "hidden", name: "productId", value: esc(product.id) }), _jsx("input", { type: "hidden", name: "quantity", value: "1" }), orderNumber && (_jsxs(_Fragment, { children: [_jsxs("p", { children: ["Order ", _jsx("b", { children: esc(orderNumber) }), " created."] }), paymentUrl && _jsx("a", { class: "btn", href: esc(paymentUrl), children: "Pay now" })] })), _jsx("button", { class: "btn", type: "submit", children: "Buy now" })] })] })] }));
}
export function renderOrderStatus({ store, order }) {
    const statusLabel = order.status.replace(/_/g, ' ');
    return (_jsxs(Layout, { title: `Order ${order.orderNumber}`, children: [_jsx("header", { children: _jsx("a", { href: `/store/${esc(store.slug)}`, children: "\u2190 Store" }) }), _jsxs("div", { class: "card", children: [_jsxs("h1", { children: ["Order ", esc(order.orderNumber)] }), _jsxs("p", { class: "muted", children: ["Status: ", _jsx("span", { class: "badge", children: esc(statusLabel) })] }), _jsxs("p", { class: "price", children: ["Total: ", order.totalAmount, " ", esc(order.currency)] }), _jsx("p", { children: _jsx("a", { href: `/store/${esc(store.slug)}/order/${esc(order.orderNumber)}/pay`, children: "Continue to payment" }) })] })] }));
}
