// Formuláre na transdokument.sk -> Cloudflare Worker (bez Formspree).
// Údaje sa zašifrujú priamo v prehliadači verejným kľúčom (kluc.asc),
// Worker ich len podrží, kým si ich n8n na PC neprevezme.
// Nový formulár: <form class="td-form" data-typ="objednavka" action="WORKER/formular" data-next="/dakujeme.html">
// Všetky polia s atribútom name sa odošlú (okrem honeypotu _gotcha).
// Viac zaškrtnutých polí s rovnakým menom (napr. roky) sa spojí: "2024, 2025".
// <fieldset data-aspon-jeden="Vyber aspoň jeden rok."> = aspoň jedno zaškrtávacie pole musí byť zaškrtnuté.
// E-mail z prvého formulára si stránka pamätá (len v tomto okne prehliadača) a predvyplní ho v ďalšom.
(function () {
  const OPENPGP = 'https://cdn.jsdelivr.net/npm/openpgp@6.3.2/dist/openpgp.min.mjs';
  let keyPromise;
  const loadKey = async () => {
    const openpgp = await import(OPENPGP);
    const armored = await (await fetch('/kluc.asc', { cache: 'no-cache' })).text();
    return { openpgp, key: await openpgp.readKey({ armoredKey: armored }) };
  };

  const pamataj = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* nevadí */ } };
  const spomen = (k) => { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } };

  document.querySelectorAll('form.td-form').forEach((form) => {
    const status = form.querySelector('.form-status');
    const btn = form.querySelector('button[type=submit]');
    const emailPole = form.querySelector('input[name=email]');
    if (emailPole && !emailPole.value) emailPole.value = spomen('td_email');
    // kľúč a knižnicu načítame vopred, nech je odoslanie rýchle
    form.addEventListener('focusin', () => { keyPromise = keyPromise || loadKey(); }, { once: true });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const next = form.dataset.next || '/thanks.html';
      const fd = new FormData(form);
      // bot vyplnil skryté pole -> tvárime sa, že je všetko OK
      if (fd.get('_gotcha')) { window.location.href = next; return; }

      for (const fs of form.querySelectorAll('[data-aspon-jeden]')) {
        if (!fs.querySelector('input:checked')) {
          status.textContent = fs.dataset.asponJeden;
          const prve = fs.querySelector('input');
          if (prve) prve.focus();
          return;
        }
      }

      status.textContent = 'Odosielam…';
      if (btn) btn.disabled = true;
      try {
        const udaje = {};
        for (const [k, v] of fd.entries()) {
          if (k === '_gotcha') continue;
          const t = typeof v === 'string' ? v.trim().slice(0, 2000) : '';
          udaje[k] = k in udaje ? udaje[k] + ', ' + t : t;
        }
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
        if (res.ok) {
          if (udaje.email) pamataj('td_email', udaje.email);
          window.location.href = next;
          return;
        }
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
