self.addEventListener('install', (e) => {
  console.log('[Service Worker] Instalado correctamente');
});

self.addEventListener('fetch', (e) => {
  // Solo es para que el navegador sepa que estamos listos para ser una App
});