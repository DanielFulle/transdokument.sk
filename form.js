(function(){
  const form = document.getElementById('lead-form');
  const status = document.getElementById('form-status');
  if(!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'Odosielam…';
    const data = new FormData(form);
    try {
      const res = await fetch(form.action, { method: 'POST', body: data, headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        form.reset();
        status.textContent = 'Hotovo! Skontroluj si schránku – poslal som potvrdenie.';
      } else {
        const json = await res.json().catch(()=>({}));
        status.textContent = (json.errors && json.errors[0] && json.errors[0].message) || json.error || 'Niečo sa pokazilo. Skús to znova alebo napíš na info@transdokument.sk.';
      }
    } catch (err) {
      status.textContent = 'Nie je dostupné pripojenie. Skús to znova.';
    }
  });
})();
