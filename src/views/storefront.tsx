import type { StoreRow, ProductRow, OrderRow } from '../db/types.js';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function Layout({ title, children }: { title: string; children: any }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{esc(title)}</title>
        <style>{`
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
        `}</style>
      </head>
      <body>
        <div class="container">{children}</div>
      </body>
    </html>
  );
}

export function renderLanding({ stores }: { stores: StoreRow[] }) {
  return (
    <Layout title="Multistore Commerce">
      <header><h1>🛍️ Marketplaces</h1></header>
      <div class="grid">
        {stores.map((s) => (
          <div class="card">
            <h3><a href={`/store/${esc(s.slug)}`}>{esc(s.name)}</a></h3>
            <div class="muted">{esc(s.description || 'Browse products')}</div>
          </div>
        ))}
        {stores.length === 0 && <p class="muted">No stores yet. Create a store to begin.</p>}
      </div>
    </Layout>
  );
}

export function renderCatalog({ store, products }: { store: StoreRow; products: ProductRow[] }) {
  return (
    <Layout title={store.name}>
      <header>
        <a href="/">← Home</a>
        <a href={`/store/${esc(store.slug)}`}>{esc(store.name)}</a>
      </header>
      <h1>{esc(store.name)}</h1>
      {store.description && <p class="muted">{esc(store.description)}</p>}
      <div class="grid">
        {products.map((p) => (
          <div class="card">
            {Array.isArray(p.images) && (p.images as Array<{ url?: string }>)[0]?.url && (
              <img src={(p.images as Array<{ url?: string }>)[0].url} alt={esc(p.name)} />
            )}
            <h3><a href={`/store/${esc(store.slug)}/product/${esc(p.slug)}`}>{esc(p.name)}</a></h3>
            <div class="price">{p.price} {esc(p.currency)}</div>
            <div class="muted">{esc(p.category || p.type)}</div>
          </div>
        ))}
        {products.length === 0 && <p class="muted">No products available yet.</p>}
      </div>
    </Layout>
  );
}

export function renderProduct({
  store,
  product,
  orderNumber,
  paymentUrl,
}: {
  store: StoreRow;
  product: ProductRow;
  orderNumber?: string;
  paymentUrl?: string;
}) {
  return (
    <Layout title={`${product.name} — ${store.name}`}>
      <header>
        <a href={`/store/${esc(store.slug)}`}>← Back</a>
      </header>
      <div class="card">
        {Array.isArray(product.images) && (product.images as Array<{ url?: string }>)[0]?.url && (
          <img src={(product.images as Array<{ url?: string }>)[0].url} alt={esc(product.name)} />
        )}
        <h1>{esc(product.name)}</h1>
        <p class="muted">{esc(product.description || '')}</p>
        <div class="price">{product.price} {esc(product.currency)}</div>
        {product.type === 'DIGITAL' && <div class="badge">Digital delivery</div>}
        <form method="post" action={`/store/${esc(store.slug)}/checkout`}>
          <input type="hidden" name="productId" value={esc(product.id)} />
          <input type="hidden" name="quantity" value="1" />
          {orderNumber && (
            <>
              <p>Order <b>{esc(orderNumber)}</b> created.</p>
              {paymentUrl && <a class="btn" href={esc(paymentUrl)}>Pay now</a>}
            </>
          )}
          <button class="btn" type="submit">Buy now</button>
        </form>
      </div>
    </Layout>
  );
}

export function renderOrderStatus({ store, order }: { store: StoreRow; order: OrderRow }) {
  const statusLabel = order.status.replace(/_/g, ' ');
  return (
    <Layout title={`Order ${order.orderNumber}`}>
      <header><a href={`/store/${esc(store.slug)}`}>← Store</a></header>
      <div class="card">
        <h1>Order {esc(order.orderNumber)}</h1>
        <p class="muted">Status: <span class="badge">{esc(statusLabel)}</span></p>
        <p class="price">Total: {order.totalAmount} {esc(order.currency)}</p>
        <p><a href={`/store/${esc(store.slug)}/order/${esc(order.orderNumber)}/pay`}>Continue to payment</a></p>
      </div>
    </Layout>
  );
}
