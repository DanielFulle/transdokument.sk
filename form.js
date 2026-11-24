// Formuláre na transdokument.sk -> Cloudflare Worker (bez Formspree).
// Údaje sa zašifrujú priamo v prehliadači verejným kľúčom (kluc.asc),
// Worker ich len podrží, kým si ich n8n na PC neprevezme.
// Nový formulár: <form class="td-form" data-typ="objednavka" action="WORKER/formular" data-next="/dakujeme.html">
// Všetky polia s atribútom name sa odošlú (okrem honeypotu _gotcha).
(function () {
  const OPENPGP = 'https://cdn.jsdelivr.net/npm/openpgp@6.3.2/dist/openpgp.min.mjs';
  let keyPromise;
  const loadKey = async () => {
    const openpgp = await import(OPENPGP);
    const armored = await (await fetch('/kluc.asc', { cache: 'no-cache' })).text();
    return { openpgp, key: await openpgp.readKey({ armoredKey: armored }) };
  };

  document.querySelectorAll('form.td-form').forEach((form) => {
    const status = form.querySelector('.form-status');
    const btn = form.querySelector('button[type=submit]');
    // kľúč a knižnicu načítame vopred, nech je odoslanie rýchle
    form.addEventListener('focusin', () => { keyPromise = keyPromise || loadKey(); }, { once: true });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const next = form.dataset.next || '/thanks.html';
      const fd = new FormData(form);
      // bot vyplnil skryté pole -> tvárime sa, že je všetko OK
      if (fd.get('_gotcha')) { window.location.href = next; return; }

      status.textContent = 'Odosielam…';
      if (btn) btn.disabled = true;
      try {
        const udaje = {};
        for (const [k, v] of fd.entries()) if (k !== '_gotcha') udaje[k] = typeof v === 'string' ? v.trim().slice(0, 2000) : '';
        udaje.cas = new Date().toISOString();
        udaje.stranka = location.href;

        keyPromise = keyPromise || loadKey();
        const { openpgp, key } = await keyPromise;
        const data = await openpgp.encrypt({
          message: await openpgp.createMessage({ text: JSON.stringify(udaje) }),
          encryptionKeys: key,
        });
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ typ: form.dataset.typ, data }),
        });
        if (res.ok) { window.location.href = next; return; }
        const t = await res.text().catch(() => '');
        status.textContent = res.status === 429
          ? 'Príliš veľa pokusov. Skús to neskôr.'
          : 'Niečo sa pokazilo (' + res.status + '). Skús to znova alebo napíš na info@transdokument.sk.';
        console.warn('Formulár:', res.status, t);
      } catch (err) {
        console.warn('Formulár:', err);
        status.textContent = 'Nepodarilo sa odoslať. Skontroluj pripojenie a skús to znova.';
      }
      if (btn) btn.disabled = false;
    });
  });
})();
