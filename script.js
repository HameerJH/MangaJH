// ==========================================
// RASTREADOR DE ERRORES (CHIVATO VISUAL)
// ==========================================
window.addEventListener('error', function(e) {
    console.error("MangaJH Crash:", e.message);
    const content = document.getElementById('contentArea');
    if(content) content.innerHTML = `<div style="text-align:center; padding: 50px; color: var(--danger); font-size: 1.2em;"><strong>⚠️ Error de sistema detectado:</strong><br>${e.message}<br>Revisa la consola (F12) para más detalles.</div>`;
});

// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================
const supabaseUrl = 'https://xkvcusirmlkdvbbiddjc.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrdmN1c2lybWxrZHZiYmlkZGpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMjYzNTYsImV4cCI6MjEwMjkwMjM1Nn0.RkWyqGNIJmrTSm1vti-OOycMcCBkGuETozQs6kC6bXY';
const supabaseApp = supabase.createClient(supabaseUrl, supabaseKey);

// ==========================================
// VARIABLES GLOBALES Y DE ESTADO
// ==========================================
let mangaData = [];
let definedGenres = [];
let top10Ids = [];
let featuredMangas = [];
let shopItems = []; 

let savedFavs = [];
let savedSeen = [];
let readingHistory = [];
let currentUser = null;

try { savedFavs = JSON.parse(localStorage.getItem('mangaJH_v2_favs')) || []; } catch(e) { localStorage.setItem('mangaJH_v2_favs', '[]'); }
try { savedSeen = JSON.parse(localStorage.getItem('mangaJH_v2_seen')) || []; } catch(e) { localStorage.setItem('mangaJH_v2_seen', '[]'); }
try { readingHistory = JSON.parse(localStorage.getItem('mangaJH_v2_history')) || []; } catch(e) { localStorage.setItem('mangaJH_v2_history', '[]'); }
try { currentUser = JSON.parse(localStorage.getItem('mangaJH_user')) || null; } catch(e) { localStorage.removeItem('mangaJH_user'); }

let scrollPositions = {}; 
let currentMode = 'home'; 
let searchContextMode = 'home'; 
let currentGenreView = '';
let lastListHash = '';
let lastMangaViewed = ''; 

let isLoginMode = true; 
let userAcceptedWarning = false; 
window.isSwipingFeatured = false; 

let renderTimer; 
let heroSlideshowInterval = null; 
let commentsInterval = null;
let coversSlideshowInterval = null; 
let mainFeaturedInterval = null;
let currentFeaturedIndex = 0;

// Evalúa si una fecha es menor a 4 días respecto a hoy
function isRecentlyUpdated(lastUpdateDateString, daysToKeep = 4) {
    if (!lastUpdateDateString) return false;
    
    const updateTime = new Date(lastUpdateDateString).getTime();
    const now = Date.now();
    
    // Convertimos días a milisegundos (1 día = 86,400,000 ms)
    const msInADay = 1000 * 60 * 60 * 24;
    const differenceInDays = (now - updateTime) / msInADay;
    
    // Retorna true si la diferencia es menor o igual a los días indicados
    return differenceInDays <= daysToKeep;
}

// ==========================================
// DICCIONARIO INTELIGENTE DE FORMATOS
// ==========================================
function getFormatDetails(formatStr) {
    const f = String(formatStr || 'manga').toLowerCase();
    if (f === 'novela') return { label: 'Novela L.', icon: '📖', ribbon: 'novela', display: '📖 NOVELA L.', chapters: '📚 Volúmenes' };
    if (f === 'novela_normal') return { label: 'Novela', icon: '📚', ribbon: 'novela_normal', display: '📚 NOVELA', chapters: '📚 Capítulos' };
    if (f === 'manhwa') return { label: 'Manhwa', icon: '📱', ribbon: 'manhwa', display: '📱 MANHWA', chapters: '📚 Capítulos' };
    if (f === 'novela_corta') return { label: 'Novela C.', icon: '📘', ribbon: 'novela_corta', display: '📘 NOVELA CORTA', chapters: '📚 Partes' };
    if (f === 'comic') return { label: 'Cómic', icon: '💥', ribbon: 'comic', display: '💥 CÓMIC', chapters: '📚 Números' };
    if (f === 'webnovel') return { label: 'Webnovel', icon: '🌐', ribbon: 'webnovel', display: '🌐 WEBNOVEL', chapters: '📚 Capítulos' };
    if (f === 'fanfic') return { label: 'Fanfic', icon: '✍️', ribbon: 'fanfic', display: '✍️ FANFIC', chapters: '📚 Capítulos' };
    
    // Por defecto: Manga
    return { label: 'Manga', icon: '💭', ribbon: 'manga', display: '💭 MANGA', chapters: '📚 Tomos' };
}

// ==========================================
// MODO OSCURO / CLARO
// ==========================================
const themeToggleBtn = document.getElementById('themeToggle');
if (localStorage.getItem('mangaJH_theme') === 'light') { document.body.classList.add('light-mode'); if(themeToggleBtn) themeToggleBtn.innerText = '🌙'; }
function toggleTheme() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  localStorage.setItem('mangaJH_theme', isLight ? 'light' : 'dark');
  if(themeToggleBtn) themeToggleBtn.innerText = isLight ? '🌙' : '☀️';
}
// ==========================================
// INICIALIZACIÓN: DESCARGAR BASE DE DATOS
// ==========================================
async function initApp() {
  showLoading(false); 
  
  const [catalogoRes, tiendaRes] = await Promise.all([
      supabaseApp.from('catalogo').select('*'),
      supabaseApp.from('tienda').select('*')
  ]);
  
  if (catalogoRes.error || tiendaRes.error) {
    const ca = document.getElementById('contentArea');
    if(ca) ca.innerHTML = `<div style="text-align:center; padding: 50px; color: var(--danger); font-size: 1.2em;">Error al conectar con la base de datos. Verifica tu internet.</div>`;
    return;
  }

  shopItems = tiendaRes.data.map(item => ({
      ...item,
      class: item.id === 'fuego' ? 'efecto-fuego' : (item.id === 'neon' ? 'efecto-neon' : '')
  }));

  const data = catalogoRes.data || [];
  
  mangaData = data.map(m => {
    let genArray = ['Desconocido'];
    if (Array.isArray(m.genres) && m.genres.length > 0) {
        genArray = m.genres;
    } else if (typeof m.genres === 'string' && m.genres.trim() !== '') {
        genArray = [m.genres];
    } else if (typeof m.genre === 'string' && m.genre.trim() !== '') {
        genArray = [m.genre];
    }

    return {
      id: m.id || Math.random().toString(36),
      title: m.title || 'Sin Título',
      genres: genArray, 
      genre: String(genArray[0] || 'Desconocido'), 
      format: m.format || 'manga',
      status: m.status || 'emision', // <-- NUEVA LÍNEA PARA EL ESTADO
      badge: m.badge || '',
      updated_at: m.updated_at || null, // <-- NUEVA LÍNEA: Descargamos la fecha de Supabase
      covers: m.covers || [],
      banners: m.banners || [],
      synopsis: m.synopsis || '',
      chapters: m.chapters || []
    };
  });

  const genresSet = new Set();
  mangaData.forEach(m => {
      if (Array.isArray(m.genres)) {
          m.genres.forEach(g => {
              if (g && typeof g === 'string' && g.trim() !== '') genresSet.add(g.trim());
          });
      }
  });
  definedGenres = Array.from(genresSet).sort();
  
  top10Ids = data.filter(m => m.is_top10).map(m => m.id);
  featuredMangas = data.filter(m => m.is_featured && m.featured_image).map(m => ({ id: m.id, image: m.featured_image }));

  updateHeaderUI();
  handleRouting(true);

  if (currentUser) {
      setTimeout(() => { checkDailyReward(); }, 1500);
  }
}

// ==========================================
// NAVEGACIÓN Y CAROUSELES
// ==========================================
// ==========================================
// NAVEGACIÓN Y CAROUSELES
// ==========================================
// ==========================================
// NAVEGACIÓN Y CAROUSELES
// ==========================================
function goBack() { 
  const s = document.getElementById('sidebar'); 
  if(s) s.classList.remove('open'); 

  // Si el usuario navegó de forma natural dentro de la página, usamos el retroceso limpio del celular
  if (window.appNavCount && window.appNavCount > 1) {
      window.history.back();
  } else {
      // Si no hay historial (ej. entró desde un link de WhatsApp), lo mandamos al inicio de forma silenciosa
      let target = 'home';
      if (lastListHash && lastListHash !== 'public_profile' && lastListHash !== 'search') {
          target = lastListHash;
      }
      window.location.replace('#' + target);
  }
}

function resetScrollAndGo(targetHash) { 
  scrollPositions[targetHash] = 0; 
  window.location.hash = targetHash; 
  // MAGIA AQUÍ: Cierra el menú al tocar cualquier opción normal
  const s = document.getElementById('sidebar'); 
  if(s) s.classList.remove('open'); 
}

function forceHome() { 
  const sInput = document.getElementById('searchInput'); if(sInput) sInput.value = ''; 
  if (window.location.hash === '' || window.location.hash === '#home') { 
      scrollPositions['home'] = 0; lastListHash = ''; handleRouting(false); 
  } else { 
      scrollPositions['home'] = 0; window.location.hash = 'home'; 
  } 
  // MAGIA AQUÍ: Cierra el menú si tocas el logo de MangaJH
  const s = document.getElementById('sidebar'); 
  if(s) s.classList.remove('open'); 
}

function closeSearch() { const s = document.getElementById('searchInput'); if(s) s.value = ''; searchMangas(); }
function scrollCarousel(id, amount) { const container = document.getElementById(id); if(container) container.scrollBy({ left: amount, behavior: 'smooth' }); }
function toggleMenu() { const s = document.getElementById('sidebar'); if(s) s.classList.toggle('open'); }
function toggleDropdown(id, btn) {
  const container = document.getElementById(id);
  const arrow = btn.querySelector('.dropdown-arrow');
  if(container && arrow) {
      if (container.style.display === 'block') { container.style.display = 'none'; arrow.style.transform = 'rotate(0deg)'; } 
      else { container.style.display = 'block'; arrow.style.transform = 'rotate(180deg)'; }
  }
}

function normalizeStatusValue(value) {
  return String(value ?? 'emision')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function matchesSelectedStatus(statusValue, selectedStates) {
  if (!selectedStates || selectedStates.length === 0) return true;

  const aliases = {
    emision: ['emision', 'en emision', 'en emisión'],
    finalizado: ['finalizado', 'finalizada', 'concluido', 'terminado'],
    pausado: ['pausado', 'pausada', 'en pausa', 'hiatus']
  };

  const normalizedCurrent = normalizeStatusValue(statusValue);

  return selectedStates.some(selected => {
    const normalizedSelected = normalizeStatusValue(selected);
    const allowedValues = aliases[normalizedSelected] || [normalizedSelected];
    return allowedValues.includes(normalizedCurrent) || normalizedCurrent.includes(normalizedSelected);
  });
}

// ==========================================
// RENDERIZADO VISUAL
// ==========================================
function getSkeletonCard() { return `<div class="skel-card"><div class="skeleton-box skel-cover"></div><div class="skel-info"><div class="skeleton-box skel-line"></div><div class="skeleton-box skel-line short"></div></div></div>`; }

function showLoading(isGrid) {
  hideAllAreas();
  const contentArea = document.getElementById('contentArea');
  if(!contentArea) return;
  contentArea.innerHTML = "";
  if(isGrid) {
    contentArea.className = "grid-container";
    contentArea.style.display = "grid";
    contentArea.innerHTML = getSkeletonCard().repeat(10);
  } else {
    contentArea.className = "";
    contentArea.style.display = "block";
    let skeletonHTML = `<div class="featured-slider skeleton-box" style="margin-bottom:50px;"></div>`;
    for(let i=0; i<3; i++) skeletonHTML += `<div class="genre-section"><div class="skeleton-box skel-title"></div><div class="carousel-wrapper"><div class="carousel-container" style="overflow: hidden;">${getSkeletonCard().repeat(5)}</div></div></div>`;
    contentArea.innerHTML = skeletonHTML;
  }
}

function startCoverSlideshow() {
  clearInterval(coversSlideshowInterval);
  coversSlideshowInterval = setInterval(() => {
    document.querySelectorAll('.manga-cover').forEach(container => {
      const slides = container.querySelectorAll('.cover-slide');
      if (slides.length > 1) {
        let activeIndex = 0;
        slides.forEach((slide, index) => { if (slide.classList.contains('active')) activeIndex = index; slide.classList.remove('active'); });
        slides[(activeIndex + 1) % slides.length].classList.add('active');
      }
    });
  }, 3000); 
}

function startHeroSlideshow() {
  clearInterval(heroSlideshowInterval);
  heroSlideshowInterval = setInterval(() => {
    // Buscar el contenedor del banner (en la vista de detalles)
    const heroBanner = document.querySelector('#detailsArea .hero-banner');
    if (!heroBanner) return;

    // Buscar todos los banners que no sean el de desenfoque por defecto
    const slides = heroBanner.querySelectorAll('.hero-bg-slide:not(.blur-fallback)');
    
    if (slides.length > 1) {
      let activeIndex = 0;
      slides.forEach((slide, index) => { 
        if (slide.classList.contains('active')) activeIndex = index; 
        slide.classList.remove('active'); 
      });
      // Activar el siguiente banner
      slides[(activeIndex + 1) % slides.length].classList.add('active');
    }
  }, 4000); // Cambiará cada 4 segundos
}

function startMainFeaturedSlider() { clearInterval(mainFeaturedInterval); mainFeaturedInterval = setInterval(()=>updateFeaturedSlide(currentFeaturedIndex + 1), 5000); }
function updateFeaturedSlide(index) {
  const slider = document.getElementById('featuredSlider');
  if(!slider) return;
  const slides = slider.querySelectorAll('.featured-slide');
  const dots = slider.querySelectorAll('.slider-dot');
  if (slides.length === 0) return;
  slides.forEach(s => s.classList.remove('active'));
  dots.forEach(d => d.classList.remove('active'));
  currentFeaturedIndex = (index >= slides.length) ? 0 : (index < 0 ? slides.length - 1 : index);
  slides[currentFeaturedIndex].classList.add('active');
  dots[currentFeaturedIndex].classList.add('active');
  startMainFeaturedSlider(); 
}
function nextFeaturedSlide() { updateFeaturedSlide(currentFeaturedIndex + 1); }
function prevFeaturedSlide() { updateFeaturedSlide(currentFeaturedIndex - 1); }
function goToFeaturedSlide(index) { updateFeaturedSlide(index); }

function createCardHTML(manga, isHistoryCard = false, historyChapter = '', showFormatBadge = true) {
  const isFav = savedFavs.includes(manga.id);
  const isSeen = savedSeen.includes(manga.id);
  const fmt = getFormatDetails(manga.format || manga.formato);

  let coverHtml = (manga.covers && manga.covers.length > 0) 
    ? manga.covers.map((c, i) => `<img src="${c}" class="cover-slide ${i === 0 ? 'active' : ''}" draggable="false" loading="lazy">`).join('')
    : `<div class="no-image"><span>📷</span><br><span>Sin Portada</span></div>`;
  
  let ribbonHtml = showFormatBadge ? `<div class="ribbon-wrapper"><span class="ribbon ${fmt.ribbon}">${fmt.label}</span></div>` : '';
  // LÓGICA AUTOMÁTICA DE ETIQUETAS
  let badgeHtml = '';
  if (!isHistoryCard) {
      // 1. Calculamos si han pasado menos de 4 días
      const isAutoUpdated = isRecentlyUpdated(manga.updated_at, 4);
      
      if (isAutoUpdated) {
          // Si es reciente, forzamos la etiqueta naranja de Actualizado
          badgeHtml = `<div class="manga-badge badge-actualizado">Actualizado</div>`;
      } else if (manga.badge) {
          // Si no es reciente pero tú le pusiste una etiqueta manual (Ej: "Hot", "Top"), la mostramos
          badgeHtml = `<div class="manga-badge ${manga.badge.toLowerCase() === 'nuevo' ? 'badge-nuevo' : 'badge-actualizado'}">${manga.badge}</div>`;
      }
  }
  let mainButton = isHistoryCard ? `<button class="btn-read btn-history" onclick="window.location.hash='manga/${manga.id}'">▶ ${historyChapter}</button>` : `<button class="btn-read" onclick="window.location.hash='manga/${manga.id}'">${fmt.icon} Leer</button>`;

  let safeGenre = String(manga.genre || 'Desconocido').toUpperCase();
  let statusDot = getStatusDot(manga.status);

  return `
    <div class="manga-card" onclick="handleCardTap(event, this)" data-id="${manga.id}">
      <div class="manga-cover">
        ${badgeHtml}${ribbonHtml}${coverHtml}
        <div class="manga-overlay">
          <span class="tags">${fmt.icon} ${safeGenre}</span>
          <h3 class="manga-title" title="${manga.title}">${manga.title}</h3>
          ${mainButton}
          <div class="action-row">
            <button class="btn-icon fav ${isFav ? 'active' : ''}" title="Favorito" onclick="toggleState('${manga.id}', 'fav', this)">${isFav ? '⭐' : '☆'}</button>
            <button class="btn-icon seen ${isSeen ? 'active' : ''}" title="Marcar Leído" onclick="toggleState('${manga.id}', 'seen', this)">${isSeen ? '✅' : '✔️'}</button>
          </div>
        </div>
      </div>
      <div class="manga-info-static">
        <div class="manga-title-static" title="${manga.title}">${manga.title}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
           ${statusDot}
           <div class="status-icons">${isFav ? '<span style="color:var(--star)">⭐</span>' : ''}${isSeen ? '<span style="color:var(--success)">✅</span>' : ''}</div>
        </div>
      </div>
    </div>
  `;
}

function renderHomeView(skipLoading = false, formatFilter = 'all') {
  clearTimeout(renderTimer);
  let currentScroll = window.scrollY; 
  if(!skipLoading) { showLoading(false); window.scrollTo({ top: 0, behavior: 'instant' }); }

  renderTimer = setTimeout(() => {
    const contentArea = document.getElementById('contentArea');
    if(!contentArea) return;
    contentArea.innerHTML = ""; contentArea.className = ""; contentArea.style.display = "block"; 

    if (mangaData.length === 0) {
      contentArea.innerHTML = `<div style="text-align:center; padding: 50px; color: var(--text-main); font-size: 1.2em;">Aún no hay obras en la base de datos.</div>`;
      return;
    }

    let filteredFeatured = formatFilter !== 'all' ? featuredMangas.filter(feat => { const m = mangaData.find(x => x.id === feat.id); return m && m.format === formatFilter; }) : featuredMangas;

    if (filteredFeatured.length > 0) {
      let slidesHtml = ''; let dotsHtml = '';
      filteredFeatured.forEach((feat, index) => {
          const manga = mangaData.find(m => m.id === feat.id);
          if (!manga) return;
          let safeGenre = String(manga.genre || 'Desconocido').toUpperCase();
          slidesHtml += `
            <div class="featured-slide ${index === 0 ? 'active' : ''}">
              <img src="${feat.image}" class="featured-img" draggable="false" onclick="if(!window.isSwipingFeatured) window.location.hash='manga/${manga.id}'">
              <div class="featured-overlay">
                <div class="featured-info">
                  <span class="featured-genre">${manga.format === 'novela' ? '📖 NOVELA' : '💭 MANGA'} | ${safeGenre}</span>
                  <h2 class="featured-title" onclick="if(!window.isSwipingFeatured) window.location.hash='manga/${manga.id}'">${manga.title}</h2>
                </div>
              </div>
            </div>`;
          dotsHtml += `<div class="slider-dot ${index === 0 ? 'active' : ''}" onclick="goToFeaturedSlide(${index})"></div>`;
      });
      contentArea.innerHTML += `<div class="featured-slider" id="featuredSlider">${slidesHtml}<button class="slider-arrow prev" onclick="prevFeaturedSlide()">❮</button><button class="slider-arrow next" onclick="nextFeaturedSlide()">❯</button><div class="slider-controls">${dotsHtml}</div></div>`;
      makeCarouselDraggable(document.getElementById('featuredSlider'));
      currentFeaturedIndex = 0; startMainFeaturedSlider();
    }

    let filteredHistory = formatFilter !== 'all' ? readingHistory.filter(item => { const m = mangaData.find(x => x.id === item.id); return m && m.format === formatFilter; }) : readingHistory;
    if (filteredHistory.length > 0) {
      let historyCardsHtml = '';
      filteredHistory.forEach(item => { const manga = mangaData.find(m => m.id === item.id); if (manga) historyCardsHtml += createCardHTML(manga, true, item.chapter, formatFilter === 'all'); });
      if(historyCardsHtml) {
        contentArea.innerHTML += `<div class="genre-section"><h2 class="genre-title history-title"><span>📚 Seguir Leyendo</span></h2><div class="carousel-wrapper"><button class="carousel-btn left" onclick="scrollCarousel('carousel-history', -400)">❮</button><div class="carousel-container" id="carousel-history">${historyCardsHtml}</div><button class="carousel-btn right" onclick="scrollCarousel('carousel-history', 400)">❯</button></div></div>`;
      }
    }
    
    let filteredTop10 = formatFilter !== 'all' ? top10Ids.filter(id => { const m = mangaData.find(x => x.id === id); return m && m.format === formatFilter; }) : top10Ids;
    let topCardsHtml = '';
    filteredTop10.forEach((id) => { const manga = mangaData.find(m => m.id === id); if (manga) topCardsHtml += createCardHTML(manga, false, '', formatFilter === 'all'); });
    if(topCardsHtml) {
      contentArea.innerHTML += `<div class="genre-section"><h2 class="genre-title top-title"><span>🔥 Top 10 Más Leídos</span></h2><div class="carousel-wrapper"><button class="carousel-btn left" onclick="scrollCarousel('carousel-top10', -400)">❮</button><div class="carousel-container" id="carousel-top10">${topCardsHtml}</div><button class="carousel-btn right" onclick="scrollCarousel('carousel-top10', 400)">❯</button></div></div>`;
    }

    let baseData = formatFilter !== 'all' ? mangaData.filter(m => m.format === formatFilter) : mangaData;
    definedGenres.forEach(genre => {
      const mangasInGenre = baseData.filter(m => Array.isArray(m.genres) && m.genres.includes(genre));
      if(mangasInGenre.length > 0) {
        let cardsHtml = mangasInGenre.map(m => createCardHTML(m, false, '', formatFilter === 'all')).join('');
        contentArea.innerHTML += `<div class="genre-section"><h2 class="genre-title" onclick="window.location.hash='genre/${encodeURIComponent(genre)}'"><span>${genre} <span class="genre-count">(${mangasInGenre.length})</span></span><span class="genre-explore">Explorar ›</span></h2><div class="carousel-wrapper"><button class="carousel-btn left" onclick="scrollCarousel('carousel-${genre}', -400)">❮</button><div class="carousel-container" id="carousel-${genre}">${cardsHtml}</div><button class="carousel-btn right" onclick="scrollCarousel('carousel-${genre}', 400)">❯</button></div></div>`;
      }
    });

    document.querySelectorAll('.carousel-container').forEach(makeCarouselDraggable);
    startCoverSlideshow(); 
    if (skipLoading) window.scrollTo({ top: currentScroll, behavior: 'instant' }); 
    else window.scrollTo({ top: scrollPositions[currentMode] || 0, behavior: 'instant' });
  }, skipLoading ? 0 : 200);
}

function renderGridView(mangaList, skipLoading = false, showFormatBadge = true) {
  clearTimeout(renderTimer);
  let currentScroll = window.scrollY;
  if(!skipLoading) { showLoading(true); window.scrollTo({ top: 0, behavior: 'instant' }); }

  renderTimer = setTimeout(() => {
    const contentArea = document.getElementById('contentArea');
    if(!contentArea) return;
    contentArea.innerHTML = ""; contentArea.className = "grid-container"; contentArea.style.display = "grid";

    if(mangaList.length === 0) {
      contentArea.style.display = "block";
      contentArea.innerHTML = `
        <div style="text-align:center; padding: 60px 20px; background: rgba(0,0,0,0.2); border-radius: 15px; border: 1px dashed var(--border-color); max-width: 500px; margin: 40px auto; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
          <div style="font-size: 4em; margin-bottom: 15px; opacity: 0.8;">📭</div>
          <h3 style="color: var(--accent-1); margin-bottom: 10px; font-size: 1.5em;">Aquí no hay nada todavía</h3>
          <p style="color: var(--text-main); font-size: 1em; margin-bottom: 25px;">Explora el catálogo o intenta usar otros filtros.</p>
          <button class="btn-read" style="width: auto; padding: 10px 30px; box-shadow: 0 4px 15px rgba(102, 252, 241, 0.3);" onclick="forceHome()">🏠 Volver al Inicio</button>
        </div>`;
    } else {
      contentArea.innerHTML = mangaList.map(m => createCardHTML(m, false, '', showFormatBadge)).join('');
    }
    
    startCoverSlideshow(); 
    if (skipLoading) { if (currentMode === 'search') window.scrollTo({ top: 0, behavior: 'instant' }); else window.scrollTo({ top: currentScroll, behavior: 'instant' }); }
    else window.scrollTo({ top: scrollPositions[currentMode] || 0, behavior: 'instant' });
  }, skipLoading ? 0 : 200);
}

// ==========================================
// SISTEMA DE COMENTARIOS Y PERFILES
// ==========================================
function getStyledName(baseName) {
  let activeEffect = localStorage.getItem('mangaJH_active_effect') || '';
  let finalName = baseName || (currentUser ? currentUser.usuario : '');
  
  if (activeEffect) {
      let item = shopItems.find(i => i.id === activeEffect && i.type === 'efecto');
      if (item) {
          if (item.id === 'fuego') finalName = `<span class="efecto-fuego">${finalName}</span>`;
          else if (item.id === 'neon') finalName = `<span class="efecto-neon">${finalName}</span>`;
          else if (item.id === 'vip') finalName = `👑 <span style="color: var(--star); font-weight: bold;">${finalName}</span>`;
          else {
              let styleStr = "font-weight: bold;";
              if (item.color) styleStr += ` color: ${item.color};`;
              if (item.shadow) styleStr += ` text-shadow: ${item.shadow};`;
              let iconStr = item.icon ? `${item.icon} ` : '';
              finalName = `${iconStr}<span style="${styleStr}">${finalName}</span>`;
          }
      }
  }
  return finalName;
}

async function updateMyCommentsVisuals(oldName, newName) {
    if(!oldName || !newName) return;
    let oldCombinations = [ oldName, `<span>${oldName}</span>` ];
    shopItems.forEach(item => {
        if (item.type === 'efecto') {
            if (item.id === 'fuego') oldCombinations.push(`<span class="efecto-fuego">${oldName}</span>`);
            else if (item.id === 'neon') oldCombinations.push(`<span class="efecto-neon">${oldName}</span>`);
            else if (item.id === 'vip') oldCombinations.push(`👑 <span style="color: var(--star); font-weight: bold;">${oldName}</span>`);
            else {
                let styleStr = "font-weight: bold;";
                if (item.color) styleStr += ` color: ${item.color};`;
                if (item.shadow) styleStr += ` text-shadow: ${item.shadow};`;
                let iconStr = item.icon ? `${item.icon} ` : '';
                oldCombinations.push(`${iconStr}<span style="${styleStr}">${oldName}</span>`);
            }
        }
    });

    const newStyledName = getStyledName(newName);
    await supabaseApp.from('comentarios').update({ nombre_usuario: newStyledName }).in('nombre_usuario', oldCombinations);
}

function renderCommentsHTML(mangaId) {
  fetchComments(mangaId);
  const placeholder = currentUser ? 'Escribe un comentario público...' : 'Debes iniciar sesión para comentar...';
  const btnText = currentUser ? 'Publicar' : 'Inicia Sesión';

  return `
    <div class="comments-section">
      <div class="comments-header">💬 Comentarios de la Comunidad</div>
      <div class="comment-input-area">
        <textarea id="commentInput" class="comment-textarea" placeholder="${placeholder}"></textarea>
        <button class="btn-submit-comment" onclick="addComment('${mangaId}')">${btnText}</button>
      </div>
      <div class="comments-list" id="commentsList">
        <div style="text-align:center; padding:20px; color:var(--text-main);">Cargando comentarios... ⏳</div>
      </div>
    </div>
  `;
}

async function fetchComments(mangaId) {
  const { data, error } = await supabaseApp.from('comentarios').select('*').eq('manga_id', mangaId).order('created_at', { ascending: true });
  const list = document.getElementById('commentsList');
  if (!list) return;

  let isTypingReply = false;
  const replyInputs = list.querySelectorAll('textarea'); 
  replyInputs.forEach(input => {
      if (input.value.length > 0 || document.activeElement === input) {
          isTypingReply = true;
      }
  });
  if (isTypingReply) return; 

  if (error) { list.innerHTML = `<div style="text-align:center; color:var(--danger);">Error al cargar comentarios.</div>`; return; }
  if (data.length === 0) { list.innerHTML = `<div class="no-comments">Aún no hay comentarios. ¡Sé el primero en opinar!</div>`; return; }

  const mainComments = data.filter(c => !c.parent_id);
  const replies = data.filter(c => c.parent_id);
  mainComments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  let html = '';
  mainComments.forEach(c => {
    const date = new Date(c.created_at).toLocaleDateString();
    let rawName = c.nombre_usuario;
    let match = rawName.match(/<span[^>]*>(.*?)<\/span>/);
    if (match) rawName = match[1].trim(); else rawName = rawName.replace(/<[^>]*>?/gm, '').replace('👑', '').trim();
    
    const likesArray = c.likes || [];
    const likesCount = likesArray.length;
    const userLiked = currentUser && likesArray.includes(currentUser.usuario);
    const heartIcon = userLiked ? '❤️' : '🤍';
    const likeColor = userLiked ? 'var(--danger)' : '#FFF';
    
    const isMyComment = currentUser && currentUser.usuario === rawName;

    // AQUÍ PUSIMOS EL ID DEL COMENTARIO PRINCIPAL
    html += `
      <div class="comment-box" id="manga-comment-${c.id}" style="margin-bottom: 15px; transition: box-shadow 0.5s;">
        <div class="comment-meta" style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <span class="comment-user" style="cursor: pointer;" title="Ver perfil" onclick="window.location.hash='user/${rawName}'">👤 ${c.nombre_usuario}</span>
            <span class="comment-date">${date}</span>
          </div>
          
          <div class="menu-container" style="position: relative;">
            <button style="background:none; border:none; color:var(--text-main); font-size:1.2em; cursor:pointer; padding:0 5px;" onclick="toggleCommentMenu('menu-${c.id}')">⋮</button>
            <div id="menu-${c.id}" class="comment-dropdown" style="display:none; position:absolute; right:0; top:100%; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; z-index:100; min-width:130px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); overflow:hidden; text-align:left;">
              ${ isMyComment 
                ? `<div style="padding:10px; color:var(--danger); cursor:pointer; font-size:0.9em; transition: 0.2s;" onmouseover="this.style.background='rgba(255,0,0,0.1)'" onmouseout="this.style.background='transparent'" onclick="deleteComment('${c.id}', '${mangaId}')">🗑️ Eliminar</div>`
                : `<div style="padding:10px; color:var(--text-main); cursor:pointer; font-size:0.9em; transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'" onclick="reportComment('${c.id}')">🚩 Reportar</div>`
              }
            </div>
          </div>
        </div>
        
        <div class="comment-text">${c.texto}</div>
        <div style="margin-top: 10px; display: flex; justify-content: flex-end; gap: 10px; align-items: center;">
           <button id="like-btn-${c.id}" class="btn-read" style="padding: 5px 12px; font-size: 0.85em; width: auto; background: rgba(255,255,255,0.05); color: ${likeColor}; border: 1px solid rgba(255,255,255,0.1);" onclick="toggleCommentLike('${c.id}', '${mangaId}')">${heartIcon} ${likesCount > 0 ? likesCount : ''}</button>
           <button class="btn-read" style="padding: 5px 12px; font-size: 0.8em; width: auto; background: rgba(255,255,255,0.1); color: #FFF; border: none;" onclick="toggleReplyBox('${c.id}')">↩ Responder</button>
        </div>
        <div id="reply-box-${c.id}" style="display: none; margin-top: 15px; padding-left: 20px; border-left: 2px solid var(--accent-2);">
           <textarea id="reply-input-${c.id}" class="comment-textarea" style="min-height: 60px; margin-bottom: 10px; font-size: 0.9em;" placeholder="Escribe tu respuesta..."></textarea>
           <div style="text-align: right;"><button class="btn-submit-comment" style="padding: 6px 15px; font-size: 0.85em;" onclick="addReply('${mangaId}', '${c.id}')">Enviar respuesta</button></div>
        </div>
        <div id="replies-for-${c.id}" style="margin-top: 15px; padding-left: 20px; border-left: 2px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 10px;">
    `;
    
    const childReplies = replies.filter(r => r.parent_id == c.id);
    childReplies.forEach(r => {
       const rDate = new Date(r.created_at).toLocaleDateString();
       let rawReplyName = r.nombre_usuario;
       let rMatch = rawReplyName.match(/<span[^>]*>(.*?)<\/span>/);
       if (rMatch) rawReplyName = rMatch[1].trim(); else rawReplyName = rawReplyName.replace(/<[^>]*>?/gm, '').replace('👑', '').trim();
       
       const rLikesArray = r.likes || [];
       const rLikesCount = rLikesArray.length;
       const rUserLiked = currentUser && rLikesArray.includes(currentUser.usuario);
       const rHeartIcon = rUserLiked ? '❤️' : '🤍';
       const rLikeColor = rUserLiked ? 'var(--danger)' : '#FFF';
       
       const isMyReply = currentUser && currentUser.usuario === rawReplyName;

       // AQUÍ PUSIMOS EL ID DE LA RESPUESTA
       html += `
          <div id="manga-comment-${r.id}" style="background: var(--bg-main); padding: 12px; border-radius: 8px; transition: box-shadow 0.5s;">
            <div class="comment-meta" style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom: none; margin-bottom: 4px; padding-bottom: 0;">
              <div>
                <span class="comment-user" style="font-size: 0.9em; cursor: pointer;" onclick="window.location.hash='user/${rawReplyName}'">👤 ${r.nombre_usuario}</span>
                <span class="comment-date" style="font-size: 0.7em;">${rDate}</span>
              </div>
              
              <div class="menu-container" style="position: relative;">
                <button style="background:none; border:none; color:var(--text-main); font-size:1.2em; cursor:pointer; padding:0 5px;" onclick="toggleCommentMenu('menu-${r.id}')">⋮</button>
                <div id="menu-${r.id}" class="comment-dropdown" style="display:none; position:absolute; right:0; top:100%; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; z-index:100; min-width:130px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); overflow:hidden; text-align:left;">
                  ${ isMyReply 
                    ? `<div style="padding:10px; color:var(--danger); cursor:pointer; font-size:0.9em; transition: 0.2s;" onmouseover="this.style.background='rgba(255,0,0,0.1)'" onmouseout="this.style.background='transparent'" onclick="deleteComment('${r.id}', '${mangaId}')">🗑️ Eliminar</div>`
                    : `<div style="padding:10px; color:var(--text-main); cursor:pointer; font-size:0.9em; transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'" onclick="reportComment('${r.id}')">🚩 Reportar</div>`
                  }
                </div>
              </div>
            </div>
            <div class="comment-text" style="font-size: 0.95em; margin-bottom: 8px;">${r.texto}</div>
            
            <div style="text-align: right;">
                <button id="like-btn-${r.id}" class="btn-read" style="padding: 4px 10px; font-size: 0.75em; width: auto; background: rgba(255,255,255,0.05); color: ${rLikeColor}; border: 1px solid rgba(255,255,255,0.1);" onclick="toggleCommentLike('${r.id}', '${mangaId}')">${rHeartIcon} ${rLikesCount > 0 ? rLikesCount : ''}</button>
            </div>
          </div>
       `;
    });
    html += `</div></div>`; 
  });
  list.innerHTML = html;

  // ESTA ES LA LÍNEA QUE LLAMA AL RADAR DE BÚSQUEDA DEL SCROLL
  if(typeof executePendingScroll === 'function') executePendingScroll();
}

async function toggleCommentLike(commentId, mangaId) {
  if (!currentUser) { openAuthModal(); return; }  

  const btn = document.getElementById(`like-btn-${commentId}`);
  if (!btn) return;

  btn.disabled = true; 
  const teniaLike = btn.innerText.includes('❤️');
  let countText = btn.innerText.replace(/❤️|🤍/g, '').trim();
  let currentCount = countText ? parseInt(countText) : 0;

  if (teniaLike) {
      currentCount = Math.max(0, currentCount - 1);
      btn.innerHTML = `🤍 ${currentCount > 0 ? currentCount : ''}`;
      btn.style.color = '#FFF';
  } else {
      currentCount += 1;
      btn.innerHTML = `❤️ ${currentCount}`;
      btn.style.color = 'var(--danger)';
  }

  const { data: comment, error: fetchError } = await supabaseApp
    .from('comentarios')
    .select('likes, nombre_usuario') 
    .eq('id', commentId)
    .single();

  if (!fetchError && comment) {
      let likesArray = comment.likes || [];
      const userIndex = likesArray.indexOf(currentUser.usuario);

      if (userIndex > -1 && teniaLike) {
          likesArray.splice(userIndex, 1);
      } else if (userIndex === -1 && !teniaLike) {
          likesArray.push(currentUser.usuario);
          let destino = comment.nombre_usuario.replace(/<[^>]*>?/gm, '').replace('👑', '').trim();
          
          // AQUÍ VA LA RUTA COMPLETA PARA EL SCROLL
          sendNotification(currentUser.usuario, destino, 'like', 'le dio ❤️ a tu comentario en una obra.', `manga/${mangaId}|manga-comment-${commentId}`);
      }
      await supabaseApp.from('comentarios').update({ likes: likesArray }).eq('id', commentId);
  }
  btn.disabled = false;
}

function toggleReplyBox(commentId) {
  if (!currentUser) { openAuthModal(); return; }
  const box = document.getElementById(`reply-box-${commentId}`);
  if(box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

async function addComment(mangaId) {
  if (!currentUser) { openAuthModal(); return; }
  const textInput = document.getElementById('commentInput');
  if(!textInput) return;
  const text = textInput.value.trim();
  if(!text) return;

  const btn = document.querySelector('.btn-submit-comment'); 
  if(btn) { btn.innerText = 'Enviando...'; btn.disabled = true; }
  const { error } = await supabaseApp.from('comentarios').insert([{ manga_id: mangaId, texto: text, nombre_usuario: getStyledName() }]);
  if(btn) { btn.innerText = 'Publicar'; btn.disabled = false; }

  if (error) { showCustomAlert("Hubo un error al publicar tu comentario."); } 
  else {
    textInput.value = ''; fetchComments(mangaId); 
    
    currentUser.monedas += 5; 
    currentUser.comentarios_totales = (currentUser.comentarios_totales || 0) + 1;
    
    localStorage.setItem('mangaJH_user', JSON.stringify(currentUser));
    updateHeaderUI(); 
    supabaseApp.from('lectores').update({ 
        monedas: currentUser.monedas, 
        comentarios_totales: currentUser.comentarios_totales 
    }).eq('usuario', currentUser.usuario).then();
  }
}

async function addReply(mangaId, parentId) {
  if (!currentUser) { openAuthModal(); return; }
  const input = document.getElementById(`reply-input-${parentId}`);
  if(!input) return;
  const text = input.value.trim();
  if (!text) return;

  const btn = event.target; const originalText = btn.innerText; btn.innerText = 'Enviando...'; btn.disabled = true;
  const { error } = await supabaseApp.from('comentarios').insert([{ manga_id: mangaId, texto: text, nombre_usuario: getStyledName(), parent_id: parentId }]);
  
  const { data: parentCom } = await supabaseApp.from('comentarios').select('nombre_usuario').eq('id', parentId).single();
  if (parentCom) {
      let destino = parentCom.nombre_usuario.replace(/<[^>]*>?/gm, '').replace('👑', '').trim();
      // AQUÍ VA LA RUTA COMPLETA AL COMENTARIO PADRE PARA RESPONDERLE
      sendNotification(currentUser.usuario, destino, 'respuesta', 'respondió a tu comentario en una obra.', `manga/${mangaId}|manga-comment-${parentId}`);
  }
  btn.innerText = originalText; btn.disabled = false;

  if (error) { showCustomAlert("Hubo un error al publicar tu respuesta."); } 
  else {
    input.value = ''; fetchComments(mangaId); 
    
    currentUser.monedas += 5; 
    currentUser.comentarios_totales = (currentUser.comentarios_totales || 0) + 1; 
    
    localStorage.setItem('mangaJH_user', JSON.stringify(currentUser));
    updateHeaderUI(); 
    supabaseApp.from('lectores').update({ 
        monedas: currentUser.monedas, 
        comentarios_totales: currentUser.comentarios_totales 
    }).eq('usuario', currentUser.usuario).then();
  }
}

// ==========================================
// VISTAS DE DETALLES Y PERFILES
// ==========================================
function renderMangaDetails(mangaId) {
  const manga = mangaData.find(m => m.id === mangaId);
  if(!manga) { window.location.hash = 'home'; return; }

  const detailsArea = document.getElementById('detailsArea');
  if(!detailsArea) return;
  
  let bgContent = (manga.banners && manga.banners.length > 0) 
      ? manga.banners.map((b, index) => `<img src="${b}" class="hero-bg-slide ${index === 0 ? 'active' : ''}" draggable="false">`).join('') 
      : ((manga.covers && manga.covers.length > 0) ? `<img src="${manga.covers[0]}" class="hero-bg-slide blur-fallback active" draggable="false">` : `<div class="hero-gradient-bg"></div>`);

  let chaptersHtml = '';
  if (manga.chapters && manga.chapters.length > 0) {
    manga.chapters.forEach((cap) => {
      if(cap.link) chaptersHtml += `<div class="chapter-box" onclick="openViewer('${cap.link}', '${manga.id}', '${cap.title}')">${cap.title}</div>`;
      else chaptersHtml += `<div class="chapter-box" style="opacity:0.7;" onclick="openViewer('', '${manga.id}', '${cap.title}')">${cap.title}</div>`;
    });
  } else { chaptersHtml = `<p style="color:var(--text-main);">Próximamente disponibles.</p>`; }

  const fmt = getFormatDetails(manga.format || manga.formato);
  let safeGenre = String(manga.genre || 'Desconocido').toUpperCase();
  let statusDot = getStatusDot(manga.status);

  detailsArea.innerHTML = `
    <div class="hero-banner">
      <button class="btn-back-details" onclick="goBack()" style="top: 15px; left: 15px; position: absolute; z-index: 50;">‹ Volver</button>
      ${bgContent}
      <div class="hero-overlay">
        <div class="details-title-container">
          <span class="hero-genre">${fmt.display} | ${safeGenre}</span>
          <h2 class="details-title">${manga.title} ${statusDot}</h2>
          <div id="ratingBox" class="rating-container">
             <div style="color:var(--text-main); font-size:0.9em;">Cargando estrellas... ⏳</div>
          </div>
        </div>
      </div>
    </div>
    <div class="manga-synopsis-container" style="margin-top: 25px;">
      <div class="manga-synopsis-title">📖 Sinopsis General</div>
      <div class="manga-synopsis-text">${manga.synopsis || "Sinopsis no disponible."}</div>
    </div>
    <div class="section-header-row">
      <h3 class="chapters-section-title">${fmt.chapters}</h3>
      <button class="btn-download-modal" onclick="openDownloadModal('${manga.id}')">⬇️ Descargar</button>
    </div>
    <div class="chapters-grid">${chaptersHtml}</div>
    ${renderCommentsHTML(manga.id)}
  `;
  detailsArea.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'instant' });

  renderRatingUI(mangaId);
  commentsInterval = setInterval(() => fetchComments(mangaId), 5000);
  startHeroSlideshow();
}

function generateSocialHtml(userData) {
    let html = '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 25px; justify-content: flex-start;">';
    const btnStyle = "display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 12px; font-size: 0.8em; font-weight: bold; text-decoration: none; color: #FFF; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); transition: 0.2s;";
    
    // Función inteligente que detecta si es enlace o usuario
    const makeLink = (input, baseDomain, prefix = '') => {
        let cleanInput = input.trim();
        if (cleanInput.startsWith('http')) return cleanInput; // Si ya es un enlace, lo usa tal cual
        return `https://${baseDomain}/${prefix}${cleanInput.replace('@', '')}`; // Si es usuario, arma el enlace
    };

    if (userData.social_tiktok) {
        let link = makeLink(userData.social_tiktok, 'www.tiktok.com', '@');
        html += `<a href="${link}" target="_blank" style="${btnStyle}" onmouseover="this.style.background='#000'; this.style.borderColor='#00f2fe'" onmouseout="this.style.background='rgba(255,255,255,0.1)'; this.style.borderColor='rgba(255,255,255,0.2)'"><i class="fab fa-tiktok" style="font-size: 1.1em;"></i> TikTok</a>`;
    }
    
    if (userData.social_instagram) {
        let link = makeLink(userData.social_instagram, 'www.instagram.com');
        html += `<a href="${link}" target="_blank" style="${btnStyle}" onmouseover="this.style.background='#C13584'" onmouseout="this.style.background='rgba(255,255,255,0.1)'"><i class="fab fa-instagram" style="font-size: 1.1em;"></i> Instagram</a>`;
    }
    
    if (userData.social_facebook) {
        let link = makeLink(userData.social_facebook, 'www.facebook.com');
        html += `<a href="${link}" target="_blank" style="${btnStyle}" onmouseover="this.style.background='#1877F2'" onmouseout="this.style.background='rgba(255,255,255,0.1)'"><i class="fab fa-facebook-f" style="font-size: 1.1em;"></i> Facebook</a>`;
    }
    
    if (userData.social_whatsapp) {
        let waInput = userData.social_whatsapp.trim();
        let link = waInput.startsWith('http') ? waInput : `https://wa.me/${waInput}`;
        html += `<a href="${link}" target="_blank" style="${btnStyle}" onmouseover="this.style.background='#25D366'" onmouseout="this.style.background='rgba(255,255,255,0.1)'"><i class="fab fa-whatsapp" style="font-size: 1.1em;"></i> WhatsApp</a>`;
    }
    
    if (userData.social_discord) {
        html += `<a href="${userData.social_discord}" target="_blank" style="${btnStyle}" onmouseover="this.style.background='#5865F2'" onmouseout="this.style.background='rgba(255,255,255,0.1)'"><i class="fab fa-discord" style="font-size: 1.1em;"></i> Discord</a>`;
    }
    
    if (userData.social_youtube) {
        let link = makeLink(userData.social_youtube, 'www.youtube.com', '@');
        html += `<a href="${link}" target="_blank" style="${btnStyle}" onmouseover="this.style.background='#FF0000'" onmouseout="this.style.background='rgba(255,255,255,0.1)'"><i class="fab fa-youtube" style="font-size: 1.1em;"></i> YouTube</a>`;
    }
    
    if (userData.social_custom_url && userData.social_custom_label) {
        html += `<a href="${userData.social_custom_url}" target="_blank" style="${btnStyle}" onmouseover="this.style.background='var(--accent-2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'"><i class="fas fa-link" style="font-size: 1.1em;"></i> ${userData.social_custom_label}</a>`;
    }
    
    html += '</div>';
    
    if (html.includes('<a href')) return html;
    return '';
}

async function renderProfileView() {
  if(!currentUser) { openAuthModal(); window.location.hash = 'home'; return; }
  
  const profileArea = document.getElementById('profileArea');
  if(profileArea) {
      profileArea.innerHTML = '<div style="text-align:center; padding: 50px; color: var(--accent-1); font-size: 1.2em;">Sincronizando perfil... ⏳</div>';
      profileArea.style.display = 'block';
  }

  // 🔄 Descargamos tus datos en vivo desde la nube para actualizar seguidores y monedas
  const { data: latestData, error } = await supabaseApp.from('lectores').select('*').eq('usuario', currentUser.usuario).single();
  if (latestData && !error) {
      currentUser = latestData;
      if (!currentUser.inventario) currentUser.inventario = []; if (!currentUser.capitulos_leidos) currentUser.capitulos_leidos = []; if (!currentUser.siguiendo) currentUser.siguiendo = []; if (!currentUser.seguidores) currentUser.seguidores = []; if (!currentUser.marcapaginas) currentUser.marcapaginas = {};
      localStorage.setItem('mangaJH_user', JSON.stringify(currentUser)); updateHeaderUI(); 
  }

  let activeEffectId = localStorage.getItem('mangaJH_active_effect') || '';
  let activeBannerId = localStorage.getItem('mangaJH_active_banner') || '';
  let activeMarcoId = localStorage.getItem('mangaJH_active_marco') || ''; 
  let activeMarcoBannerId = localStorage.getItem('mangaJH_active_marco_banner') || '';
  let activeFondoId = localStorage.getItem('mangaJH_active_fondo') || '';

  let finalName = getStyledName(currentUser.usuario);
  
  let bannerUrl = currentUser.banner_url || '';
  if (activeBannerId) { let bItem = shopItems.find(i => i.id === activeBannerId); if (bItem) bannerUrl = bItem.url; }
  let bannerStyle = bannerUrl ? `background: url('${bannerUrl}') center/cover no-repeat;` : `background: linear-gradient(45deg, #1F2833, #45A29E);`;

  let bannerBorder = 'border-bottom: 1px solid var(--border-color);';
  let mbItem = shopItems.find(i => i.id === activeMarcoBannerId);
  if(mbItem) {
      let bColor = mbItem.color || 'var(--accent-1)';
      let bShadow = mbItem.shadow ? mbItem.shadow : `0 0 20px ${bColor}80`; 
      bannerBorder = `border: 4px solid ${bColor}; box-shadow: ${bShadow};`;
  }

  let cardBorderColor = 'var(--accent-1)'; 
  let avatarBoxShadow = '0 4px 15px rgba(0,0,0,0.6)'; 
  let marcoItem = shopItems.find(i => i.id === activeMarcoId); 
  if(marcoItem) {
      if(marcoItem.color) cardBorderColor = marcoItem.color; 
      if(marcoItem.shadow) avatarBoxShadow = marcoItem.shadow;
      else if(marcoItem.color) avatarBoxShadow = `0 0 20px ${marcoItem.color}80`; 
  }

  let avatarBg = `var(--bg-card)`; let avatarContent = '👤';
  if (currentUser.avatar_url && currentUser.avatar_url.trim() !== '') { avatarBg = `url('${currentUser.avatar_url}') center/cover no-repeat`; avatarContent = ''; }
  
  let fondoItem = shopItems.find(i => i.id === activeFondoId);
  if (fondoItem && fondoItem.url) { avatarBg = `url('${fondoItem.url}') center/cover no-repeat`; avatarContent = ''; }

  let edadDisplay = currentUser.edad ? `${currentUser.edad} años` : 'Edad oculta';
  let descDisplay = currentUser.descripcion || '¡Hola! Me encanta leer en MangaJH.';
  let capLeidos = currentUser.capitulos_leidos ? currentUser.capitulos_leidos.length : 0;
  let nivelUsuario = Math.floor(capLeidos / 3) + 1; 
  let horasLeidas = (capLeidos * 25 / 60).toFixed(1); 
  let totalComentarios = currentUser.comentarios_totales || 0;

  let myFollowers = currentUser.seguidores || [];
  let myFollowing = currentUser.siguiendo || [];
  let myFriends = myFollowers.filter(u => myFollowing.includes(u));
  let myFriendsCount = myFriends.length;

  if(!profileArea) return;
  profileArea.innerHTML = `
    <div class="hero-banner" style="height: clamp(150px, 35vw, 380px); display: flex; align-items: flex-start; justify-content: center; ${bannerStyle} position: relative; border-radius: 15px; ${bannerBorder}">
      <button class="btn-back-details" onclick="goBack()" style="top: 15px; left: 15px; position: absolute; z-index: 50;">‹ Volver</button>
      <div style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.2); border-radius: 15px;"></div>
    </div>
    
    <div style="position: relative; z-index: 20; padding: 0 clamp(10px, 3vw, 20px); margin-top: clamp(-90px, -15vw, -60px);">
      
      <!-- CONTENEDOR PRINCIPAL DE 2 COLUMNAS -->
      <div style="display: flex; flex-wrap: wrap; gap: 30px; width: 100%; align-items: flex-start;">
          
          <!-- LADO IZQUIERDO: AVATAR, INFO, REDES Y ESTADÍSTICAS -->
          <div class="profile-left-col" style="flex: 0 1 450px; width: 100%; display: flex; flex-direction: column; gap: 20px;">
              
              <!-- AVATAR Y NOMBRE -->
              <div style="display: flex; align-items: flex-end; flex-wrap: wrap; gap: 15px; width: 100%;">
                  <div style="width: clamp(100px, 20vw, 180px); height: clamp(100px, 20vw, 180px); border-radius: 50%; background: ${avatarBg}; box-shadow: ${avatarBoxShadow}; border: 3px solid ${cardBorderColor}; display: flex; align-items: center; justify-content: center; font-size: clamp(3em, 8vw, 5em); color: rgba(255,255,255,0.8); flex-shrink: 0;">${avatarContent}</div>
                  
                  <div class="perfil-textos" style="padding-bottom: 10px;"> 
                    <h3 class="perfil-nombre" style="font-size: clamp(1.5em, 6vw, 2.2em); margin: 0; line-height: 1.2; color: #FFF; text-shadow: 0 2px 5px rgba(0,0,0,0.8);">${finalName}</h3>
                    <p class="perfil-edad" style="color: var(--accent-2); font-size: 1.1em; margin: 5px 0 0 0; font-weight: bold; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">🎂 ${edadDisplay}</p>
                  </div>

                  <!-- BOTÓN DE TUERCA (EDITAR PERFIL) -->
                  <!-- BOTÓN DE TUERCA (EDITAR PERFIL) -->
                  <button class="btn-tuerca" onclick="openEditProfileModal()" onmouseover="this.style.transform='rotate(90deg) scale(1.1)'; this.style.filter='drop-shadow(0 0 8px var(--accent-1))'" onmouseout="this.style.transform='rotate(0deg) scale(1)'; this.style.filter='none'" title="Editar Perfil">⚙️</button>
              </div>
              
              <!-- SEGUIDORES ESTILO TIKTOK -->
              <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                  <div onclick="openUserListModal('👥 Mis Seguidores', '${encodeURIComponent(JSON.stringify(myFollowers))}')" style="cursor: pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
                      <span style="font-weight: bold; font-size: 1.15em; color: #FFF;">${myFollowers.length}</span>
                      <span style="font-size: 0.9em; color: var(--text-main); margin-left: 4px;">Seguidores</span>
                  </div>
                  <div onclick="openUserListModal('🤝 Mis Amigos', '${encodeURIComponent(JSON.stringify(myFriends))}')" style="cursor: pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
                      <span style="font-weight: bold; font-size: 1.15em; color: #FFF;">${myFriendsCount}</span>
                      <span style="font-size: 0.9em; color: var(--text-main); margin-left: 4px;">Amigos</span>
                  </div>
                  <div onclick="openUserListModal('👣 Siguiendo', '${encodeURIComponent(JSON.stringify(myFollowing))}')" style="cursor: pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
                      <span style="font-weight: bold; font-size: 1.15em; color: #FFF;">${myFollowing.length}</span>
                      <span style="font-size: 0.9em; color: var(--text-main); margin-left: 4px;">Siguiendo</span>
                  </div>
              </div>
              
              <p style="color: var(--text-main); font-size: 1.1em; max-width: 600px; margin: 0; font-style: italic; line-height: 1.5;">"${descDisplay}"</p>
              
              ${generateSocialHtml(currentUser)}
              
              <!-- CAJAS DE ESTADÍSTICAS DE LECTURA -->
              <div style="display: flex; gap: 10px; width: 100%; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 90px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 12px; padding: 15px 5px; text-align: center;">
                  <div style="font-size: 1.5em; margin-bottom: 5px;">💬</div>
                  <div style="font-size: 1.5em; font-weight: bold; color: #FFF;">${totalComentarios}</div>
                  <div style="font-size: 0.7em; color: var(--accent-1); text-transform: uppercase; font-weight: bold; margin-top: 5px;">Comentarios</div>
                </div>
                <div style="flex: 1; min-width: 90px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 12px; padding: 15px 5px; text-align: center;">
                  <div style="font-size: 1.5em; margin-bottom: 5px;">⏱️</div>
                  <div style="font-size: 1.5em; font-weight: bold; color: #FFF;">${horasLeidas}h</div>
                  <div style="font-size: 0.7em; color: var(--success); text-transform: uppercase; font-weight: bold; margin-top: 5px;">Horas Leídas</div>
                </div>
                <div style="flex: 1; min-width: 90px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 12px; padding: 15px 5px; text-align: center;">
                  <div style="font-size: 1.5em; margin-bottom: 5px;">🏆</div>
                  <div style="font-size: 1.5em; font-weight: bold; color: #FFF;">Nv. ${nivelUsuario}</div>
                  <div style="font-size: 0.7em; color: var(--star); text-transform: uppercase; font-weight: bold; margin-top: 5px;">Rango</div>
                </div>
              </div>

              <p style="color: var(--star); font-size: 1.3em; font-weight: bold; margin: 0;">💰 ${currentUser.monedas} Monedas</p>
              
              <!-- BOTONES DE INVENTARIO Y SALIR -->
              <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button class="btn-read" onclick="window.location.hash='inventory'" style="background: var(--accent-1); color: #000; width: auto; padding: 10px 20px;">🎒 Mi Inventario</button>
                <button class="btn-read" onclick="logout()" style="background: var(--danger); color: white; width: auto; padding: 10px 20px;">🚪 Salir</button>
              </div>
          </div>

          <!-- LADO DERECHO: APORTES Y POSTS -->
          <div class="profile-right-col" style="flex: 1 1 400px; min-width: 300px; display: flex; flex-direction: column; gap: 20px;">
              
             <!-- ESPACIADOR INVISIBLE PARA EMPUJAR HACIA ABAJO (SOLO EN PC) -->
              <div style="height: 60px;" class="desktop-spacer"></div>

              <div id="wrapper-userProfileAportes" style="display: none; background: rgba(0,0,0,0.15); padding: 20px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.05);">
                  <h3 style="color: var(--accent-1); margin-bottom: 15px; border-bottom: 2px solid var(--border-color); padding-bottom: 10px; font-size: 1.3em;">🎨 Obras Aportadas</h3>
                  <div id="userProfileAportes"></div>
              </div>

              <div style="background: rgba(0,0,0,0.15); padding: 20px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.05);">
                  <h3 style="color: var(--accent-1); margin-bottom: 15px; border-bottom: 2px solid var(--border-color); padding-bottom: 10px; font-size: 1.3em;">📝 Post ForoMJH</h3>
                  <div id="userProfilePosts">
                      <div style="text-align:center; color:var(--text-main);">Buscando publicaciones... ⏳</div>
                  </div>
              </div>
              
          </div>
      </div>
    </div>
  `;
  profileArea.style.display = 'block';
  
  loadUserForoPosts(currentUser.usuario, 'userProfilePosts', true);
  loadUserAportes(currentUser.usuario, 'userProfileAportes'); // <-- NUEVA LLAMADA
}

function openDownloadModal(mangaId) {
  const manga = mangaData.find(m => m.id === mangaId);
  if (!manga) return;
  const dlModalTitle = document.getElementById('dlModalTitle'); if(dlModalTitle) dlModalTitle.innerText = `📥 Descargas: ${manga.title}`;
  const dlWarningView = document.getElementById('dlWarningView'); if(dlWarningView) dlWarningView.style.display = 'block';
  const dlModalList = document.getElementById('dlModalList'); if(dlModalList) dlModalList.style.display = 'none';

  if(dlModalList) {
      dlModalList.innerHTML = '';
      let hasDownloads = false;
      if (manga.chapters && manga.chapters.length > 0) {
          manga.chapters.forEach(cap => {
            if (cap.downloadLink) {
                hasDownloads = true;
                dlModalList.innerHTML += `<div class="dl-item"><span class="dl-item-title">${cap.title}</span><a href="${cap.downloadLink}" download target="_top" class="dl-btn">Descargar ⬇️</a></div>`;
            }
          });
      }
      if (!hasDownloads) dlModalList.innerHTML = `<div class="dl-empty" style="text-align:center; padding: 20px; color: var(--text-main);">Aún no hay enlaces de descarga disponibles.</div>`;
  }
  const downloadModal = document.getElementById('downloadModal'); if(downloadModal) downloadModal.style.display = 'flex';
}

function acceptDownloadWarning() { 
  const dlWarningView = document.getElementById('dlWarningView'); if(dlWarningView) dlWarningView.style.display = 'none'; 
  const dlModalList = document.getElementById('dlModalList'); if(dlModalList) dlModalList.style.display = 'flex'; 
}
function closeDownloadModal() { const downloadModal = document.getElementById('downloadModal'); if(downloadModal) downloadModal.style.display = 'none'; }
function showCustomAlert(message) { 
  const customAlertText = document.getElementById('customAlertText'); if(customAlertText) customAlertText.innerText = message; 
  const customAlertModal = document.getElementById('customAlertModal'); if(customAlertModal) customAlertModal.style.display = 'flex'; 
}
function closeCustomAlert() { const customAlertModal = document.getElementById('customAlertModal'); if(customAlertModal) customAlertModal.style.display = 'none'; }

function openViewer(url, mangaId, chapterTitle) {
  if(!url) { const manga = mangaData.find(m => m.id === mangaId); showCustomAlert(`¡Aún no hay un PDF subido para este ${(manga && manga.format === 'novela') ? 'Volumen' : 'Tomo'}!`); return; }
  
  if (mangaId && chapterTitle) {
    readingHistory = readingHistory.filter(h => h.id !== mangaId); readingHistory.unshift({ id: mangaId, chapter: chapterTitle });
    if(readingHistory.length > 10) readingHistory.pop(); localStorage.setItem('mangaJH_v2_history', JSON.stringify(readingHistory));

    if (currentUser) {
      if (!currentUser.capitulos_leidos) currentUser.capitulos_leidos = [];
      const chapterKey = `${mangaId}_${chapterTitle}`;
      if (!currentUser.capitulos_leidos.includes(chapterKey)) {
        currentUser.capitulos_leidos.push(chapterKey); currentUser.monedas += 10;
        const manga = mangaData.find(m => m.id === mangaId);
        let msg = `¡Ganaste 10 💰 por leer!`;
        
        if (manga && manga.chapters) {
          const validChapters = manga.chapters.filter(c => c.link && c.link.trim() !== '').length;
          const totalChapters = validChapters > 0 ? validChapters : manga.chapters.length;
          const readCount = currentUser.capitulos_leidos.filter(k => k.startsWith(`${mangaId}_`)).length;
          if (readCount === totalChapters) { currentUser.monedas += 150; msg = `¡Felicidades! Terminaste este título. ¡Bono de 150 💰!`; if (!savedSeen.includes(mangaId)) { savedSeen.push(mangaId); localStorage.setItem('mangaJH_v2_seen', JSON.stringify(savedSeen)); } }
        }
        localStorage.setItem('mangaJH_user', JSON.stringify(currentUser)); updateHeaderUI();
        setTimeout(() => showCustomAlert(msg), 1500); 
      }
    }
    syncCloudData();
  }

  let embedUrl = url;
  
  // Lógica de detección de servidor
  if(url.includes("/folders/")) { 
      const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/); 
      if(match && match[1]) embedUrl = `https://drive.google.com/embeddedfolderview?id=${match[1]}#grid`; 
  } 
  else if(url.includes("/file/d/")) { 
      const match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/); 
      if(match && match[1]) embedUrl = `https://drive.google.com/file/d/${match[1]}/preview`; 
  }
  // EL TRUCO DEFINITIVO PARA CLOUDFLARE R2 Y PDFS DIRECTOS
  else if(url.includes(".pdf") || url.includes("r2.dev")) {
      // Usamos el motor de Google Docs en modo "embedded" para obligar al navegador 
      // a mostrar el PDF como una página web limpia, eliminando la barra nativa.
      embedUrl = `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;
  }

  const viewerTitle = document.getElementById('viewerTitle'); if(viewerTitle) viewerTitle.innerText = chapterTitle; 
  const viewerFrame = document.getElementById('viewerFrame'); if(viewerFrame) viewerFrame.src = embedUrl;
  const viewerModal = document.getElementById('viewerModal'); if(viewerModal) viewerModal.style.display = "flex"; 
  document.body.style.overflow = "hidden";

  // NUEVO: Trampa para el gesto de retroceso nativo en celulares
  window.isViewerOpen = true;
  window.history.pushState({ modal: 'pdf' }, "", window.location.href);

}

function closeViewer(fromBackButton = false) { 
  const viewerModal = document.getElementById('viewerModal'); 
  if(viewerModal) viewerModal.style.display = "none"; 
  
  const viewerFrame = document.getElementById('viewerFrame'); 
  if(viewerFrame) {
      const newFrame = document.createElement('iframe');
      newFrame.id = 'viewerFrame';
      newFrame.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; background: #FFF; z-index: 1;';
      viewerFrame.parentNode.replaceChild(newFrame, viewerFrame);
  }
  
  document.body.style.overflow = ""; 
  
  // ==========================================
  // NUEVO: Lógica del historial para celulares
  // ==========================================
  window.isViewerOpen = false;
  
  // Si el usuario cerró tocando la "X" en la pantalla, 
  // tenemos que borrar la trampa del historial manualmente.
  if (fromBackButton !== true) {
      window.history.back();
  }
}

// NUEVO: Escuchador del gesto nativo de retroceso en celulares
window.addEventListener('popstate', function(event) {
    if (window.isViewerOpen) {
        // Si el lector está abierto y el usuario desliza hacia atrás, 
        // cerramos el lector y le avisamos que fue a través del gesto (true)
        closeViewer(true); 
    }
});

function updateHeaderUI() {
  const userBtn = document.getElementById('userBtn');
  const shopBtn = document.getElementById('nav-shop');
  const inventoryBtn = document.getElementById('nav-inventory');
  const messagesBtn = document.getElementById('nav-messages'); 
  const supportDiv = document.querySelector('.sidebar-support');
  const logoutBtn = document.getElementById('nav-logout');

  if (currentUser) {
    if(userBtn) {
        userBtn.innerHTML = `<span style="font-size: 1.1em;">👤 ${currentUser.usuario}</span><br><span style="color: #1F2833; font-weight: 900; font-size: 1em;">💰 ${currentUser.monedas}</span>`;
        userBtn.onclick = () => { window.location.hash = 'profile'; const sidebar = document.getElementById('sidebar'); if(sidebar) sidebar.classList.remove('open'); }; 
    }
    if(shopBtn) shopBtn.style.display = 'block'; 
    if(inventoryBtn) inventoryBtn.style.display = 'block'; 
    if(logoutBtn) logoutBtn.style.display = 'block';
    if(messagesBtn) messagesBtn.style.display = 'block'; 
    if(supportDiv) supportDiv.style.marginTop = '0'; 
    startUnreadTracker(); 
  } else {
    if(userBtn) {
        userBtn.innerHTML = `Ingresar`;
        userBtn.onclick = openAuthModal;
    }
    if(shopBtn) shopBtn.style.display = 'none'; 
    if(inventoryBtn) inventoryBtn.style.display = 'none'; 
    if(logoutBtn) logoutBtn.style.display = 'none';
    if(messagesBtn) messagesBtn.style.display = 'none'; 
    if(supportDiv) supportDiv.style.marginTop = 'auto'; 
    clearInterval(unreadInterval); 
  }
}

function toggleAuthMode() {
  isLoginMode = !isLoginMode;
  const title = document.getElementById('authModalTitle'); const desc = document.getElementById('authModalDesc');
  const btn = document.getElementById('authSubmitBtn'); const link = document.getElementById('authToggleLink');
  const authMessage = document.getElementById('authMessage'); if(authMessage) authMessage.style.display = 'none';
  if(title && desc && btn && link) {
      if (isLoginMode) { title.innerText = "Iniciar Sesión"; desc.innerText = "Ingresa a tu cuenta para continuar"; btn.innerText = "Entrar"; link.innerText = "¿No tienes cuenta? Regístrate aquí"; } 
      else { title.innerText = "Crear Cuenta"; desc.innerText = "Únete para guardar tu progreso y comentar"; btn.innerText = "Registrarse"; link.innerText = "¿Ya tienes cuenta? Inicia sesión"; }
  }
}

function openAuthModal() {
  const authModal = document.getElementById('authModal'); if(authModal) authModal.style.display = 'flex'; 
  const authMessage = document.getElementById('authMessage'); if(authMessage) authMessage.style.display = 'none';
  const authUsername = document.getElementById('authUsername'); if(authUsername) authUsername.value = ''; 
  const authPassword = document.getElementById('authPassword'); if(authPassword) authPassword.value = '';
  isLoginMode = false; toggleAuthMode(); 
  const sidebar = document.getElementById('sidebar'); if(sidebar) sidebar.classList.remove('open');
}
function closeAuthModal() { const authModal = document.getElementById('authModal'); if(authModal) authModal.style.display = 'none'; }

async function processAuth() {
  const authUsername = document.getElementById('authUsername');
  const authPassword = document.getElementById('authPassword');
  if(!authUsername || !authPassword) return;

  const user = authUsername.value.trim(); const pass = authPassword.value.trim();
  const msg = document.getElementById('authMessage'); const btn = document.getElementById('authSubmitBtn');
  if (!user || !pass) { if(msg) { msg.innerText = "Llena ambos campos."; msg.style.display = "block"; } return; }
  if(btn) { btn.innerText = "Cargando..."; btn.disabled = true; }

  const { data, error } = await supabaseApp.from('lectores').select('*').ilike('usuario', user).single();

  if (error && error.code !== 'PGRST116') { if(msg) { msg.innerText = "Error en el servidor."; msg.style.display = "block"; } if(btn) { btn.innerText = isLoginMode ? "Entrar" : "Registrarse"; btn.disabled = false; } return; }

  if (isLoginMode) {
    if (data) { if (data.clave === pass) loginSuccess(data); else { if(msg){ msg.innerText = "Contraseña incorrecta."; msg.style.display = "block"; } } } 
    else { if(msg) { msg.innerText = "Este usuario no existe. ¡Regístrate!"; msg.style.display = "block"; } }
  } else {
    if (data) { if(msg){ msg.innerText = "Ese nombre ya está en uso."; msg.style.display = "block"; } } 
    else {
      const { data: newData, error: insertError } = await supabaseApp.from('lectores').insert([{ usuario: user, clave: pass, monedas: 100 }]).select().single();
      if (insertError) { if(msg){ msg.innerText = "Error al crear cuenta."; msg.style.display = "block"; } } else { loginSuccess(newData); alert("¡Cuenta creada! 100 monedas de regalo."); }
    }
  }
  if(btn) { btn.innerText = isLoginMode ? "Entrar" : "Registrarse"; btn.disabled = false; }
}

function loginSuccess(userData) {
  currentUser = userData;
  if (!currentUser.inventario) currentUser.inventario = []; if (!currentUser.capitulos_leidos) currentUser.capitulos_leidos = []; if (!currentUser.siguiendo) currentUser.siguiendo = []; if (!currentUser.seguidores) currentUser.seguidores = []; if (!currentUser.marcapaginas) currentUser.marcapaginas = {};
  localStorage.setItem('mangaJH_user', JSON.stringify(currentUser)); savedFavs = userData.favs || []; savedSeen = userData.seen || []; readingHistory = userData.history || []; localStorage.setItem('mangaJH_v2_favs', JSON.stringify(savedFavs)); localStorage.setItem('mangaJH_v2_seen', JSON.stringify(savedSeen)); localStorage.setItem('mangaJH_v2_history', JSON.stringify(readingHistory));
  closeAuthModal(); updateHeaderUI(); handleRouting(true); setTimeout(() => { checkDailyReward(); }, 1000);
}

function logout() { const logoutModal = document.getElementById('logoutModal'); if(logoutModal) logoutModal.style.display = 'flex'; const sidebar = document.getElementById('sidebar'); if(sidebar) sidebar.classList.remove('open'); }
function closeLogoutModal() { const logoutModal = document.getElementById('logoutModal'); if(logoutModal) logoutModal.style.display = 'none'; }
function confirmLogout() {
  currentUser = null; localStorage.removeItem('mangaJH_user'); localStorage.removeItem('mangaJH_active_effect'); localStorage.removeItem('mangaJH_active_banner'); localStorage.removeItem('mangaJH_active_marco');
  savedFavs = []; savedSeen = []; readingHistory = [];
  localStorage.setItem('mangaJH_v2_favs', JSON.stringify([])); localStorage.setItem('mangaJH_v2_seen', JSON.stringify([])); localStorage.setItem('mangaJH_v2_history', JSON.stringify([]));
  closeLogoutModal(); updateHeaderUI(); window.location.hash = 'home'; 
}

function openEditProfileModal() {
  if(!currentUser) return;
  const editProfileModal = document.getElementById('editProfileModal'); if(editProfileModal) editProfileModal.style.display = 'flex';
  const editNameInput = document.getElementById('editNameInput'); if(editNameInput) editNameInput.value = currentUser.usuario || '';
  const editAgeInput = document.getElementById('editAgeInput'); if(editAgeInput) editAgeInput.value = currentUser.edad || '';
  const editAvatarInput = document.getElementById('editAvatarInput'); if(editAvatarInput) editAvatarInput.value = currentUser.avatar_url || '';
  const editBannerInput = document.getElementById('editBannerInput'); if(editBannerInput) editBannerInput.value = currentUser.banner_url || '';
  const editDescInput = document.getElementById('editDescInput'); if(editDescInput) editDescInput.value = currentUser.descripcion || '';
  
  // Cargar redes si existen
  if(document.getElementById('editTiktok')) document.getElementById('editTiktok').value = currentUser.social_tiktok || '';
  if(document.getElementById('editInsta')) document.getElementById('editInsta').value = currentUser.social_instagram || '';
  if(document.getElementById('editFb')) document.getElementById('editFb').value = currentUser.social_facebook || '';
  if(document.getElementById('editWa')) document.getElementById('editWa').value = currentUser.social_whatsapp || '';
  if(document.getElementById('editDiscord')) document.getElementById('editDiscord').value = currentUser.social_discord || '';
  if(document.getElementById('editYt')) document.getElementById('editYt').value = currentUser.social_youtube || '';
  if(document.getElementById('editCustomLabel')) document.getElementById('editCustomLabel').value = currentUser.social_custom_label || '';
  if(document.getElementById('editCustomUrl')) document.getElementById('editCustomUrl').value = currentUser.social_custom_url || '';
  // Limpiar campos de contraseña al abrir el modal
  if(document.getElementById('editCurrentPassword')) document.getElementById('editCurrentPassword').value = '';
  if(document.getElementById('editNewPassword')) document.getElementById('editNewPassword').value = '';

  const editProfileMessage = document.getElementById('editProfileMessage'); if(editProfileMessage) editProfileMessage.style.display = 'none';
  const sidebar = document.getElementById('sidebar'); if(sidebar) sidebar.classList.remove('open');
}

function closeEditProfileModal() {
  const editProfileModal = document.getElementById('editProfileModal');
  if(editProfileModal) editProfileModal.style.display = 'none';
}

async function processEditProfile() {
  const newName = document.getElementById('editNameInput') ? document.getElementById('editNameInput').value.trim() : '';
  const newAge = document.getElementById('editAgeInput') ? document.getElementById('editAgeInput').value.trim() : '';
  const newAvatar = document.getElementById('editAvatarInput') ? document.getElementById('editAvatarInput').value.trim() : '';
  const newBanner = document.getElementById('editBannerInput') ? document.getElementById('editBannerInput').value.trim() : ''; 
  const newDesc = document.getElementById('editDescInput') ? document.getElementById('editDescInput').value.trim() : '';
  
  // Capturar redes
  const st = document.getElementById('editTiktok') ? document.getElementById('editTiktok').value.trim() : '';
  const si = document.getElementById('editInsta') ? document.getElementById('editInsta').value.trim() : '';
  const sf = document.getElementById('editFb') ? document.getElementById('editFb').value.trim() : '';
  const sw = document.getElementById('editWa') ? document.getElementById('editWa').value.trim() : '';
  const sd = document.getElementById('editDiscord') ? document.getElementById('editDiscord').value.trim() : '';
  const sy = document.getElementById('editYt') ? document.getElementById('editYt').value.trim() : '';
  const scl = document.getElementById('editCustomLabel') ? document.getElementById('editCustomLabel').value.trim() : '';
  const scu = document.getElementById('editCustomUrl') ? document.getElementById('editCustomUrl').value.trim() : '';

  const msg = document.getElementById('editProfileMessage'); 
  const btn = document.getElementById('btnEditProfile');

  if (!newName) { if(msg){ msg.innerText = "El nombre no puede estar vacío."; msg.style.display = "block"; } return; }
  if (newName.length > 12) { if(msg){ msg.innerText = "Máximo 12 caracteres."; msg.style.display = "block"; } return; }
  if(btn) { btn.innerText = "Comprobando..."; btn.disabled = true; }

  if (newName !== currentUser.usuario) {
      const { data } = await supabaseApp.from('lectores').select('usuario').ilike('usuario', newName).single();
      if (data) { if(msg){ msg.innerText = "Ese nombre ya está ocupado."; msg.style.display = "block"; } if(btn){ btn.innerText = "Guardar Cambios"; btn.disabled = false; } return; }
  }

  // Lógica de validación de contraseña
  const currentPassInput = document.getElementById('editCurrentPassword').value.trim();
  const newPassInput = document.getElementById('editNewPassword').value.trim();

  let updatePayload = { 
      usuario: newName, edad: newAge ? parseInt(newAge) : null, avatar_url: newAvatar, banner_url: newBanner, descripcion: newDesc,
      social_tiktok: st || null, social_instagram: si || null, social_facebook: sf || null, social_whatsapp: sw || null, 
      social_discord: sd || null, social_youtube: sy || null, social_custom_label: scl || null, social_custom_url: scu || null
  };

  if (newPassInput !== "") {
      if (!currentPassInput) {
          if(msg){ msg.innerText = "Ingresa tu contraseña actual para cambiarla."; msg.style.display = "block"; }
          if(btn){ btn.innerText = "Guardar Cambios"; btn.disabled = false; }
          return;
      }
      if (currentPassInput !== currentUser.clave) {
          if(msg){ msg.innerText = "La contraseña actual es incorrecta."; msg.style.display = "block"; }
          if(btn){ btn.innerText = "Guardar Cambios"; btn.disabled = false; }
          return;
      }
      // Si todo es correcto, agregamos la nueva clave al paquete que se va a la nube
      updatePayload.clave = newPassInput;
      currentUser.clave = newPassInput;
  }

  if(btn) btn.innerText = "Guardando...";
  
  const oldName = currentUser.usuario;

  const { error: updateError } = await supabaseApp.from('lectores').update(updatePayload).eq('usuario', currentUser.usuario);

  if (updateError) { if(msg){ msg.innerText = "Error en el servidor."; msg.style.display = "block"; } if(btn){ btn.innerText = "Guardar Cambios"; btn.disabled = false; } return; }

  currentUser.usuario = newName; currentUser.edad = updatePayload.edad; currentUser.avatar_url = updatePayload.avatar_url; currentUser.banner_url = updatePayload.banner_url; currentUser.descripcion = updatePayload.descripcion;
  currentUser.social_tiktok = updatePayload.social_tiktok; currentUser.social_instagram = updatePayload.social_instagram;
  currentUser.social_facebook = updatePayload.social_facebook; currentUser.social_whatsapp = updatePayload.social_whatsapp;
  currentUser.social_discord = updatePayload.social_discord; currentUser.social_youtube = updatePayload.social_youtube;
  currentUser.social_custom_label = updatePayload.social_custom_label; currentUser.social_custom_url = updatePayload.social_custom_url;

  localStorage.setItem('mangaJH_user', JSON.stringify(currentUser));
  await updateMyCommentsVisuals(oldName, newName);

  closeEditProfileModal(); updateHeaderUI();
  if(currentMode === 'profile') renderProfileView(); 
  showCustomAlert("¡Tu perfil ha sido actualizado con éxito!");
  if(btn){ btn.innerText = "Guardar Cambios"; btn.disabled = false; }
}

async function toggleFollow(targetUsername) {
  if (!currentUser) { openAuthModal(); return; }
  if (currentUser.usuario === targetUsername) return; // No te puedes seguir a ti mismo

  const btn = document.getElementById('btn-follow');
  if(btn) { btn.disabled = true; btn.innerText = "Procesando..."; }

  // 1. Descargamos los datos más recientes del usuario al que queremos seguir
  const { data: targetUser } = await supabaseApp.from('lectores').select('*').eq('usuario', targetUsername).single();
  if (!targetUser) return;

  let myFollowing = currentUser.siguiendo || [];
  let targetFollowers = targetUser.seguidores || [];

  const isFollowing = myFollowing.includes(targetUsername);

  if (isFollowing) {
      // Dejar de seguir
      myFollowing = myFollowing.filter(u => u !== targetUsername);
      targetFollowers = targetFollowers.filter(u => u !== currentUser.usuario);
  } else {
      // Seguir
      myFollowing.push(targetUsername);
      targetFollowers.push(currentUser.usuario);
  }

  // 2. Guardamos en Supabase para ambos usuarios
  await supabaseApp.from('lectores').update({ siguiendo: myFollowing }).eq('usuario', currentUser.usuario);
  await supabaseApp.from('lectores').update({ seguidores: targetFollowers }).eq('usuario', targetUsername);

  // 3. Actualizamos nuestra sesión local y refrescamos la pantalla
  currentUser.siguiendo = myFollowing;
  localStorage.setItem('mangaJH_user', JSON.stringify(currentUser));
  renderPublicProfile(targetUsername);
} 

async function renderPublicProfile(username) {
  const contentArea = document.getElementById('contentArea');
  if(!contentArea) return;
  contentArea.innerHTML = `<div style="text-align:center; padding: 80px;"><div class="skeleton-box" style="width:120px; height:120px; border-radius:50%; margin:0 auto 20px;"></div><p style="color:var(--text-main);">Buscando perfil de ${username}...</p></div>`;
  contentArea.style.display = 'block';

  const { data: user, error } = await supabaseApp.from('lectores').select('*').ilike('usuario', username).single();

  if (error || !user) {
    contentArea.innerHTML = `<div style="text-align:center; padding: 80px;"><div style="font-size: 5em; margin-bottom: 10px;">👻</div><h3 style="color: var(--danger); font-size: 2em;">Usuario no encontrado</h3><button class="btn-read" style="width: auto; padding: 10px 30px; margin-top: 20px;" onclick="goBack()">Volver</button></div>`;
    return;
  }

  let bannerUrl = user.banner_url || '';
  let bannerStyle = bannerUrl ? `background: url('${bannerUrl}') center/cover no-repeat;` : `background: linear-gradient(45deg, #1F2833, #45A29E);`;
  let avatarBg = `var(--bg-card)`; let avatarContent = '👤';
  if (user.avatar_url && user.avatar_url.trim() !== '') { avatarBg = `url('${user.avatar_url}') center/cover no-repeat`; avatarContent = ''; }

  let edadDisplay = user.edad ? `${user.edad} años` : 'Edad oculta';
  let descDisplay = user.descripcion || '¡Hola! Me encanta leer en MangaJH.';
  let capLeidos = user.capitulos_leidos ? user.capitulos_leidos.length : 0;
  let nivelUsuario = Math.floor(capLeidos / 3) + 1; 
  let horasLeidas = (capLeidos * 25 / 60).toFixed(1); 
  
  let targetFollowers = user.seguidores || [];
  let targetFollowing = user.siguiendo || [];
  let targetFriends = targetFollowers.filter(u => targetFollowing.includes(u));
  let amigosCount = targetFriends.length;

  const isMe = currentUser && currentUser.usuario === user.usuario;
  const iAmFollowing = currentUser && (currentUser.siguiendo || []).includes(user.usuario);
  const theyAreFollowingMe = currentUser && targetFollowing.includes(currentUser.usuario);
  const areFriends = iAmFollowing && theyAreFollowingMe;

  let followBtnHtml = '';
  if (currentUser && !isMe) {
      if (areFriends) {
          followBtnHtml = `
            <div style="display: flex; gap: 10px; width: 100%; max-width: 500px; margin-bottom: 25px;">
              <button id="btn-follow" class="btn-read" style="flex: 1; background: var(--info); color: white;" onclick="toggleFollow('${user.usuario}')">🤝 Amigos</button>
              <button class="btn-read" style="flex: 1; background: var(--accent-1); color: #000;" onclick="openChat('${user.usuario}')">💬 Mensaje</button>
            </div>
          `;
      }
      else if (iAmFollowing) followBtnHtml = `<button id="btn-follow" class="btn-read" style="background: transparent; color: var(--text-main); border: 1px solid var(--accent-1); width: 100%; max-width: 500px; margin-bottom: 25px;" onclick="toggleFollow('${user.usuario}')">✔️ Siguiendo</button>`;
      else followBtnHtml = `<button id="btn-follow" class="btn-read" style="background: var(--accent-1); color: #000; width: 100%; max-width: 500px; margin-bottom: 25px;" onclick="toggleFollow('${user.usuario}')">➕ Seguir a ${user.usuario}</button>`;
  } else if (!currentUser) {
      followBtnHtml = `<button class="btn-read" style="background: var(--accent-1); color: #000; width: 100%; max-width: 500px; margin-bottom: 25px;" onclick="openAuthModal()">➕ Inicia sesión para seguir</button>`;
  }

  contentArea.innerHTML = `
    <div class="hero-banner" style="height: clamp(150px, 35vw, 380px); display: flex; align-items: flex-start; justify-content: center; ${bannerStyle} position: relative; border-radius: 15px; border-bottom: 1px solid var(--border-color);">
      <button class="btn-back-details" onclick="goBack()" style="top: 15px; left: 15px; position: absolute; z-index: 50;">‹ Volver</button>
      <div style="position: absolute; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.3); border-radius: 15px;"></div>
    </div>
    
    <div style="position: relative; z-index: 20; padding: 0 clamp(10px, 3vw, 20px); margin-top: clamp(-90px, -15vw, -60px);">
      
      <!-- CONTENEDOR PRINCIPAL DE 2 COLUMNAS -->
      <div style="display: flex; flex-wrap: wrap; gap: 30px; width: 100%; align-items: flex-start;">
          
          <!-- LADO IZQUIERDO -->
          <div class="profile-left-col" style="flex: 0 1 450px; width: 100%; display: flex; flex-direction: column; gap: 20px;">
              
              <div style="display: flex; align-items: flex-end; flex-wrap: wrap; gap: 15px; width: 100%;">
                  <div style="width: clamp(100px, 20vw, 180px); height: clamp(100px, 20vw, 180px); border-radius: 50%; background: ${avatarBg}; box-shadow: 0 4px 15px rgba(0,0,0,0.6); border: 2px solid var(--accent-1); display: flex; align-items: center; justify-content: center; font-size: clamp(3em, 8vw, 5em); color: rgba(255,255,255,0.8); flex-shrink: 0;">${avatarContent}</div>
                  
                  <div class="perfil-textos" style="padding-bottom: 10px;"> 
                    <h3 class="perfil-nombre" style="font-size: clamp(1.5em, 6vw, 2.2em); margin: 0; line-height: 1.2; color: #FFF; text-shadow: 0 2px 5px rgba(0,0,0,0.8);">${user.usuario}</h3>
                    <p class="perfil-edad" style="color: var(--accent-2); font-size: 1.1em; margin: 5px 0 0 0; font-weight: bold; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">🎂 ${edadDisplay}</p>
                  </div>
              </div>

              <!-- SEGUIDORES ESTILO TIKTOK -->
              <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                  <div onclick="openUserListModal('👥 Seguidores de ${user.usuario}', '${encodeURIComponent(JSON.stringify(targetFollowers))}')" style="cursor: pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
                      <span style="font-weight: bold; font-size: 1.15em; color: #FFF;">${targetFollowers.length}</span>
                      <span style="font-size: 0.9em; color: var(--text-main); margin-left: 4px;">Seguidores</span>
                  </div>
                  <div onclick="openUserListModal('🤝 Amigos de ${user.usuario}', '${encodeURIComponent(JSON.stringify(targetFriends))}')" style="cursor: pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
                      <span style="font-weight: bold; font-size: 1.15em; color: #FFF;">${amigosCount}</span>
                      <span style="font-size: 0.9em; color: var(--text-main); margin-left: 4px;">Amigos</span>
                  </div>
                  <div onclick="openUserListModal('👣 Siguiendo a', '${encodeURIComponent(JSON.stringify(targetFollowing))}')" style="cursor: pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
                      <span style="font-weight: bold; font-size: 1.15em; color: #FFF;">${targetFollowing.length}</span>
                      <span style="font-size: 0.9em; color: var(--text-main); margin-left: 4px;">Siguiendo</span>
                  </div>
              </div>
              
              <p style="color: var(--text-main); font-size: 1.1em; max-width: 600px; margin: 0; font-style: italic; line-height: 1.5;">"${descDisplay}"</p> 
              
              ${generateSocialHtml(user)}
              ${followBtnHtml}
              
              <!-- CAJAS DE ESTADÍSTICAS DE LECTURA -->
              <div style="display: flex; gap: 10px; width: 100%; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 90px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 12px; padding: 15px 5px; text-align: center;">
                  <div style="font-size: 1.5em; margin-bottom: 5px;">⏱️</div>
                  <div style="font-size: 1.5em; font-weight: bold; color: #FFF;">${horasLeidas}h</div>
                  <div style="font-size: 0.7em; color: var(--success); text-transform: uppercase; font-weight: bold; margin-top: 5px;">Horas Leídas</div>
                </div>
                <div style="flex: 1; min-width: 90px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 12px; padding: 15px 5px; text-align: center;">
                  <div style="font-size: 1.5em; margin-bottom: 5px;">🏆</div>
                  <div style="font-size: 1.5em; font-weight: bold; color: #FFF;">Nv. ${nivelUsuario}</div>
                  <div style="font-size: 0.7em; color: var(--star); text-transform: uppercase; font-weight: bold; margin-top: 5px;">Rango</div>
                </div>
              </div>
          </div>
          
          <!-- LADO DERECHO: APORTES Y POSTS -->
          <div class="profile-right-col" style="flex: 1 1 400px; min-width: 300px; display: flex; flex-direction: column; gap: 20px;">
              
             <!-- ESPACIADOR INVISIBLE PARA EMPUJAR HACIA ABAJO (SOLO EN PC) -->
              <div style="height: 60px;" class="desktop-spacer"></div>

              <div id="wrapper-userPublicProfileAportes" style="display: none; background: rgba(0,0,0,0.15); padding: 20px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.05);">
                  <h3 style="color: var(--accent-1); margin-bottom: 15px; border-bottom: 2px solid var(--border-color); padding-bottom: 10px; font-size: 1.3em;">🎨 Obras Aportadas</h3>
                  <div id="userPublicProfileAportes"></div>
              </div>

              <div style="background: rgba(0,0,0,0.15); padding: 20px; border-radius: 15px; border: 1px solid rgba(255,255,255,0.05);">
                  <h3 style="color: var(--accent-1); margin-bottom: 15px; border-bottom: 2px solid var(--border-color); padding-bottom: 10px; font-size: 1.3em;">📝 Post ForoMJH</h3>
                  <div id="userPublicProfilePosts">
                      <div style="text-align:center; color:var(--text-main);">Buscando publicaciones... ⏳</div>
                  </div>
              </div>
              
          </div>
      </div>
    </div>
  `;
  window.scrollTo({ top: 0, behavior: 'instant' });
  
  loadUserForoPosts(user.usuario, 'userPublicProfilePosts', false);
  loadUserAportes(user.usuario, 'userPublicProfileAportes'); // <-- NUEVA LLAMADA
}

function buyItem(item, cost, type) {
  if (!currentUser) return;
  if (currentUser.monedas < cost) { showCustomAlert("¡No tienes suficientes monedas! Sigue comentando para ganar más."); return; }
  if (!currentUser.inventario) currentUser.inventario = [];
  if (currentUser.inventario.includes(item)) { showCustomAlert("¡Ya tienes este artículo en tu inventario!"); return; }
  
  const btn = event.target; const originalText = btn.innerText; btn.innerText = "Comprando..."; btn.disabled = true;

  currentUser.monedas -= cost; currentUser.inventario.push(item);
  supabaseApp.from('lectores').update({ monedas: currentUser.monedas, inventario: currentUser.inventario }).eq('usuario', currentUser.usuario).then(({error}) => {
      if(btn) { btn.innerText = originalText; btn.disabled = false; }
      if (error) {
        currentUser.monedas += cost; currentUser.inventario.pop();
        showCustomAlert("Hubo un error con la compra. Intenta de nuevo.");
      } else {
        localStorage.setItem('mangaJH_user', JSON.stringify(currentUser));
        if (type === 'efecto') { localStorage.setItem('mangaJH_active_effect', item); updateMyCommentsVisuals(currentUser.usuario, currentUser.usuario); }
        else if (type === 'banner') localStorage.setItem('mangaJH_active_banner', item);
        else if (type === 'marco') localStorage.setItem('mangaJH_active_marco', item);
        else if (type === 'marco_banner') localStorage.setItem('mangaJH_active_marco_banner', item);
        else if (type === 'fondo_tarjeta') localStorage.setItem('mangaJH_active_fondo', item);
        
        updateHeaderUI(); renderShopView();
        showCustomAlert("¡Felicidades! La compra fue exitosa. El artículo se ha equipado automáticamente.");
      }
  });
}

async function equipItem(itemId, itemType) {
   if (itemType === 'efecto') { localStorage.setItem('mangaJH_active_effect', itemId); if(currentUser) await updateMyCommentsVisuals(currentUser.usuario, currentUser.usuario); }
   else if (itemType === 'banner') localStorage.setItem('mangaJH_active_banner', itemId);
   else if (itemType === 'marco') localStorage.setItem('mangaJH_active_marco', itemId);
   else if (itemType === 'marco_banner') localStorage.setItem('mangaJH_active_marco_banner', itemId);
   else if (itemType === 'fondo_tarjeta') localStorage.setItem('mangaJH_active_fondo', itemId);
   
   renderInventoryView(); 
   showCustomAlert(itemId === '' ? "Artículo desequipado." : "¡Artículo equipado con éxito!");
}

function renderShopView() {
  if(!currentUser) { openAuthModal(); window.location.hash = 'home'; return; }
  
  let itemsHtml = '';
  shopItems.forEach(item => {
    const isOwned = currentUser.inventario && currentUser.inventario.includes(item.id);
    const btnHtml = isOwned 
      ? `<button class="btn-read" style="padding: 10px; font-size: 1em; width: 100%; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--accent-2);" onclick="window.location.hash='inventory'">Ya lo tienes</button>`
      : `<button class="btn-read" style="padding: 10px; font-size: 1em; width: 100%; background: ${item.color || 'var(--info)'}; color: ${(item.id==='fuego'||item.type==='banner'||!item.color) ? '#FFF' : '#000'};" onclick="buyItem('${item.id}', ${item.cost}, '${item.type}')">Comprar: ${item.cost} 💰</button>`;

    let cardBg = `background: var(--bg-card);`;
    if((item.type === 'banner' || item.type === 'fondo_tarjeta') && item.url) {
        cardBg = `background: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.7)), url('${item.url}') center/cover no-repeat;`;
    }

    let nameStyle = `font-weight: bold; margin-bottom: 10px; font-size: 1.2em;`;
    if (item.color) nameStyle += ` color: ${item.color};`;
    if (item.shadow) nameStyle += ` text-shadow: ${item.shadow};`;
    let extraClass = item.id === 'fuego' ? 'efecto-fuego' : (item.id === 'neon' ? 'efecto-neon' : '');

    itemsHtml += `
      <div style="${cardBg} padding: 20px; border-radius: 12px; text-align: center; border: 1px solid ${item.color || 'var(--accent-1)'}; transition: all 0.3s; box-shadow: 0 0 10px ${item.color ? item.color+'40' : 'rgba(102, 252, 241, 0.4)'};">
        <div style="font-size: 3.5em; margin-bottom: 15px;" class="${item.id === 'fuego' ? 'efecto-fuego' : ''}">${item.icon || ''}</div>
        <div style="${nameStyle}" class="${extraClass}">${item.name}</div>
        <p style="font-size: 0.85em; color: #ccc; margin-bottom: 20px; height: 40px;">${item.description || 'Sin descripción'}</p>
        ${btnHtml}
      </div>
    `;
  });

  const shopArea = document.getElementById('shopArea');
  if(!shopArea) return;
  shopArea.innerHTML = `
    <div class="hero-banner" style="height: 250px; display: flex; align-items: center; justify-content: center; background: linear-gradient(45deg, #1F2833, #45A29E);">
      <div style="text-align: center; z-index: 10;">
        <h2 style="font-size: 3em; color: #FFF; margin: 0; text-shadow: 0 4px 15px rgba(0,0,0,0.8);">🛒 Tienda MangaJH</h2>
        <p style="color: var(--text-main); font-size: 1.2em; margin-top: 10px;">Personaliza tu experiencia en la comunidad</p>
      </div>
    </div>
    <div style="text-align: center; background: var(--bg-card); padding: 15px; border-radius: 12px; margin: -30px auto 30px auto; width: 90%; max-width: 400px; position: relative; z-index: 20; box-shadow: 0 4px 15px rgba(0,0,0,0.3); border: 1px solid var(--accent-1);">
      <span style="color: var(--text-main); font-size: 1.1em;">Tu saldo actual:</span>
      <span style="color: var(--star); font-size: 1.5em; font-weight: bold; margin-left: 10px;" id="shopBalanceView">${currentUser.monedas} 💰</span>
    </div>
    <h3 style="color: var(--accent-1); margin-bottom: 20px; font-size: 1.5em; border-bottom: 2px solid var(--border-color); padding-bottom: 10px;">Artículos Disponibles</h3>
    <div class="chapters-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
      ${itemsHtml}
    </div>
  `;
  shopArea.style.display = 'block';
}

function renderInventoryView() {
  if(!currentUser) { openAuthModal(); window.location.hash = 'home'; return; }
  
  let itemsHtml = '';
  const activeEffect = localStorage.getItem('mangaJH_active_effect') || '';
  const activeBanner = localStorage.getItem('mangaJH_active_banner') || '';
  const activeMarco = localStorage.getItem('mangaJH_active_marco') || '';
  const activeMarcoBanner = localStorage.getItem('mangaJH_active_marco_banner') || '';
  const activeFondo = localStorage.getItem('mangaJH_active_fondo') || '';

  if(currentUser.inventario && currentUser.inventario.length > 0) {
     shopItems.forEach(item => {
       if(currentUser.inventario.includes(item.id)) {
         
         const isEquipped = 
            (item.type === 'efecto' && activeEffect === item.id) || 
            (item.type === 'banner' && activeBanner === item.id) || 
            (item.type === 'marco' && activeMarco === item.id) ||
            (item.type === 'marco_banner' && activeMarcoBanner === item.id) ||
            (item.type === 'fondo_tarjeta' && activeFondo === item.id);
         
         const btnHtml = isEquipped 
            ? `<button class="btn-read" style="background: var(--success); color: #000; padding: 8px; width: 100%;">✅ Equipado</button>`
            : `<button class="btn-read" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--accent-1); padding: 8px; width: 100%;" onclick="equipItem('${item.id}', '${item.type}')">Equipar</button>`;
            
         let cardBg = `background: var(--bg-card);`;
         if((item.type === 'banner' || item.type === 'fondo_tarjeta') && item.url) {
             cardBg = `background: linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8)), url('${item.url}') center/cover no-repeat;`;
         }

         let nameStyle = `font-size: 1.2em; margin-bottom: 15px; font-weight: bold;`;
         if (item.color) nameStyle += ` color: ${item.color};`;
         if (item.shadow) nameStyle += ` text-shadow: ${item.shadow};`;
         let extraClass = item.id === 'fuego' ? 'efecto-fuego' : (item.id === 'neon' ? 'efecto-neon' : '');

         itemsHtml += `
           <div style="${cardBg} padding: 20px; border-radius: 10px; text-align: center; border: 1px solid ${isEquipped ? 'var(--success)' : 'var(--border-color)'}; box-shadow: ${isEquipped ? '0 0 15px rgba(0,230,118,0.2)' : 'none'};">
             <div style="font-size: 3em; margin-bottom: 10px;" class="${item.id === 'fuego' ? 'efecto-fuego' : ''}">${item.icon || ''}</div>
             <div style="${nameStyle}" class="${extraClass}">${item.name}</div>
             ${btnHtml}
           </div>
         `;
       }
     });
  } else {
    itemsHtml = `
      <div style="grid-column: 1 / -1; text-align:center; padding: 50px 20px; background: rgba(0,0,0,0.2); border-radius: 15px; border: 1px dashed var(--accent-2); margin-top: 10px;">
        <div style="font-size: 4em; margin-bottom: 15px; opacity: 0.8;">🎒</div>
        <h3 style="color: var(--accent-1); margin-bottom: 10px; font-size: 1.5em;">Tu inventario está vacío</h3>
        <p style="color: var(--text-main); font-size: 1em; margin-bottom: 25px;">Aún no has comprado ningún artículo visual en la tienda.</p>
        <button class="btn-read" style="width: auto; padding: 10px 30px;" onclick="window.location.hash='shop'">Ir a la Tienda 🛒</button>
      </div>`;
  }

  let removeEffectBtn = activeEffect !== '' ? `<button class="btn-read" style="width: auto; padding: 10px 20px; background: var(--bg-main); color: var(--danger); border: 1px solid var(--danger); margin: 5px;" onclick="equipItem('', 'efecto')">❌ Quitar Efecto</button>` : '';
  let removeBannerBtn = activeBanner !== '' ? `<button class="btn-read" style="width: auto; padding: 10px 20px; background: var(--bg-main); color: var(--danger); border: 1px solid var(--danger); margin: 5px;" onclick="equipItem('', 'banner')">❌ Quitar Banner</button>` : '';
  let removeMarcoBtn = activeMarco !== '' ? `<button class="btn-read" style="width: auto; padding: 10px 20px; background: var(--bg-main); color: var(--danger); border: 1px solid var(--danger); margin: 5px;" onclick="equipItem('', 'marco')">❌ Quitar Marco de Avatar</button>` : '';
  let removeMarcoBannerBtn = activeMarcoBanner !== '' ? `<button class="btn-read" style="width: auto; padding: 10px 20px; background: var(--bg-main); color: var(--danger); border: 1px solid var(--danger); margin: 5px;" onclick="equipItem('', 'marco_banner')">❌ Quitar Marco de Banner</button>` : '';
  let removeFondoBtn = activeFondo !== '' ? `<button class="btn-read" style="width: auto; padding: 10px 20px; background: var(--bg-main); color: var(--danger); border: 1px solid var(--danger); margin: 5px;" onclick="equipItem('', 'fondo_tarjeta')">❌ Quitar Fondo Avatar</button>` : '';

  const inventoryArea = document.getElementById('inventoryArea');
  if(!inventoryArea) return;
  inventoryArea.innerHTML = `
    <div class="hero-banner" style="height: 150px; display: flex; align-items: center; justify-content: center; background: linear-gradient(45deg, #1F2833, #45A29E);">
      <h2 style="font-size: 2.5em; color: #FFF; margin: 0; text-shadow: 0 4px 10px rgba(0,0,0,0.5);">🎒 Mi Inventario</h2>
    </div>
    <div style="padding: 20px; max-width: 800px; margin: 0 auto;">
      <h3 style="color: var(--accent-1); margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Tus Efectos y Banners</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px;">
        ${itemsHtml}
      </div>
      <div style="text-align: center; margin-top: 20px;">
        ${removeEffectBtn}
        ${removeBannerBtn}
        ${removeMarcoBtn}
        ${removeMarcoBannerBtn}
        ${removeFondoBtn}
      </div>
      <div style="text-align: center; margin-top: 40px;">
         <button class="btn-read" onclick="window.location.hash='shop'" style="width: auto; padding: 12px 30px;">Ir a la Tienda 🛒</button>
         <button class="btn-read" onclick="window.location.hash='profile'" style="width: auto; padding: 12px 30px; background: var(--bg-card); color: var(--text-main); margin-left: 10px;">Volver a mi Perfil</button>
      </div>
    </div>
  `;
  inventoryArea.style.display = 'block';
}

function hideAllAreas() {
  const ids = ['contentArea', 'detailsArea', 'shopArea', 'profileArea', 'inventoryArea'];
  ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
  });
}

// ==========================================
// CEREBRO DE NAVEGACIÓN INTELIGENTE
// ==========================================

let foroInterval = null; 

function handleRouting(skipLoading = false) {
    window.appNavCount = (window.appNavCount || 0) + 1; 
    clearInterval(heroSlideshowInterval); clearInterval(coversSlideshowInterval); clearInterval(mainFeaturedInterval); clearInterval(commentsInterval); clearInterval(foroInterval); 
    
    let hash = window.location.hash.substring(1); 
    if (!hash) { window.location.hash = 'home'; return; }
    if (currentMode && !['search', 'shop', 'profile', 'inventory', 'public_profile'].includes(currentMode)) { scrollPositions[currentMode] = window.scrollY; }

    const searchInput = document.getElementById('searchInput'); const filterBtn = document.getElementById('filterBtn'); const filterPanel = document.getElementById('filterPanel');
    if (filterPanel) filterPanel.style.display = 'none';
    const isHiddenView = ['shop', 'profile', 'inventory'].includes(hash) || hash.startsWith('manga/') || hash.startsWith('user/') || hash.startsWith('aporte/');
    if(searchInput) { searchInput.style.display = isHiddenView ? 'none' : ''; if (!['search', 'shop', 'profile', 'inventory'].includes(hash) && !hash.startsWith('manga/') && !hash.startsWith('user/') && !hash.startsWith('aporte/')) searchInput.value = ''; }
    if(filterBtn) filterBtn.style.display = isHiddenView ? 'none' : '';

    hideAllAreas();
    const foroView = document.getElementById('foroView'); if (foroView) foroView.style.display = 'none';
    const aportesView = document.getElementById('aportesView'); if (aportesView) aportesView.style.display = 'none';
    const appFooter = document.getElementById('appFooter'); if (appFooter) { if (['home', 'mangas_only', 'novelas_only', 'novelas_n_only', 'manhwas_only'].includes(hash)) { appFooter.style.display = 'block'; } else { appFooter.style.display = 'none'; } }

    if (hash.startsWith('manga/')) {
      let mId = hash.replace('manga/', ''); const vTitle = document.getElementById('viewTitle'); if(vTitle) vTitle.style.display = 'none';
      if (lastMangaViewed === mId && document.getElementById('detailsArea') && document.getElementById('detailsArea').innerHTML.trim() !== '') {
          currentMode = 'details'; document.getElementById('detailsArea').style.display = 'block'; setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 10);
          startHeroSlideshow(); commentsInterval = setInterval(() => fetchComments(mId), 5000);
      } else { currentMode = 'details'; lastMangaViewed = mId; renderMangaDetails(mId); }

    } else if (hash.startsWith('aporte/')) { 
      let aId = hash.replace('aporte/', ''); const vTitle = document.getElementById('viewTitle'); if(vTitle) vTitle.style.display = 'none';
      currentMode = 'details'; renderAporteDetails(aId);

    } else if (hash.startsWith('user/')) {
      currentMode = 'public_profile'; const vTitle = document.getElementById('viewTitle'); if(vTitle) vTitle.style.display = 'none';
      lastListHash = 'public_profile'; renderPublicProfile(decodeURIComponent(hash.replace('user/', '')));
      
    } else if (hash === 'shop') {
      currentMode = 'shop'; const vTitle = document.getElementById('viewTitle'); if(vTitle) vTitle.style.display = 'none';
      document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active')); const nShop = document.getElementById('nav-shop'); if(nShop) nShop.classList.add('active'); renderShopView();
      
    } else if (hash === 'profile') {
      currentMode = 'profile'; const vTitle = document.getElementById('viewTitle'); if(vTitle) vTitle.style.display = 'none';
      document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active')); renderProfileView();
      
    } else if (hash === 'inventory') {
      currentMode = 'inventory'; const vTitle = document.getElementById('viewTitle'); if(vTitle) vTitle.style.display = 'none';
      document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active')); renderInventoryView();
      
    } else if (hash === 'foro') {
      currentMode = 'foro'; const vTitle = document.getElementById('viewTitle'); if(vTitle) vTitle.style.display = 'none';
      document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active')); const nForo = document.getElementById('nav-foro'); if(nForo) nForo.classList.add('active');
      if (foroView) foroView.style.display = 'block'; if (typeof loadForoPosts === 'function') { loadForoPosts(); foroInterval = setInterval(() => loadForoPosts(true), 15000); }
      
    } else if (hash === 'aportes') { 
      currentMode = 'aportes'; const vTitle = document.getElementById('viewTitle'); if(vTitle) vTitle.style.display = 'none';
      document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active')); const nAportes = document.getElementById('nav-aportes'); if(nAportes) nAportes.classList.add('active');
      if (aportesView) aportesView.style.display = 'block'; if (typeof loadAportes === 'function') loadAportes();
      
    } else { 
      currentMode = hash; let needsRender = (hash !== lastListHash || !document.getElementById('contentArea') || document.getElementById('contentArea').innerHTML === "");
      if (lastListHash === 'public_profile') needsRender = true; 

      if (needsRender) {
        lastListHash = hash; document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active')); const viewTitle = document.getElementById('viewTitle');
        if (['home', 'mangas_only', 'novelas_only', 'novelas_n_only', 'manhwas_only'].includes(hash)) {
            searchContextMode = hash; if(viewTitle) viewTitle.style.display = "none";
            if (hash === 'home') { const nb = document.getElementById('nav-home'); if(nb) nb.classList.add('active'); renderHomeView(skipLoading, 'all'); } 
            else if (hash === 'mangas_only') { const nb = document.getElementById('nav-mangas'); if(nb) nb.classList.add('active'); renderHomeView(skipLoading, 'manga'); } 
            else if (hash === 'novelas_only') { const nb = document.getElementById('nav-novelas'); if(nb) nb.classList.add('active'); renderHomeView(skipLoading, 'novela'); }
            else if (hash === 'novelas_n_only') { const nb = document.getElementById('nav-novelas-n'); if(nb) nb.classList.add('active'); renderHomeView(skipLoading, 'novela_normal'); }
            else if (hash === 'manhwas_only') { const nb = document.getElementById('nav-manhwas'); if(nb) nb.classList.add('active'); renderHomeView(skipLoading, 'manhwa'); }
        } 
        else if (hash === 'fav') { searchContextMode = 'fav'; const nb = document.getElementById('nav-fav'); if(nb) nb.classList.add('active'); if(viewTitle){ viewTitle.style.display = "block"; viewTitle.innerHTML = `<div class="genre-header-wrapper"><button class="btn-back-genre" onclick="goBack()">‹ Volver</button><span style="display:flex; align-items:center; gap:10px;">⭐ Tus Favoritos</span></div>`;} renderGridView(mangaData.filter(m => savedFavs.includes(m.id)), skipLoading, true); } 
        else if (hash === 'seen') { searchContextMode = 'seen'; const nb = document.getElementById('nav-seen'); if(nb) nb.classList.add('active'); if(viewTitle){ viewTitle.style.display = "block"; viewTitle.innerHTML = `<div class="genre-header-wrapper"><button class="btn-back-genre" onclick="goBack()">‹ Volver</button><span style="display:flex; align-items:center; gap:10px;">✅ Terminados</span></div>`;} renderGridView(mangaData.filter(m => savedSeen.includes(m.id)), skipLoading, true); } 
        else if (hash.startsWith('genre/')) { const genre = decodeURIComponent(hash.replace('genre/', '')); searchContextMode = 'genre'; currentGenreView = genre; if(viewTitle){ viewTitle.style.display = "block"; viewTitle.innerHTML = `<div class="genre-header-wrapper"><button class="btn-back-genre" onclick="goBack()">‹ Volver</button><span style="display:flex; align-items:center; gap:10px;">📌 Explorando: ${genre}</span></div>`; } renderGridView(mangaData.filter(m => Array.isArray(m.genres) && m.genres.includes(genre)), skipLoading, true); }
        else { renderHomeView(skipLoading, 'all'); }
      } else {
        const contentArea = document.getElementById('contentArea'); if(contentArea) contentArea.style.display = contentArea.className === "grid-container" ? 'grid' : 'block';
        const viewTitle = document.getElementById('viewTitle');
        document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));
        const hashToNavId = { 'home': 'nav-home', 'mangas_only': 'nav-mangas', 'novelas_only': 'nav-novelas', 'novelas_n_only': 'nav-novelas-n', 'manhwas_only': 'nav-manhwas', 'fav': 'nav-fav', 'seen': 'nav-seen' };
        if (hashToNavId[hash]) { const activeNav = document.getElementById(hashToNavId[hash]); if(activeNav) activeNav.classList.add('active'); }
        if (!['home', 'mangas_only', 'novelas_only', 'novelas_n_only', 'manhwas_only'].includes(hash)) { if(viewTitle) viewTitle.style.display = "block"; }
        startCoverSlideshow(); if (['home', 'mangas_only', 'novelas_only', 'novelas_n_only', 'manhwas_only'].includes(hash)) startMainFeaturedSlider(); 
        setTimeout(() => window.scrollTo({ top: scrollPositions[hash] || 0, left: 0, behavior: 'instant' }), 0);
      }
    }
}
    
    const sidebar = document.getElementById('sidebar');
    if(sidebar) sidebar.classList.remove('open');

// Estos dos deben quedar fuera de la función handleRouting
window.addEventListener('DOMContentLoaded', initApp);
window.addEventListener('hashchange', () => handleRouting(false));

// ==========================================
// BUSCADOR, SWIPES Y ACCIONES SECUNDARIAS
// ==========================================
let searchTimer; function handleSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => { searchMangas(); }, 300); }
function searchMangas(skipLoading = false) {
  const searchInput = document.getElementById('searchInput');
  if(!searchInput) return;
  const input = searchInput.value.toLowerCase();
  
  const viewTitle = document.getElementById('viewTitle'); 
  const sidebar = document.getElementById('sidebar'); if(sidebar) sidebar.classList.remove('open'); 
  
  // ==========================================
  // SI ESTAMOS EN APORTES (COMUNIDAD)
  // ==========================================
  if (currentMode === 'aportes' || currentMode === 'search_aportes') {
      if (input.trim() === "") { 
          currentMode = 'aportes';
          renderAportesList(window.aportesData || []);
          if(viewTitle) viewTitle.style.display = "none";
          return; 
      }
      currentMode = 'search_aportes';
      
      let filtered = (window.aportesData || []).filter(m => 
          (m.titulo && String(m.titulo).toLowerCase().includes(input)) || 
          (m.title && String(m.title).toLowerCase().includes(input)) || 
          (Array.isArray(m.genres) && m.genres.some(g => g && g.toLowerCase().includes(input))) ||
          (m.genero && String(m.genero).toLowerCase().includes(input)) ||
          (m.autor && String(m.autor).toLowerCase().includes(input)) // Busca por autor en la comunidad
      );
      
      renderAportesList(filtered);
      return; // Detenemos aquí para que no filtre el catálogo oficial
  }
  
  // ==========================================
  // SI ESTAMOS EN EL INICIO (CATÁLOGO OFICIAL)
  // ==========================================
  hideAllAreas();
  const appFooter = document.getElementById('appFooter');
  if (appFooter) appFooter.style.display = 'none';
  
  if (input.trim() === "") { lastListHash = ''; handleRouting(skipLoading); return; }
  currentMode = 'search'; lastListHash = 'search'; clearInterval(mainFeaturedInterval); 
  document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active')); 
  if(viewTitle) viewTitle.style.display = "block";
  
  let contextText = "todo el catálogo"; let baseData = mangaData; let showBadge = true;
  if (searchContextMode === 'mangas_only') { contextText = "solo Mangas"; baseData = mangaData.filter(m => m.format === 'manga'); showBadge = false; } 
  else if (searchContextMode === 'novelas_only') { contextText = "solo Novelas L."; baseData = mangaData.filter(m => m.format === 'novela'); showBadge = false; } 
  else if (searchContextMode === 'novelas_n_only') { contextText = "solo Novelas"; baseData = mangaData.filter(m => m.format === 'novela_normal'); showBadge = false; } 
  else if (searchContextMode === 'manhwas_only') { contextText = "solo Manhwas"; baseData = mangaData.filter(m => m.format === 'manhwa'); showBadge = false; }
  else if (searchContextMode === 'fav') { contextText = "tus Favoritos"; baseData = mangaData.filter(m => savedFavs.includes(m.id)); } 
  else if (searchContextMode === 'seen') { contextText = "tus Terminados"; baseData = mangaData.filter(m => savedSeen.includes(m.id)); }
  else if (searchContextMode === 'genre') { contextText = `el género ${currentGenreView}`; baseData = mangaData.filter(m => Array.isArray(m.genres) && m.genres.includes(currentGenreView)); }

  if(viewTitle) viewTitle.innerHTML = `<div class="genre-header-wrapper"><button class="btn-back-genre" onclick="closeSearch()">‹ Volver</button><span style="display:flex; align-items:center; gap:10px;">🔍 Buscando "${input}" en ${contextText}</span></div>`;
  
  renderGridView(baseData.filter(m => 
      (m.title && String(m.title).toLowerCase().includes(input)) || 
      (Array.isArray(m.genres) && m.genres.some(g => g && typeof g === 'string' && g.toLowerCase().includes(input)))
  ), false, showBadge);
}

function makeCarouselDraggable(slider) {
  if(!slider) return;
  let isDown = false; let startX; let scrollLeft; let isDragging = false;
  slider.addEventListener('mousedown', (e) => { isDown = true; isDragging = false; slider.classList.add('active'); startX = e.pageX - slider.offsetLeft; scrollLeft = slider.scrollLeft; });
  slider.addEventListener('mouseleave', () => { isDown = false; slider.classList.remove('active'); });
  slider.addEventListener('mouseup', () => { isDown = false; slider.classList.remove('active'); setTimeout(() => isDragging = false, 50); });
  slider.addEventListener('mousemove', (e) => { if (!isDown) return; e.preventDefault(); isDragging = true; const x = e.pageX - slider.offsetLeft; const walk = (x - startX) * 2; slider.scrollLeft = scrollLeft - walk; });
  let touchStartX = 0; let touchStartY = 0;
  slider.addEventListener('touchstart', (e) => { isDragging = false; touchStartX = e.changedTouches[0].screenX; touchStartY = e.changedTouches[0].screenY; }, {passive: true});
  slider.addEventListener('touchmove', (e) => { const touchEndX = e.changedTouches[0].screenX; const touchEndY = e.changedTouches[0].screenY; if (Math.abs(touchEndX - touchStartX) > 5 || Math.abs(touchEndY - touchStartY) > 5) { isDragging = true; } }, {passive: true});
  slider.addEventListener('touchend', () => { setTimeout(() => isDragging = false, 50); });
  slider.addEventListener('click', (e) => { if (isDragging) { e.preventDefault(); e.stopPropagation(); } }, true); 
}

document.addEventListener('click', (e) => { if(!e.target.closest('.manga-card')) { document.querySelectorAll('.manga-card.mobile-active').forEach(c => c.classList.remove('mobile-active')); } });

function handleCardTap(e, card) {
  if (e.target.closest('.btn-read') || e.target.closest('.btn-icon')) return;
  const isActive = card.classList.contains('mobile-active');
  document.querySelectorAll('.manga-card.mobile-active').forEach(c => { if (c !== card) c.classList.remove('mobile-active'); });
  if (!isActive) card.classList.add('mobile-active');
}

function syncCloudData() {
  if(currentUser) supabaseApp.from('lectores').update({ favs: savedFavs, seen: savedSeen, history: readingHistory, capitulos_leidos: currentUser.capitulos_leidos || [], monedas: currentUser.monedas }).eq('usuario', currentUser.usuario).then();
}

function toggleState(mangaId, type, btnElement) {
  event.stopPropagation(); let isActive = false;
  if(type === 'fav') { if(savedFavs.includes(mangaId)) savedFavs = savedFavs.filter(id => id !== mangaId); else { savedFavs.push(mangaId); isActive = true; } localStorage.setItem('mangaJH_v2_favs', JSON.stringify(savedFavs)); }
  if(type === 'seen') { if(savedSeen.includes(mangaId)) savedSeen = savedSeen.filter(id => id !== mangaId); else { savedSeen.push(mangaId); isActive = true; } localStorage.setItem('mangaJH_v2_seen', JSON.stringify(savedSeen)); }
  
  const cards = document.querySelectorAll(`.manga-card[data-id="${mangaId}"]`);
  cards.forEach(card => {
     const btn = card.querySelector(`.btn-icon.${type}`);
     if (btn) { if (isActive) { btn.classList.add('active'); btn.innerText = type === 'fav' ? '⭐' : '✅'; } else { btn.classList.remove('active'); btn.innerText = type === 'fav' ? '☆' : '✔️'; } }
     const statusIcons = card.querySelector('.status-icons');
     if (statusIcons) { let html = ''; if(savedFavs.includes(mangaId)) html += '<span style="color:var(--star)">⭐</span>'; if(savedSeen.includes(mangaId)) html += '<span style="color:var(--success)">✅</span>'; statusIcons.innerHTML = html; }
  });
  if ((searchContextMode === 'fav' && type === 'fav' && !isActive) || (searchContextMode === 'seen' && type === 'seen' && !isActive)) { if(currentMode === 'search') searchMangas(true); else { lastListHash = ''; handleRouting(true); } }
  syncCloudData();
}

window.onclick = function(event) {
  const dlModal = document.getElementById('downloadModal'); 
  const alertModal = document.getElementById('customAlertModal');
  const authModal = document.getElementById('authModal'); 
  const logoutModal = document.getElementById('logoutModal');
  const editProfileModal = document.getElementById('editProfileModal'); 
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.querySelector('.menu-btn');
  const friendsListModal = document.getElementById('friendsListModal');
  const filterPanel = document.getElementById('filterPanel');
  const filterBtn = document.getElementById('filterBtn');
  const notiPanel = document.getElementById('notiPanel');
  const notiBtn = document.getElementById('notiBtn');
  if (notiPanel && notiPanel.style.display === 'block') {
      if (!notiPanel.contains(event.target) && event.target !== notiBtn && (!notiBtn || !notiBtn.contains(event.target))) {
          notiPanel.style.display = 'none';
      }
  }
  
  // NUEVO: Atrapamos el modal de subir aportes
  const aporteModal = document.getElementById('aporteModal');

  // Cerramos los modales si el clic fue en el fondo oscuro
  if (event.target === dlModal) closeDownloadModal(); 
  if (event.target === alertModal) closeCustomAlert();
  if (event.target === authModal) closeAuthModal(); 
  if (event.target === logoutModal) closeLogoutModal();
  if (event.target === editProfileModal) closeEditProfileModal();
  if (event.target === friendsListModal) closeFriendsList();
  
  // NUEVO: Cerramos el modal de creador si se hace clic fuera
  if (event.target === aporteModal) closeAporteModal();

  // Cerrar el panel de filtros si haces clic en cualquier otro lado
  if (filterPanel && filterPanel.style.display === 'block') {
      if (!filterPanel.contains(event.target) && event.target !== filterBtn && !filterBtn.contains(event.target)) {
          filterPanel.style.display = 'none';
          document.body.style.overflow = ""; // <-- ¡SOLUCIÓN: Devuelve el scroll!
      }
  }

  // Cierra el menú lateral si haces clic afuera
  if (sidebar && sidebar.classList.contains('open') && !sidebar.contains(event.target) && menuBtn && !menuBtn.contains(event.target)) {
      sidebar.classList.remove('open');
  }
}

// ==========================================
// SISTEMA DE CHAT PRIVADO
// ==========================================
let chatInterval = null;
let currentChatUser = '';

async function openChat(username) {
  if (!currentUser) return;
  currentChatUser = username;
  
  const chatTitle = document.getElementById('chatTitle'); if(chatTitle) chatTitle.innerText = `💬 Chat con ${username}`;
  const chatModal = document.getElementById('chatModal'); if(chatModal) chatModal.style.display = 'flex';
  const chatInput = document.getElementById('chatInput'); if(chatInput) chatInput.value = '';
  const chatMessages = document.getElementById('chatMessages'); if(chatMessages) chatMessages.innerHTML = '<div style="text-align:center; color:var(--text-main); margin-top:20px;">Cargando mensajes... ⏳</div>';
  
  if(chatInput) chatInput.onkeypress = (e) => { if(e.key === 'Enter') sendChatMessage(username); };
  const btnSendMsg = document.getElementById('btnSendMsg'); if(btnSendMsg) btnSendMsg.onclick = () => sendChatMessage(username);
  
  await supabaseApp.from('mensajes').update({ leido: true }).eq('emisor', username).eq('receptor', currentUser.usuario).eq('leido', false);
  checkUnreadMessages(); 
  
  fetchChatMessages();
  chatInterval = setInterval(fetchChatMessages, 3000); 
}

function closeChat() {
  const chatModal = document.getElementById('chatModal'); if(chatModal) chatModal.style.display = 'none';
  clearInterval(chatInterval);
  currentChatUser = '';
}

async function fetchChatMessages() {
  if (!currentChatUser || !currentUser) return;
  
  const { data, error } = await supabaseApp.from('mensajes')
      .select('*')
      .in('emisor', [currentUser.usuario, currentChatUser])
      .in('receptor', [currentUser.usuario, currentChatUser])
      .order('created_at', { ascending: true });
      
  if (error) return;
  
  const chatBox = document.getElementById('chatMessages');
  if(!chatBox) return;
  const isScrolledToBottom = chatBox.scrollHeight - chatBox.clientHeight <= chatBox.scrollTop + 20;
  
  let html = '';
  data.forEach(msg => {
      const isMe = msg.emisor === currentUser.usuario;
      const align = isMe ? 'flex-end' : 'flex-start';
      const bgColor = isMe ? 'var(--accent-1)' : 'var(--bg-main)';
      const textColor = isMe ? '#000' : '#FFF';
      const borderRadius = isMe ? '15px 15px 0 15px' : '15px 15px 15px 0';
      const borderLine = isMe ? 'none' : '1px solid var(--border-color)';
      
      html += `
        <div style="display: flex; flex-direction: column; align-items: ${align}; width: 100%;">
           <div style="max-width: 75%; padding: 12px 16px; background: ${bgColor}; color: ${textColor}; border-radius: ${borderRadius}; border: ${borderLine}; font-size: 0.95em; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
              ${msg.texto}
           </div>
        </div>
      `;
  });
  
  chatBox.innerHTML = html || '<div style="text-align:center; color:var(--text-main); margin-top: 20px;">¡Comienza la conversación! 👋</div>';
  if (isScrolledToBottom || data.length === 0) chatBox.scrollTop = chatBox.scrollHeight;
}

// ==========================================
// VENTANA DE AMIGOS Y CONTACTOS
// ==========================================
async function openFriendsList() {
  if (!currentUser) return;
  const sidebar = document.getElementById('sidebar'); if(sidebar) sidebar.classList.remove('open'); 
  
  let myFollowers = currentUser.seguidores || [];
  let myFollowing = currentUser.siguiendo || [];
  let friends = myFollowers.filter(user => myFollowing.includes(user));
  
  const container = document.getElementById('friendsListContainer');
  if(container) container.innerHTML = '<div style="text-align:center; color:var(--text-main); padding: 20px;">Cargando agenda... ⏳</div>';
  const friendsListModal = document.getElementById('friendsListModal'); if(friendsListModal) friendsListModal.style.display = 'flex';

  const { data: unreadData } = await supabaseApp.from('mensajes').select('emisor').eq('receptor', currentUser.usuario).eq('leido', false);
  const unreadSenders = unreadData ? unreadData.map(m => m.emisor) : [];

  if(container) {
      if (friends.length === 0) {
         container.innerHTML = `
            <div style="text-align:center; padding: 20px;">
              <div style="font-size: 3em; margin-bottom: 10px;">😢</div>
              <p style="color:var(--text-main); font-size: 1.1em;">Aún no tienes amigos agregados.</p>
              <p style="color:var(--text-main); font-size: 0.9em; margin-top: 10px;">¡Interactúa en los comentarios y sigue a otros usuarios para comenzar a chatear!</p>
            </div>`;
      } else {
         let html = '';
         friends.forEach(friend => {
            const hasUnread = unreadSenders.includes(friend);
            const redDotHtml = hasUnread ? `<span style="display:inline-block; width:10px; height:10px; background:var(--danger); border-radius:50%; margin-left:8px; box-shadow: 0 0 8px var(--danger);"></span>` : '';

            html += `
              <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 12px 15px; border-radius: 12px; border: 1px solid ${hasUnread ? 'var(--danger)' : 'var(--border-color)'};">
                <span style="font-weight: bold; color: #FFF; font-size: 1.1em; cursor: pointer;" title="Ver perfil" onclick="closeFriendsList(); window.location.hash='user/${friend}'">👤 ${friend} ${redDotHtml}</span>
                <button class="btn-read" style="width: auto; padding: 8px 15px; background: var(--accent-1); color: #000; font-size: 0.9em;" onclick="closeFriendsList(); openChat('${friend}')">💬 Mensaje</button>
              </div>
            `;
         });
         container.innerHTML = html;
      }
  }
}

function closeFriendsList() {
  const friendsListModal = document.getElementById('friendsListModal'); if(friendsListModal) friendsListModal.style.display = 'none';
}

async function sendChatMessage(receptor) {
  const input = document.getElementById('chatInput');
  if(!input) return;
  const texto = input.value.trim();
  if (!texto) return;
  
  input.value = '';
  
  const chatBox = document.getElementById('chatMessages');
  if(chatBox) {
      chatBox.innerHTML += `
        <div style="display: flex; flex-direction: column; align-items: flex-end; width: 100%; opacity: 0.6;">
           <div style="max-width: 75%; padding: 12px 16px; background: var(--accent-1); color: #000; border-radius: 15px 15px 0 15px; font-size: 0.95em;">
              ${texto}
           </div>
        </div>
      `;
      chatBox.scrollTop = chatBox.scrollHeight;
  }
  
  await supabaseApp.from('mensajes').insert([{
      emisor: currentUser.usuario,
      receptor: receptor,
      texto: texto
  }]);
  
  fetchChatMessages();
}

// ==========================================
// SISTEMA DE NOTIFICACIONES DE CHAT
// ==========================================
let unreadInterval = null;

async function checkUnreadMessages() {
  if (!currentUser) return;
  
  const { count, error } = await supabaseApp.from('mensajes')
    .select('*', { count: 'exact', head: true })
    .eq('receptor', currentUser.usuario)
    .eq('leido', false);
    
  const badge = document.getElementById('unreadBadge');
  if (badge) {
     if (count > 0) badge.style.display = 'block';
     else badge.style.display = 'none';
  }
}

function startUnreadTracker() {
  clearInterval(unreadInterval);
  checkUnreadMessages();
  if (currentUser) fetchNotificaciones(); // Revisión inicial

  unreadInterval = setInterval(() => {
      checkUnreadMessages();
      if (currentUser) fetchNotificaciones(); // Revisión automática cada 40s
  }, 40000); 
}
// ==========================================
// VENTANA DE LISTA DE USUARIOS
// ==========================================
function openUserListModal(title, usersJson) {
  const users = JSON.parse(decodeURIComponent(usersJson));
  const modalTitle = document.getElementById('userListModalTitle'); if(modalTitle) modalTitle.innerText = title;
  const container = document.getElementById('userListContainer');
  
  if(container) {
      if (users.length === 0) {
          container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-main);">La lista está vacía.</div>`;
      } else {
          let html = '';
          users.forEach(u => {
              html += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 12px 15px; border-radius: 12px; border: 1px solid var(--border-color);">
                  <span style="font-weight: bold; color: #FFF; font-size: 1.1em; cursor: pointer;" title="Ver perfil" onclick="closeUserListModal(); window.location.hash='user/${u}'">👤 ${u}</span>
                </div>
              `;
          });
          container.innerHTML = html;
      }
  }
  const userListModal = document.getElementById('userListModal'); if(userListModal) userListModal.style.display = 'flex';
}

function closeUserListModal() {
  const userListModal = document.getElementById('userListModal'); if(userListModal) userListModal.style.display = 'none';
}

// ==========================================
// SISTEMA DE INSTALACIÓN NATIVA (APP / PWA)
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('MangaJH listo para instalación nativa'))
      .catch(err => console.log('Error SW:', err));
  });
}

// ==========================================
// SISTEMA DE CALIFICACIONES (ESTRELLAS)
// ==========================================
async function renderRatingUI(mangaId) {
  const box = document.getElementById(`ratingBox`);
  if(!box) return;

  const { data, error } = await supabaseApp.from('calificaciones').select('*').eq('manga_id', mangaId);
  
  if (error) { box.innerHTML = `<div style="color:var(--danger); font-size:0.9em;">Error al cargar</div>`; return; }

  let totalVotos = data.length;
  let suma = data.reduce((acc, curr) => acc + curr.puntuacion, 0);
  let promedio = totalVotos > 0 ? (suma / totalVotos).toFixed(1) : "0.0";

  let miVoto = 0;
  if (currentUser) {
      const votoGuardado = data.find(r => r.usuario === currentUser.usuario);
      if (votoGuardado) miVoto = votoGuardado.puntuacion;
  }

  let starsHtml = `<div class="stars">`;
  for(let i = 5; i >= 1; i--) {
      let activeClass = (miVoto >= i) ? 'active' : '';
      starsHtml += `<button class="star-btn ${activeClass}" onclick="rateManga('${mangaId}', ${i})">★</button>`;
  }
  starsHtml += `</div>`;

  // HTML minimalista con icono de estrella en el promedio
  box.innerHTML = `
      ${starsHtml}
      <div class="rating-info">
          <span class="rating-avg"><span style="color: var(--star); margin-right: 4px;">★</span>${promedio}</span>
          <span class="rating-count">(${totalVotos})</span>
      </div>
  `;
}

async function rateManga(mangaId, score) {
  if (!currentUser) { openAuthModal(); return; }

  const box = document.getElementById(`ratingBox`);
  box.style.opacity = '0.5'; // Efecto visual de carga

  // Usamos upsert: si ya existe manga_id + usuario, lo actualiza. Si no, lo inserta.
  const { error } = await supabaseApp.from('calificaciones').upsert(
      { manga_id: mangaId, usuario: currentUser.usuario, puntuacion: score },
      { onConflict: 'manga_id, usuario' }
  );

  box.style.opacity = '1';

  if (error) { 
      showCustomAlert("Hubo un error al guardar tu calificación."); 
  } else { 
      showCustomAlert("¡Gracias por tu voto! ⭐");
      renderRatingUI(mangaId); // Recargamos las estrellas para actualizar el promedio
  }
}

function getStatusDot(status) {
  let s = String(status || 'emision').toLowerCase();
  
  // Hicimos la etiqueta ligeramente más pequeña y le quitamos el margen izquierdo
  let wrapperStyle = "display: inline-flex; align-items: center; gap: 5px; font-size: 9px; font-weight: bold; color: #FFF; background: rgba(0,0,0,0.6); padding: 4px 8px; border-radius: 12px; vertical-align: middle; border: 1px solid var(--border-color); letter-spacing: 0.5px; text-transform: uppercase;";
  
  let dotStyle = "margin-left: 0;";

  if (s === 'finalizado') {
    return `<span style="${wrapperStyle}"><span class="status-dot status-finalizado" style="${dotStyle}"></span> Finalizado</span>`;
  }
  if (s === 'pausado') {
    return `<span style="${wrapperStyle}"><span class="status-dot status-pausado" style="${dotStyle}"></span> Pausado</span>`;
  }
  
  return `<span style="${wrapperStyle}"><span class="status-dot status-emision" style="${dotStyle}"></span> En Emisión</span>`; 
}

// ==========================================
// SISTEMA DE FILTROS AVANZADOS
// ==========================================

function openFilterModal() {
  const modal = document.getElementById('filterModal');
  if(modal) modal.style.display = 'flex';
  
  // Cargar los géneros automáticamente si aún no se han cargado
  const grid = document.getElementById('filterGenresGrid');
  if(grid && grid.innerHTML.trim() === '') {
    let html = '';
    definedGenres.forEach(g => {
      html += `
        <label style="display:flex; align-items:center; gap:6px; font-size:0.9em; color:var(--text-main); cursor:pointer;">
          <input type="checkbox" class="filter-genre-cb" value="${g}" style="accent-color: var(--accent-1); width: 16px; height: 16px; cursor:pointer;">
          ${g}
        </label>`;
    });
    grid.innerHTML = html;
  }
}

function closeFilterModal() {
  const modal = document.getElementById('filterModal');
  if(modal) modal.style.display = 'none';
}

// ==========================================
// SISTEMA DE FILTROS INTELIGENTE (UNIFICADO)
// ==========================================

function toggleFilterPanel() {
  const panel = document.getElementById('filterPanel');
  if (panel.style.display === 'block') {
      panel.style.display = 'none';
      document.body.style.overflow = ""; // Devuelve el scroll
  } else {
      panel.style.display = 'block';
      if (window.innerWidth <= 768) document.body.style.overflow = "hidden"; // Bloquea fondo en celulares
      
      // Llenar los botones de géneros (combina los del catálogo oficial y la comunidad)
      const grid = document.getElementById('group-generos');
      if(grid && grid.innerHTML.trim() === '') {
          let html = '';
          let todosLosGeneros = [...new Set([...(typeof aporteAvailableGenres !== 'undefined' ? aporteAvailableGenres : []), ...definedGenres])].sort();
          todosLosGeneros.forEach(g => {
              html += `<button class="filter-pill" onclick="this.classList.toggle('active')" data-value="${g}">${g}</button>`;
          });
          grid.innerHTML = html;
      }
  }
}

function selectSinglePill(btn) {
  Array.from(btn.parentElement.children).forEach(sibling => sibling.classList.remove('active'));
  btn.classList.add('active');
}

function applyFilters() {
  const panel = document.getElementById('filterPanel');
  if(panel) panel.style.display = 'none';

  // ¡AQUÍ ES DONDE LO PONES! 👇 Quita el candado del scroll
  document.body.style.overflow = "";

  // 1. Recolectar lo que el usuario seleccionó
  const tipos = Array.from(document.querySelectorAll('#group-tipos .filter-pill.active')).map(b => b.dataset.value);
  const estados = Array.from(document.querySelectorAll('#group-estado .filter-pill.active')).map(b => b.dataset.value);
  const generos = Array.from(document.querySelectorAll('#group-generos .filter-pill.active')).map(b => b.dataset.value);
  const ordenBtn = document.querySelector('#group-orden .filter-pill.active');
  const orden = ordenBtn ? ordenBtn.dataset.value : null;

  // ... (el resto de tu código hacia abajo se queda igual) ...

  const viewTitle = document.getElementById('viewTitle'); 
  const sidebar = document.getElementById('sidebar'); if(sidebar) sidebar.classList.remove('open'); 

  // ==========================================
  // 📍 MODO 1: SI ESTAMOS EN APORTES (COMUNIDAD)
  // ==========================================
  if (currentMode === 'aportes' || currentMode === 'search_aportes') {
      let filteredData = [...(window.aportesData || [])];
      
      if (tipos.length > 0) filteredData = filteredData.filter(m => tipos.includes(m.format) || tipos.includes(m.formato));
      if (estados.length > 0) filteredData = filteredData.filter(m => estados.includes(String(m.status || m.estado || 'emision').toLowerCase()));
      if (generos.length > 0) {
          filteredData = filteredData.filter(m => {
              let g = Array.isArray(m.genres) ? m.genres : (m.genero ? m.genero.split(',').map(x=>x.trim()) : []);
              return generos.some(gen => g.includes(gen)); 
          });
      }
      
      if (orden === 'recientes' || orden === 'popularidad' || orden === 'calificacion') {
          // La comunidad por ahora ordena todo por el más reciente
          filteredData.sort((a,b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
      }

      renderAportesList(filteredData);
      currentMode = 'search_aportes';
      return; // 🛑 Detenemos aquí para no afectar el catálogo oficial
  }

  // ==========================================
  // 📍 MODO 2: SI ESTAMOS EN EL INICIO (CATÁLOGO OFICIAL)
  // ==========================================
  hideAllAreas();
  currentMode = 'search'; 
  lastListHash = 'search'; 
  clearInterval(mainFeaturedInterval); 
  document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active')); 
  
  if(viewTitle) {
      viewTitle.style.display = "block";
      viewTitle.innerHTML = `<div class="genre-header-wrapper"><button class="btn-back-genre" onclick="forceHome()">‹ Volver</button><span style="display:flex; align-items:center; gap:10px;">🎛️ Resultados del Filtro</span></div>`;
  }

  let filteredData = [...mangaData];

  if (tipos.length > 0) filteredData = filteredData.filter(m => tipos.includes(m.format));
  if (estados.length > 0) filteredData = filteredData.filter(m => matchesSelectedStatus(m.status || m.estado || 'emision', estados));
  if (generos.length > 0) {
      filteredData = filteredData.filter(m => {
          if (!Array.isArray(m.genres)) return false;
          return generos.some(g => m.genres.includes(g)); 
      });
  }

  if (orden === 'popularidad') {
      filteredData.sort((a, b) => {
          let aScore = top10Ids.includes(a.id) ? 1 : 0;
          let bScore = top10Ids.includes(b.id) ? 1 : 0;
          return bScore - aScore;
      });
  } else if (orden === 'recientes') {
      filteredData.reverse(); 
  } else if (orden === 'calificacion') {
      filteredData.sort((a, b) => {
          let aVal = a.badge === 'nuevo' ? 2 : (a.badge === 'actualizado' ? 1 : 0);
          let bVal = b.badge === 'nuevo' ? 2 : (b.badge === 'actualizado' ? 1 : 0);
          return bVal - aVal;
      });
  }

  const appFooter = document.getElementById('appFooter');
  if (appFooter) appFooter.style.display = 'none';

  renderGridView(filteredData, false, true);
}

// ==========================================
// MENÚ DE COMENTARIOS (BORRAR / REPORTAR)
// ==========================================

function toggleCommentMenu(menuId) {
   // Cierra todos los otros menús abiertos para que no se amontonen
   document.querySelectorAll('.comment-dropdown').forEach(d => { if(d.id !== menuId) d.style.display = 'none'; });
   
   // Abre el que acabas de clickear
   const menu = document.getElementById(menuId);
   if(menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Escuchador global: Si das clic en cualquier otra parte de la pantalla, los menús se cierran
document.addEventListener('click', (e) => {
   if(!e.target.closest('.menu-container')) {
       document.querySelectorAll('.comment-dropdown').forEach(d => d.style.display = 'none');
   }
});

async function deleteComment(commentId, mangaId) {
   if (!confirm("⚠️ ¿Estás seguro de que quieres eliminar este comentario? No podrás recuperarlo.")) return;
   
   // Borramos el comentario. (Como usamos ON DELETE CASCADE en Supabase, si borras un comentario principal, todas sus respuestas se borran solas).
   const { error } = await supabaseApp.from('comentarios').delete().eq('id', commentId);
   
   if (error) { 
       showCustomAlert("Hubo un error al intentar eliminar el comentario."); 
       return; 
   }
   
   showCustomAlert("Comentario eliminado correctamente.");
   fetchComments(mangaId);
}

async function reportComment(commentId) {
   if (!currentUser) { openAuthModal(); return; }
   if (!confirm("🚩 ¿Deseas reportar este comentario por contenido inapropiado o spam?")) return;
   
   const { error } = await supabaseApp.from('reportes').insert([{ 
       comentario_id: commentId, 
       reportador: currentUser.usuario 
   }]);
   
   if (error) { 
       showCustomAlert("Hubo un error o es probable que ya hayas reportado este comentario anteriormente."); 
   } else {
       showCustomAlert("¡Gracias! Comentario reportado. Un administrador lo revisará pronto.");
   }
}

// ==========================================
// NUEVO: MOSTRAR/OCULTAR CAJA DE ANÓNIMO
// ==========================================
function toggleAnonInput() {
    const isAnon = document.getElementById('newPostAnon').checked;
    const input = document.getElementById('anonNameInput');
    if (input) {
        input.style.display = isAnon ? 'block' : 'none';
        if (!isAnon) input.value = ''; // Limpiamos si se arrepiente
    }
}

// 1. FUNCIÓN PARA PUBLICAR (AHORA CON MODO INCÓGNITO)
async function publishForoPost() {
    if (!currentUser) { showCustomAlert("Debes iniciar sesión para publicar."); return; }

    const input = document.getElementById('newPostContent');
    const spoilerCheck = document.getElementById('newPostSpoiler');
    const anonCheck = document.getElementById('newPostAnon');
    const anonInput = document.getElementById('anonNameInput');
    const btn = document.getElementById('btnPublishPost');

    const text = input.value.trim();
    if (!text) { showCustomAlert("¡No puedes publicar un mensaje vacío!"); return; }

    btn.innerText = "Publicando..."; btn.disabled = true;

    // Preparamos los datos
    const esAnonimo = anonCheck ? anonCheck.checked : false;
    let aliasAnonimo = null;
    if (esAnonimo && anonInput) {
        aliasAnonimo = anonInput.value.trim() || 'Desconocido'; // Si no pone nombre, le ponemos 'Desconocido'
    }

    const { error } = await supabaseApp.from('foro_publicaciones').insert([{
        autor: currentUser.usuario,
        contenido: text,
        tiene_spoiler: spoilerCheck.checked,
        es_anonimo: esAnonimo,
        nombre_anonimo: aliasAnonimo
    }]);

    btn.innerText = "Publicar"; btn.disabled = false;

    if (error) { showCustomAlert("Hubo un error al publicar."); return; }

    // Limpiamos todo
    input.value = '';
    spoilerCheck.checked = false;
    if (anonCheck) { anonCheck.checked = false; toggleAnonInput(); }
    showCustomAlert("¡Publicación exitosa!");
    loadForoPosts(); 
}

// 2. FUNCIÓN PARA DESCARGAR (AHORA OCULTA A LOS ANÓNIMOS)
// 2. FUNCIÓN PARA DESCARGAR (AHORA CON CAJA DE COMENTARIOS INCLUIDA)
// 2. FUNCIÓN PARA DESCARGAR (AHORA PREPARADA PARA HILOS DE RESPUESTAS)
// 2. FUNCIÓN PARA DESCARGAR (AHORA CON RECARGA SILENCIOSA ANTI-PARPADEO)
async function loadForoPosts(isSilent = false) {
    const feed = document.getElementById('foroFeed');
    if (!feed) return;
    
    if (isSilent) {
        let isInteracting = false;
        document.querySelectorAll('#foroView textarea, #foroView input[type="text"]').forEach(input => {
            if (input.value.trim().length > 0 || document.activeElement === input) isInteracting = true;
        });
        document.querySelectorAll('#foroView .comment-dropdown').forEach(menu => {
            if (menu.style.display === 'block') isInteracting = true;
        });
        if (isInteracting) return; 
    }

    let openComments = [];
    if (isSilent) {
        document.querySelectorAll('div[id^="foro-comments-"]').forEach(div => {
            if (div.style.display === 'block') openComments.push(div.id.replace('foro-comments-', ''));
        });
    }

    if (!isSilent) {
        feed.innerHTML = '<div style="text-align:center; padding: 30px; color: var(--accent-1); font-size: 1.1em;">Cargando comunidad... ⏳</div>';
    }

    const { data: posts, error } = await supabaseApp.from('foro_publicaciones').select(`*, lectores ( avatar_url )`).order('fecha_creacion', { ascending: false }).limit(50);
    if (error) { if(!isSilent) feed.innerHTML = '<div style="text-align:center; color: var(--danger);">Error al cargar.</div>'; return; }
    if (!posts || posts.length === 0) { if(!isSilent) feed.innerHTML = '<div style="text-align:center; color: var(--text-main); padding: 30px;">Aún no hay publicaciones.</div>'; return; }

    let html = '';
    posts.forEach(post => {
        let dateObj = new Date(post.fecha_creacion);
        let dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        let contentHtml = post.contenido.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if (post.tiene_spoiler) contentHtml = `<span class="spoiler-text" onclick="this.classList.toggle('revealed')" title="Toca para revelar el spoiler">${contentHtml}</span>`;
        const isMyPost = currentUser && currentUser.usuario === post.autor;

        let displayName = post.autor;
        let avatarStyle = (post.lectores && post.lectores.avatar_url) ? `background-image: url('${post.lectores.avatar_url}');` : `background-color: var(--accent-1);`;
        let avatarContent = ''; 
        let clickAction = `style="cursor: pointer;" onclick="window.location.hash='user/${post.autor}'" title="Ver perfil"`;
        let hoverAction = `onmouseover="this.style.color='var(--accent-1)'" onmouseout="this.style.color='#FFF'"`;

        if (post.es_anonimo) {
            displayName = post.nombre_anonimo ? post.nombre_anonimo : 'Anónimo';
            avatarStyle = `background-color: #111; display: flex; align-items: center; justify-content: center; font-size: 1.5em; border-color: #555;`;
            avatarContent = '🕶️';
            clickAction = `style="cursor: default;" title="Usuario Misterioso"`; 
            hoverAction = ``; 
        }

        let displayComments = openComments.includes(post.id) ? 'block' : 'none';

        // AQUÍ ESTÁ EL ID DEL POST
        html += `
        <div class="post-card" id="foro-post-${post.id}">
            <div class="post-header" style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <div class="post-avatar" style="${avatarStyle}" ${clickAction}>${avatarContent}</div>
                    <div>
                        <h4 class="post-author-name" ${clickAction} ${hoverAction}>${displayName}</h4>
                        <p class="post-date">${dateStr}</p>
                    </div>
                </div>
                
                <div class="menu-container" style="position: relative;">
                    <button style="background:none; border:none; color:var(--text-main); font-size:1.2em; cursor:pointer; padding:0 5px;" onclick="toggleCommentMenu('menu-post-${post.id}')">⋮</button>
                    <div id="menu-post-${post.id}" class="comment-dropdown" style="display:none; position:absolute; right:0; top:100%; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; z-index:100; min-width:130px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); overflow:hidden; text-align:left;">
                      ${ isMyPost 
                        ? `<div style="padding:10px; color:var(--danger); cursor:pointer; font-size:0.9em; transition: 0.2s;" onmouseover="this.style.background='rgba(255,0,0,0.1)'" onmouseout="this.style.background='transparent'" onclick="deleteForoPost('${post.id}')">🗑️ Eliminar</div>`
                        : `<div style="padding:10px; color:var(--text-main); cursor:pointer; font-size:0.9em; transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'" onclick="reportForoPost('${post.id}')">🚩 Reportar</div>`
                      }
                    </div>
                </div>
            </div>
            
            <div class="post-content">${contentHtml}</div>
            
            <div class="post-footer-actions">
                <button class="post-btn" onclick="likePost('${post.id}')" id="btnLike_${post.id}">❤️ <span id="likeCount_${post.id}">${post.likes || 0}</span></button>
                <button class="post-btn" onclick="toggleForoComments('${post.id}', ${post.es_anonimo}, '${post.autor}')">💬 Comentar</button>
                <button class="post-btn" onclick="openSuperCommentModal('${post.id}', '${post.autor}')" style="color: var(--star);">💎 ${post.monedas_recibidas || 0}</button>
            </div>

            <div id="foro-comments-${post.id}" style="display: ${displayComments}; margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                <div id="foro-comments-list-${post.id}" style="margin-bottom: 15px; display: flex; flex-direction: column; gap: 10px;">
                </div>
                
                <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
                    <textarea id="foro-comment-input-${post.id}" class="comment-textarea" style="min-height: 50px; margin-bottom: 10px; font-size: 0.9em;" placeholder="Escribe un comentario..."></textarea>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <label class="spoiler-checkbox" style="color: var(--text-main);" id="foro-anon-label-${post.id}">
                                <input type="checkbox" id="foro-anon-check-${post.id}" onchange="toggleForoAnonComment('${post.id}')">
                                <span>🕵️ Anónimo</span>
                            </label>
                            <input type="text" id="foro-anon-name-${post.id}" class="search-box" style="display: none; width: 120px; padding: 5px 10px; font-size: 0.8em; height: 30px;" placeholder="Tu alias" maxlength="15">
                        </div>
                        <button id="btn-submit-foro-${post.id}" class="btn-submit-comment" style="padding: 6px 15px; font-size: 0.85em;" onclick="submitForoComment('${post.id}', null, ${post.es_anonimo}, '${post.autor}')">Enviar</button>
                    </div>
                </div>
            </div>
        </div>`;
    });
    feed.innerHTML = html;

    if (isSilent && openComments.length > 0) {
        openComments.forEach(postId => {
            const post = posts.find(p => p.id === postId);
            if (post) {
                loadForoComments(postId, post.es_anonimo, post.autor, true); 
            }
        });
    }
    
    // AQUÍ LLAMAMOS AL SCROLL AL TERMINAR DE DIBUJAR
    if(typeof executePendingScroll === 'function') executePendingScroll();
}

// ==========================================
// NUEVO: FUNCIONES DE MODERACIÓN DEL FORO
// ==========================================

async function deleteForoPost(postId) {
   if (!confirm("⚠️ ¿Estás seguro de que quieres eliminar esta publicación? No podrás recuperarla.")) return;
   
   // Borramos la publicación de Supabase
   const { error } = await supabaseApp.from('foro_publicaciones').delete().eq('id', postId);
   
   if (error) { 
       showCustomAlert("Hubo un error al intentar eliminar la publicación."); 
       return; 
   }
   
   showCustomAlert("Publicación eliminada correctamente.");
   loadForoPosts(); // Refrescamos el muro
}

async function reportForoPost(postId) {
   if (!currentUser) { openAuthModal(); return; }
   if (!confirm("🚩 ¿Deseas reportar esta publicación por contenido inapropiado o spam?")) return;
   
   const { error } = await supabaseApp.from('foro_reportes').insert([{ 
       publicacion_id: postId, 
       reportador: currentUser.usuario 
   }]);
   
   if (error) { 
       showCustomAlert("Hubo un error o es probable que ya hayas reportado esta publicación."); 
   } else {
       showCustomAlert("¡Gracias! Publicación reportada. Un administrador la revisará pronto.");
   }
}

// 3. FUNCIÓN PARA DAR LIKES (Protegida contra multicuentas)
// 3. FUNCIÓN PARA DAR LIKES (Protegida contra multicuentas)
async function likePost(postId) {
    if (!currentUser) {
        showCustomAlert("Inicia sesión para dar Like.");
        return;
    }
    
    const btn = document.getElementById(`btnLike_${postId}`);
    const countSpan = document.getElementById(`likeCount_${postId}`);
    
    // 1. Intentamos guardar el like en la tabla invisible
    const { error: likeError } = await supabaseApp.from('foro_likes').insert([
        { publicacion_id: postId, autor: currentUser.usuario }
    ]);

    if (likeError) {
        showCustomAlert("¡Ya le diste like a esta publicación! ❤️");
        return;
    }

    // 2. Si funcionó, sumamos 1 a la publicación en tiempo real
    let currentLikes = parseInt(countSpan.innerText);
    let nuevosLikes = currentLikes + 1;
    
    // Actualizamos visualmente al instante (para que no haya lag)
    countSpan.innerText = nuevosLikes;
    btn.classList.add('liked');
    
    // Actualizamos en la base de datos por detrás
    await supabaseApp.from('foro_publicaciones').update({ likes: nuevosLikes }).eq('id', postId);

    // Disparar Notificación con la ruta EXACTA al Post
    const { data: pData } = await supabaseApp.from('foro_publicaciones').select('autor').eq('id', postId).single();
    if (pData) {
        // AQUÍ ESTABA EL ERROR: Ahora sí manda la coordenada exacta (foro|foro-post-ID)
        sendNotification(currentUser.usuario, pData.autor, 'like', 'le dio ❤️ a tu publicación en el foro.', `foro|foro-post-${postId}`);
    }
}

// ==========================================
// NUEVO: SISTEMA DE HILOS DE COMENTARIOS DEL FORO
// ==========================================

function toggleForoComments(postId, isPostAnon, postAuthor) {
    const container = document.getElementById(`foro-comments-${postId}`);
    if (container.style.display === 'none') {
        container.style.display = 'block';
        loadForoComments(postId, isPostAnon, postAuthor); 
        
        const anonCheck = document.getElementById(`foro-anon-check-${postId}`);
        const anonLabel = document.getElementById(`foro-anon-label-${postId}`);
        
        // Bloqueo de seguridad si soy el creador de un post anónimo
        if (isPostAnon && currentUser && currentUser.usuario === postAuthor) {
            anonCheck.checked = true;
            anonCheck.disabled = true;
            anonLabel.title = "Comentas en anónimo por seguridad ya que tu publicación original lo es.";
            anonLabel.style.opacity = "0.7";
            toggleForoAnonComment(postId);
        }
    } else {
        container.style.display = 'none';
    }
}

// Muestra la cajita de alias para los comentarios principales
function toggleForoAnonComment(postId) {
    const isAnon = document.getElementById(`foro-anon-check-${postId}`).checked;
    const input = document.getElementById(`foro-anon-name-${postId}`);
    if (input) {
        input.style.display = isAnon ? 'block' : 'none';
        if (!isAnon) input.value = '';
    }
}

// Muestra la cajita de alias para las RESPUESTAS a otros comentarios
function toggleForoAnonReply(commentId) {
    const isAnon = document.getElementById(`foro-anon-check-reply-${commentId}`).checked;
    const input = document.getElementById(`foro-anon-name-reply-${commentId}`);
    if (input) {
        input.style.display = isAnon ? 'block' : 'none';
        if (!isAnon) input.value = '';
    }
}

// Abre/Cierra la caja de texto para responderle a alguien
function toggleForoReplyBox(commentId) {
    if (!currentUser) { openAuthModal(); return; }
    const box = document.getElementById(`foro-reply-box-${commentId}`);
    if(box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

// Descarga todos los comentarios y los organiza
async function loadForoComments(postId, isPostAnon, postAuthor, isSilent = false) {
    const list = document.getElementById(`foro-comments-list-${postId}`);
    if (!list) return;
    
    // Solo mostramos el temporizador si NO es una actualización silenciosa
    if (!isSilent) {
        list.innerHTML = '<div style="text-align:center; font-size: 0.85em; color: var(--text-main);">Cargando respuestas... ⏳</div>';
    }
    
    const { data, error } = await supabaseApp.from('foro_comentarios').select(`*, lectores ( avatar_url )`).eq('publicacion_id', postId).order('fecha_creacion', { ascending: true });
    
    if (error) { if(!isSilent) list.innerHTML = '<div style="color: var(--danger);">Error al cargar.</div>'; return; }
    if (data.length === 0) { list.innerHTML = '<div style="text-align:center; font-size: 0.85em; color: var(--text-main);">Sé el primero en responder.</div>'; return; }
    
    const mainComments = data.filter(c => !c.parent_id);
    
    let html = '';
    mainComments.forEach(c => {
        html += buildForoCommentHtml(c, data, postId, isPostAnon, postAuthor, false);
    });
    list.innerHTML = html;
}

// Función RECURSIVA: Se llama a sí misma para crear hilos infinitos de respuestas
// 1. REEMPLAZA ESTA FUNCIÓN COMPLETA (Le agregamos un ID al botón de responder)
function buildForoCommentHtml(c, allData, postId, isPostAnon, postAuthor, isReply = false) {
    let dateObj = new Date(c.fecha_creacion);
    let dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let displayName = c.autor;
    let avatarStyle = (c.lectores && c.lectores.avatar_url) ? `background-image: url('${c.lectores.avatar_url}');` : `background-color: var(--accent-1);`;
    let avatarContent = ''; 
    let clickAction = `style="cursor: pointer;" onclick="window.location.hash='user/${c.autor}'"`;
    let donationBadge = '';
    if (c.donacion === 10) donationBadge = `<span title="Súper Comentario (10 💰)" style="text-shadow: 0 0 5px #FFB74D; margin-left: 5px;">💫</span>`;
    else if (c.donacion === 50) donationBadge = `<span title="Súper Comentario (50 💰)" style="text-shadow: 0 0 5px #81D4FA; margin-left: 5px;">🌟</span>`;
    else if (c.donacion === 100) donationBadge = `<span title="Súper Comentario (100 💰)" style="text-shadow: 0 0 5px #18FFFF; margin-left: 5px;">💎</span>`;
    
    if (c.es_anonimo) {
        displayName = c.nombre_anonimo ? c.nombre_anonimo : 'Anónimo';
        avatarStyle = `background-color: #111; display: flex; align-items: center; justify-content: center; font-size: 1em; border-color: #555;`;
        avatarContent = '🕶️';
        clickAction = `style="cursor: default;"`;
    }

    const isMyComment = currentUser && currentUser.usuario === c.autor;
    const delBtn = isMyComment ? `<button style="background:none; border:none; color:var(--danger); font-size: 0.8em; cursor:pointer; margin-left: 10px;" onclick="deleteForoComment('${c.id}', '${postId}', ${isPostAnon}, '${postAuthor}')">🗑️</button>` : '';

    let forceAnonChecked = ""; let forceAnonDisabled = ""; let forceAnonOpacity = "";
    if (isPostAnon && currentUser && currentUser.usuario === postAuthor) {
        forceAnonChecked = "checked"; forceAnonDisabled = "disabled"; forceAnonOpacity = "opacity: 0.7;";
    }

    let bgStyle = isReply ? "background: var(--bg-main);" : "background: rgba(0,0,0,0.3);";

    // AQUÍ ESTÁ EL ID DEL COMENTARIO DEL FORO
    let html = `
    <div id="foro-com-${c.id}" style="${bgStyle} padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 8px; transition: box-shadow 0.5s;">
        
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div class="post-avatar" style="width: 25px; height: 25px; border-width: 1px; ${avatarStyle}" ${clickAction}>${avatarContent}</div>
                <span style="font-weight: bold; color: var(--accent-1); font-size: 0.9em;" ${clickAction}>${displayName}${donationBadge}</span>
                <span style="font-size: 0.7em; color: var(--text-main);">${dateStr}</span>
            </div>
            ${delBtn}
        </div>
        
        <div style="font-size: 0.9em; color: #FFF; padding-left: 33px; word-wrap: break-word; white-space: pre-wrap; margin-bottom: 8px;">${c.contenido.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        
        <div style="text-align: right; margin-bottom: 5px;">
           <button class="btn-read" style="padding: 4px 12px; font-size: 0.75em; width: auto; background: rgba(255,255,255,0.05); color: #FFF; border: 1px solid rgba(255,255,255,0.1);" onclick="toggleForoReplyBox('${c.id}')">↩ Responder</button>
        </div>
        
        <div id="foro-reply-box-${c.id}" style="display: none; margin-top: 10px; padding-left: 15px; border-left: 2px solid var(--accent-2);">
           <textarea id="foro-reply-input-${c.id}" class="comment-textarea" style="min-height: 50px; margin-bottom: 10px; font-size: 0.85em; padding: 10px;" placeholder="Escribe tu respuesta a ${displayName}..."></textarea>
           
           <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <label class="spoiler-checkbox" style="color: var(--text-main); ${forceAnonOpacity}" title="${forceAnonChecked ? 'Seguridad activada' : ''}">
                        <input type="checkbox" id="foro-anon-check-reply-${c.id}" onchange="toggleForoAnonReply('${c.id}')" ${forceAnonChecked} ${forceAnonDisabled}>
                        <span>🕵️ Anónimo</span>
                    </label>
                    <input type="text" id="foro-anon-name-reply-${c.id}" class="search-box" style="display: ${forceAnonChecked ? 'block' : 'none'}; width: 120px; padding: 5px 10px; font-size: 0.8em; height: 30px;" placeholder="Tu alias" maxlength="15">
                </div>
                <button id="btn-submit-foro-reply-${c.id}" class="btn-submit-comment" style="padding: 5px 12px; font-size: 0.8em;" onclick="submitForoComment('${postId}', '${c.id}', ${isPostAnon}, '${postAuthor}')">Enviar</button>
            </div>
        </div>
    `;

    const children = allData.filter(r => r.parent_id === c.id);
    if (children.length > 0) {
        html += `<div style="margin-top: 10px; padding-left: 15px; border-left: 2px solid rgba(255,255,255,0.1); display: flex; flex-direction: column;">`;
        children.forEach(child => {
            html += buildForoCommentHtml(child, allData, postId, isPostAnon, postAuthor, true);
        });
        html += `</div>`;
    }

    html += `</div>`;
    return html;
} 

// 2. REEMPLAZA ESTA FUNCIÓN COMPLETA (Quitamos el problemático event.target)
async function submitForoComment(postId, parentId = null, isPostAnon, postAuthor) {
    if (!currentUser) { openAuthModal(); return; }
    
    const prefix = parentId ? `foro-reply` : `foro-comment`;
    const suffix = parentId ? parentId : postId;
    
    const input = document.getElementById(`${prefix}-input-${suffix}`);
    const anonCheck = document.getElementById(parentId ? `foro-anon-check-reply-${parentId}` : `foro-anon-check-${postId}`);
    const anonInput = document.getElementById(parentId ? `foro-anon-name-reply-${parentId}` : `foro-anon-name-${postId}`);
    
    // AQUÍ LA SOLUCIÓN: Atrapamos el botón de forma segura con su ID
    const btnId = parentId ? `btn-submit-foro-reply-${parentId}` : `btn-submit-foro-${postId}`;
    const btn = document.getElementById(btnId);
    
    const texto = input.value.trim();
    if (!texto) { showCustomAlert("No puedes enviar una respuesta vacía."); return; }
    
    let originalText = 'Enviar';
    if (btn) {
        originalText = btn.innerText;
        btn.innerText = '...'; 
        btn.disabled = true;
    }
    
    const esAnonimo = anonCheck ? anonCheck.checked : false;
    let aliasAnonimo = null;
    if (esAnonimo && anonInput) {
        aliasAnonimo = anonInput.value.trim() || 'Desconocido';
    }
    
    // --- ESTA ES LA PARTE VITAL QUE SE HABÍA BORRADO ---
    const { error } = await supabaseApp.from('foro_comentarios').insert([{
        publicacion_id: postId,
        parent_id: parentId,
        autor: currentUser.usuario,
        contenido: texto,
        es_anonimo: esAnonimo,
        nombre_anonimo: aliasAnonimo
    }]);

    if (btn) {
        btn.innerText = originalText; 
        btn.disabled = false;
    }
    
    if (error) { showCustomAlert('Error al enviar la respuesta.'); return; }
    // ---------------------------------------------------
    
    // ==========================================
    // NUEVO: NOTIFICAR EN EL FORO CON SCROLL
    // ==========================================
    if (!esAnonimo) { 
        if (parentId) {
            // 1. Si le está respondiendo a otro comentario dentro del post
            const { data: parentCom } = await supabaseApp.from('foro_comentarios').select('autor').eq('id', parentId).single();
            if (parentCom && !parentCom.es_anonimo) {
                sendNotification(currentUser.usuario, parentCom.autor, 'respuesta', 'respondió a tu comentario en el foro.', `foro|foro-com-${parentId}`);
            }
        } else {
            // 2. Si está comentando directamente en la publicación principal
            if (!isPostAnon) {
                sendNotification(currentUser.usuario, postAuthor, 'respuesta', 'comentó en tu publicación del foro.', `foro|foro-post-${postId}`);
            }
        }
    }
    // ==========================================

    input.value = '';
    loadForoComments(postId, isPostAnon, postAuthor);
}

async function deleteForoComment(commentId, postId, isPostAnon, postAuthor) {
    if (!confirm("⚠️ ¿Eliminar tu respuesta? Si alguien te respondió, sus comentarios también se borrarán.")) return;
    await supabaseApp.from('foro_comentarios').delete().eq('id', commentId);
    loadForoComments(postId, isPostAnon, postAuthor);
}

// ==========================================
// SISTEMA DE SÚPER COMENTARIOS (PROPINAS)
// ==========================================

async function openSuperCommentModal(postId, postAuthor) {
    if (!currentUser) { openAuthModal(); return; }
    if (currentUser.usuario === postAuthor) {
        showCustomAlert("¡No puedes darte un Súper Comentario a ti mismo! 🕵️‍♂️");
        return;
    }

    // VERIFICACIÓN: ¿Ya hay 3 Súper Comentarios?
    const { data: superComments } = await supabaseApp.from('foro_comentarios').select('id').eq('publicacion_id', postId).gt('donacion', 0);
    
    if (superComments && superComments.length >= 3) {
        showCustomAlert("🔒 Esta publicación ya alcanzó el límite de 3 Súper Comentarios.");
        return;
    }

    document.getElementById('superCommentPostId').value = postId;
    document.getElementById('superCommentAuthor').value = postAuthor;
    document.getElementById('superCommentAmount').value = "0";
    document.getElementById('superCommentText').value = "";
    
    // Reiniciar los botones
    document.querySelectorAll('.amount-btn').forEach(b => {
        b.style.background = 'var(--bg-main)';
        b.style.color = '#FFF';
    });
    
    const btnSend = document.getElementById('btnSendSuperComment');
    btnSend.style.background = 'var(--bg-main)';
    btnSend.style.color = 'var(--text-main)';
    btnSend.disabled = true;
    btnSend.innerText = "Selecciona un monto";

    document.getElementById('superCommentModal').style.display = 'flex';
}

function closeSuperCommentModal() {
    document.getElementById('superCommentModal').style.display = 'none';
}

function selectDonationAmount(amount) {
    document.getElementById('superCommentAmount').value = amount;
    
    // Estilos de botones
    document.querySelectorAll('.amount-btn').forEach(b => {
        b.style.background = 'var(--bg-main)';
        b.style.color = '#FFF';
    });
    const selectedBtn = document.getElementById(`btn-amount-${amount}`);
    selectedBtn.style.background = 'var(--bg-card)';
    
    let color = '';
    if(amount === 10) color = '#FFB74D';
    if(amount === 50) color = '#81D4FA';
    if(amount === 100) color = '#18FFFF';
    selectedBtn.style.color = color;

    // Habilitar envío
    const btnSend = document.getElementById('btnSendSuperComment');
    btnSend.disabled = false;
    btnSend.style.background = color;
    btnSend.style.color = '#000';
    btnSend.innerText = `Enviar Súper Comentario (${amount} 💰)`;
}

async function submitSuperComment() {
    const postId = document.getElementById('superCommentPostId').value;
    const postAuthor = document.getElementById('superCommentAuthor').value;
    const amount = parseInt(document.getElementById('superCommentAmount').value);
    const texto = document.getElementById('superCommentText').value.trim();
    
    if (!texto) { showCustomAlert("Debes escribir un mensaje para tu Súper Comentario."); return; }
    if (currentUser.monedas < amount) { showCustomAlert("No tienes suficientes monedas. 😢"); return; }

    const btn = document.getElementById('btnSendSuperComment');
    btn.disabled = true; btn.innerText = "Procesando transferencia...";

    // 1. Descontamos las monedas al que dona (localmente y en nube)
    currentUser.monedas -= amount;
    localStorage.setItem('mangaJH_user', JSON.stringify(currentUser));
    updateHeaderUI();
    await supabaseApp.from('lectores').update({ monedas: currentUser.monedas }).eq('usuario', currentUser.usuario);

    // 2. Guardamos el Súper Comentario
    await supabaseApp.from('foro_comentarios').insert([{
        publicacion_id: postId,
        autor: currentUser.usuario,
        contenido: texto,
        donacion: amount
    }]);

    // 3. Le damos las monedas al Autor del post (en secreto, sumando a su cuenta)
    const { data: authorData } = await supabaseApp.from('lectores').select('monedas').eq('usuario', postAuthor).single();
    if (authorData) {
        await supabaseApp.from('lectores').update({ monedas: authorData.monedas + amount }).eq('usuario', postAuthor);
    }

    // 4. Actualizamos el contador público del post
    const { data: postData } = await supabaseApp.from('foro_publicaciones').select('monedas_recibidas').eq('id', postId).single();
    if (postData) {
        await supabaseApp.from('foro_publicaciones').update({ monedas_recibidas: (postData.monedas_recibidas || 0) + amount }).eq('id', postId);
    }

    // Disparar Notificación con coordenada EXACTA
    sendNotification(currentUser.usuario, postAuthor, 'super', `te destacó con un Súper Comentario de ${amount} 💰.`, `foro|foro-post-${postId}`);

    closeSuperCommentModal();
    showCustomAlert(`¡Increíble! Has enviado un Súper Comentario de ${amount} 💰.`);
    loadForoPosts(true); // Recarga silenciosa
}

// ==========================================
// NUEVO: CARGAR POSTS EN EL PERFIL DE USUARIO
// ==========================================
async function loadUserForoPosts(username, containerId, isMyProfile) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { data: posts, error } = await supabaseApp.from('foro_publicaciones')
        .select('*')
        .eq('autor', username)
        .order('fecha_creacion', { ascending: false });

    if (error) { container.innerHTML = '<div style="color: var(--danger);">Error al cargar posts.</div>'; return; }
    
    // 🛡️ FILTRO DE PRIVACIDAD: Si es el perfil de otro, ocultamos sus posts anónimos
    let visiblePosts = posts;
    if (!isMyProfile) {
        visiblePosts = posts.filter(p => !p.es_anonimo);
    }

    if (!visiblePosts || visiblePosts.length === 0) { 
        container.innerHTML = '<div style="color: var(--text-main); padding: 20px; background: rgba(0,0,0,0.2); border-radius: 8px; font-style: italic;">Este usuario aún no ha hecho publicaciones públicas.</div>'; 
        return; 
    }

    let html = '';
    visiblePosts.forEach(post => {
        let dateObj = new Date(post.fecha_creacion);
        let dateStr = dateObj.toLocaleDateString();
        let contentHtml = post.contenido.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if (post.tiene_spoiler) contentHtml = `<span class="spoiler-text" onclick="this.classList.toggle('revealed')">${contentHtml}</span>`;
        
        // Diseño de mini-tarjeta para el perfil
        html += `
        <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 12px; padding: 15px; margin-bottom: 15px; transition: 0.2s;" onmouseover="this.style.borderColor='var(--accent-1)'" onmouseout="this.style.borderColor='var(--border-color)'">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="color: var(--accent-1); font-weight: bold; font-size: 0.85em;">${post.es_anonimo ? '🕵️ Post Anónimo (Solo tú lo ves)' : '🗣️ Post Público'}</span>
                <span style="color: var(--text-main); font-size: 0.75em;">${dateStr}</span>
            </div>
            <div style="color: #FFF; font-size: 0.95em; line-height: 1.4; margin-bottom: 10px; white-space: pre-wrap;">${contentHtml}</div>
            <div style="display: flex; gap: 15px; align-items: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                <span style="color: var(--danger); font-size: 0.8em; font-weight: bold;">❤️ ${post.likes || 0}</span>
                <span style="color: var(--star); font-size: 0.8em; font-weight: bold;">💎 ${post.monedas_recibidas || 0}</span>
                <button style="margin-left: auto; background: none; border: none; color: var(--info); font-size: 0.8em; font-weight: bold; cursor: pointer; text-decoration: underline;" onclick="window.location.hash='foro'">Ver en el Foro</button>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

// ==========================================
// NUEVO: CARGAR OBRAS EN EL PERFIL DE USUARIO
// ==========================================
async function loadUserAportes(username, containerId) {
    const container = document.getElementById(containerId);
    const wrapper = document.getElementById('wrapper-' + containerId); // Buscamos la caja externa
    if (!container) return;

    // Buscamos las obras en Supabase
    const { data: obras, error } = await supabaseApp.from('obras_comunidad')
        .select('*')
        .ilike('autor', username)
        .order('fecha_creacion', { ascending: false });

    // Si hay error o el usuario NO tiene obras, la caja se queda oculta y terminamos.
    if (error || !obras || obras.length === 0) { 
        if (wrapper) wrapper.style.display = 'none';
        return; 
    }

    // ¡Si tiene obras, encendemos la caja para que sea visible!
    if (wrapper) wrapper.style.display = 'block';

    // Dibujamos una mini-galería
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 15px;">';
    
    obras.forEach(obra => {
        let coverImg = (obra.covers && obra.covers.length > 0) ? obra.covers[0] : (obra.portada_url || 'https://via.placeholder.com/110x160/1F2833/66FCF1?text=Sin+Portada');
        const obraTitle = obra.title || obra.titulo;
        
        html += `
        <div style="cursor: pointer; text-align: center; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" onclick="window.location.hash='aporte/${obra.id}'">
            <div style="width: 100%; height: 160px; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: 0 4px 10px rgba(0,0,0,0.3); margin-bottom: 8px; overflow: hidden; background: var(--bg-main);">
               <img src="${coverImg}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
            </div>
            <div style="color: #FFF; font-size: 0.8em; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${obraTitle}">${obraTitle}</div>
        </div>`;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// ==========================================
// SISTEMA DE APORTES DE LA COMUNIDAD (ADMIN STYLE)
// ==========================================

let aporteAvailableGenres = ["Acción", "Aventura", "Comedia", "Drama", "Fantasía", "Isekai", "Mecha", "Misterio", "Psicológico", "Romance", "Sci-Fi", "Seinen", "Shounen", "Slice of Life", "Terror"];
let editingAporteId = null; 

// ABRIR EL MODAL (Reemplaza a showAportesSubView)
function openAporteModal(isEditing = false) {
  if (!currentUser) { showCustomAlert("Debes iniciar sesión para publicar."); openAuthModal(); return; }
  if (!isEditing) clearAporteForm(); 
  if (!isEditing) initAporteForm();
  
  const modal = document.getElementById('aporteModal');
  if (modal) modal.style.display = 'flex';
}

// CERRAR EL MODAL
function closeAporteModal() {
  const modal = document.getElementById('aporteModal');
  if (modal) modal.style.display = 'none';
  editingAporteId = null; // Apagamos el modo edición
}

// CARGAR DATOS PARA EDITAR
async function loadEditAporte(id) {
    if (!currentUser) return;
    showCustomAlert("Cargando datos de la obra... ⏳");
    
    const { data: obra, error } = await supabaseApp.from('obras_comunidad').select('*').eq('id', id).single();
    closeCustomAlert();
    
    if (error || !obra) { showCustomAlert("Error al cargar la obra."); return; }
    
    editingAporteId = id; 
    openAporteModal(true); // Abre el modal en modo edición
    
    document.getElementById('aporteMangaTitle').value = obra.title || obra.titulo || '';
    document.getElementById('aporteMangaFormat').value = obra.format || obra.formato || 'manga';
    document.getElementById('aporteMangaStatus').value = obra.status || obra.estado || 'En Emisión';
    document.getElementById('aporteMangaBadge').value = obra.badge || '';
    document.getElementById('aporteMangaSynopsis').value = obra.synopsis || obra.sinopsis || '';
    if(document.getElementById('aporteAllowEdit')) document.getElementById('aporteAllowEdit').checked = obra.allow_community_edit || false;
    
    updateAporteTerminology();
    
    let genres = obra.genres || [];
    if(typeof genres === 'string') genres = genres.split(',').map(g=>g.trim());
    renderAporteGenresCheckboxes(genres);
    
    const cList = document.getElementById('aporteCoversList');
    cList.innerHTML = '';
    let covers = obra.covers || (obra.portada_url ? [obra.portada_url] : []);
    if(covers.length === 0) addAporteInputRow('aporteCoversList', 'aporte-cover-input', 'URL de la imagen de portada');
    else covers.forEach(c => addAporteInputRow('aporteCoversList', 'aporte-cover-input', 'URL de la imagen de portada', c));

    const bList = document.getElementById('aporteBannersList');
    bList.innerHTML = '';
    let banners = obra.banners || [];
    if(banners.length === 0) addAporteInputRow('aporteBannersList', 'aporte-banner-input', 'URL de la imagen del banner');
    else banners.forEach(b => addAporteInputRow('aporteBannersList', 'aporte-banner-input', 'URL de la imagen del banner', b));

    const chList = document.getElementById('aporteChaptersList');
    chList.innerHTML = '';
    let chapters = obra.chapters || obra.capitulos || [];
    if(chapters.length === 0) addAporteChapterRow();
    else {
        chapters.forEach(cap => {
            let isCap = cap.title && String(cap.title).toLowerCase().includes('cap');
            let rawTitle = cap.title ? cap.title.replace(/^(Capítulo|Tomo|Volumen|Número|Parte|Canto)\s+/i, '').trim() : '';
            addAporteChapterRow(rawTitle, cap.link || '', cap.downloadLink || '', isCap);
        });
    }

    const btnSubmit = document.getElementById('btnSubmitAporteManga');
    if(btnSubmit) { btnSubmit.innerText = "🔄 Actualizar Obra"; btnSubmit.style.background = "var(--info)"; }
}

function initAporteForm() {
  renderAporteGenresCheckboxes();
  const cList = document.getElementById('aporteCoversList');
  if (cList && cList.children.length === 0) addAporteInputRow('aporteCoversList', 'aporte-cover-input', 'URL de la imagen de portada');
  const bList = document.getElementById('aporteBannersList');
  if (bList && bList.children.length === 0) addAporteInputRow('aporteBannersList', 'aporte-banner-input', 'URL de la imagen del banner');
  const chList = document.getElementById('aporteChaptersList');
  if (chList && chList.children.length === 0) addAporteChapterRow();
}

function renderAporteGenresCheckboxes(selected = []) {
  const container = document.getElementById('aporteGenresContainer');
  if (!container) return;
  container.innerHTML = '';
  
  let allGenres = [...new Set([...aporteAvailableGenres, ...definedGenres])].sort();
  allGenres.forEach(genre => {
    const isChecked = selected.includes(genre) ? 'checked' : '';
    const label = document.createElement('label');
    
    // Le damos forma de botón/cajita bonita
    label.style.display = 'inline-flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.background = 'var(--bg-card)';
    label.style.padding = '8px 12px';
    label.style.borderRadius = '8px';
    label.style.border = '1px solid var(--border-color)';
    label.style.fontSize = '0.85em';
    label.style.cursor = 'pointer';
    label.style.color = 'var(--text-main)';
    label.style.transition = '0.2s';

    // Efecto al pasar el mouse por encima
    label.onmouseover = () => label.style.borderColor = 'var(--accent-1)';
    label.onmouseout = () => label.style.borderColor = 'var(--border-color)';

    label.innerHTML = `<input type="checkbox" class="aporte-genre-cb" value="${genre}" ${isChecked} style="width: 16px; height: 16px; accent-color: var(--accent-1); cursor: pointer; margin: 0;"><span>${genre}</span>`;
    container.appendChild(label);
  });
}

function addNewAporteGenre() {
  const input = document.getElementById('aporteNewGenreInput');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  const formatted = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();

  if (!aporteAvailableGenres.includes(formatted)) {
    aporteAvailableGenres.push(formatted);
  }
  const currentSelected = getSelectedAporteGenres();
  currentSelected.push(formatted);
  renderAporteGenresCheckboxes(currentSelected);
  input.value = '';
  showCustomAlert(`Género "${formatted}" añadido correctamente.`);
}

function getSelectedAporteGenres() {
  const checkboxes = document.querySelectorAll('.aporte-genre-cb:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

function addAporteInputRow(listId, inputClass, placeholderTxt, value = '') {
  const list = document.getElementById(listId);
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  div.innerHTML = `<input type="text" class="search-box ${inputClass}" style="flex:1;" placeholder="${placeholderTxt}" value="${value}"><button class="btn-read" style="width:auto; padding:10px 15px; background:var(--danger); color:#FFF;" onclick="this.parentElement.remove()">✕</button>`;
  list.appendChild(div);
}

function addAporteChapterRow(title = '', link = '', dl = '', isChapter = false) {
  const list = document.getElementById('aporteChaptersList');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'dynamic-item aporte-chapter-item';
  
  // Diseño mejorado con 2 opciones: Pegar enlace externo O Subir a Drive
  div.innerHTML = `
    <div style="display: flex; flex-direction: column; width: 100%; gap: 10px; background: rgba(0,0,0,0.25); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
        
        <!-- Fila Superior: Checkbox, Título y Botón Cerrar -->
        <div style="display: flex; gap: 10px; align-items: center;">
            <label style="display:flex; align-items:center; gap:5px; margin:0; cursor:pointer;" title="Marcar si es un Capítulo">
              <input type="checkbox" class="aporte-is-chapter-cb" ${isChapter ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-1); cursor:pointer;">
              <span style="font-size:0.85em; color:var(--accent-1); font-weight:bold;">Cap</span>
            </label>
            <input type="text" class="search-box aporte-chap-title" placeholder="Número o Título (Ej: 1)" style="flex: 1;" value="${title}">
            <button class="btn-read" style="width:auto; padding:8px 12px; background:var(--danger); color:#FFF; margin:0;" onclick="this.closest('.aporte-chapter-item').remove()">✕</button>
        </div>

        <!-- Fila Inferior: Cajita de enlace o Botón de Subida -->
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <input type="text" class="search-box aporte-chap-link" placeholder="Pega un enlace externo..." style="flex: 1; min-width: 150px; font-size: 0.9em;" value="${link}">
            
            <span style="color: var(--text-main); font-size: 0.85em; font-weight: bold;">Ó</span>
            
            <!-- Botón para subir a Drive -->
            <input type="file" class="aporte-chap-file" accept=".pdf" style="display:none;" onchange="uploadPdfToDrive(this)">
            <button class="btn-read btn-file-trigger" style="width: auto; padding: 10px 15px; background: var(--info); color: white; margin: 0; font-size: 0.9em; flex-shrink: 0;" onclick="this.previousElementSibling.click(); return false;" title="Se subirá a Google Drive automáticamente">📁 Subir PDF</button>
        </div>

        <!-- Cajita de descarga oculta por defecto -->
        <input type="text" class="search-box aporte-chap-dl" style="display: none;" value="${dl}">
    </div>
  `;
  list.appendChild(div);
}

function updateAporteTerminology() {
    const format = document.getElementById('aporteMangaFormat').value;
    const label = document.getElementById('labelGestorCaps');
    const inputTitle = document.getElementById('aporteChapTitle');
    const btnAdd = document.getElementById('btnAporteAddCap');
    
    if (format === 'novela') {
        if (label) label.innerText = "Gestor de Volúmenes:";
        if (inputTitle) inputTitle.placeholder = "Nombre (Ej: Volumen 1)";
        if (btnAdd) btnAdd.innerText = "➕ Agregar Volumen";
    } else if (['novela_normal', 'manhwa', 'webnovel', 'fanfic'].includes(format)) {
        if (label) label.innerText = "Gestor de Capítulos:";
        if (inputTitle) inputTitle.placeholder = "Nombre (Ej: Capítulo 1)";
        if (btnAdd) btnAdd.innerText = "➕ Agregar Capítulo";
    } else if (['cuento', 'novela_corta', 'cronica'].includes(format)) {
        if (label) label.innerText = "Gestor de Partes:";
        if (inputTitle) inputTitle.placeholder = "Nombre (Ej: Parte 1)";
        if (btnAdd) btnAdd.innerText = "➕ Agregar Parte";
    } else if (format === 'epopeya') {
        if (label) label.innerText = "Gestor de Cantos:";
        if (inputTitle) inputTitle.placeholder = "Nombre (Ej: Canto 1)";
        if (btnAdd) btnAdd.innerText = "➕ Agregar Canto";
    } else if (format === 'comic') {
        if (label) label.innerText = "Gestor de Cómics/Números:";
        if (inputTitle) inputTitle.placeholder = "Nombre (Ej: Número 1)";
        if (btnAdd) btnAdd.innerText = "➕ Agregar Número";
    } else {
        if (label) label.innerText = "Gestor de Tomos:";
        if (inputTitle) inputTitle.placeholder = "Nombre (Ej: Tomo 1)";
        if (btnAdd) btnAdd.innerText = "➕ Agregar Tomo";
    }
}

function clearAporteForm() {
  editingAporteId = null;
  const btnSubmit = document.getElementById('btnSubmitAporteManga');
  if(btnSubmit) { btnSubmit.innerText = "☁️ Publicar Obra"; btnSubmit.style.background = "var(--success)"; }

  if (document.getElementById('aporteMangaTitle')) document.getElementById('aporteMangaTitle').value = '';
  if (document.getElementById('aporteMangaSynopsis')) document.getElementById('aporteMangaSynopsis').value = '';
  if (document.getElementById('aporteMangaBadge')) document.getElementById('aporteMangaBadge').value = '';
  if (document.getElementById('aporteMangaStatus')) document.getElementById('aporteMangaStatus').value = 'En Emisión';
  if (document.getElementById('aporteMangaFormat')) document.getElementById('aporteMangaFormat').value = 'manga';
  if (document.getElementById('aporteAllowEdit')) document.getElementById('aporteAllowEdit').checked = false;
  renderAporteGenresCheckboxes([]);
  
  const cList = document.getElementById('aporteCoversList');
  if (cList) { cList.innerHTML = ''; addAporteInputRow('aporteCoversList', 'aporte-cover-input', 'URL de la imagen de portada'); }
  const bList = document.getElementById('aporteBannersList');
  if (bList) { bList.innerHTML = ''; addAporteInputRow('aporteBannersList', 'aporte-banner-input', 'URL de la imagen del banner'); }
  const chList = document.getElementById('aporteChaptersList');
  if (chList) { chList.innerHTML = ''; addAporteChapterRow(); }
  updateAporteTerminology();
}

async function saveAporteManga() {
  if (!currentUser) { showCustomAlert("Debes iniciar sesión para publicar."); return; }

  const btn = document.getElementById('btnSubmitAporteManga');
  const titleInput = document.getElementById('aporteMangaTitle');
  if (!titleInput) { showCustomAlert("Error en la página. Recarga e intenta de nuevo."); return; }
  
  const title = titleInput.value.trim();
  if (!title) return showCustomAlert("¡El Título de la Obra es obligatorio!");

  const genresArray = getSelectedAporteGenres();
  if (genresArray.length === 0) return showCustomAlert("¡Debes seleccionar al menos un género!");

  const format = document.getElementById('aporteMangaFormat').value;
  const badge = document.getElementById('aporteMangaBadge').value;
  const status = document.getElementById('aporteMangaStatus').value;
  const synopsis = document.getElementById('aporteMangaSynopsis').value.trim();
  const allowEdit = document.getElementById('aporteAllowEdit') ? document.getElementById('aporteAllowEdit').checked : false;
  
  const covers = Array.from(document.querySelectorAll('.aporte-cover-input')).map(i => i.value.trim()).filter(v => v !== "");
  const banners = Array.from(document.querySelectorAll('.aporte-banner-input')).map(i => i.value.trim()).filter(v => v !== "");

  const chapters = [];
  document.querySelectorAll('.aporte-chapter-item').forEach(item => {
    let cTitle = item.querySelector('.aporte-chap-title').value.trim();
    const cLink = item.querySelector('.aporte-chap-link').value.trim();
    let cDl = item.querySelector('.aporte-chap-dl').value.trim();
    const isChapter = item.querySelector('.aporte-is-chapter-cb').checked; 
    
    if (cTitle) {
      let prefix = '';
      if (isChapter) prefix = 'Capítulo ';
      else if (format === 'novela') prefix = 'Volumen ';
      else if (['novela_normal', 'manhwa', 'webnovel', 'fanfic'].includes(format)) prefix = 'Capítulo ';
      else if (['cuento', 'novela_corta', 'cronica'].includes(format)) prefix = 'Parte ';
      else if (format === 'epopeya') prefix = 'Canto ';
      else if (format === 'comic') prefix = 'Número ';
      else prefix = 'Tomo ';

      if (/^\d+(\.\d+)?$/.test(cTitle)) cTitle = prefix + cTitle;

      if (cLink !== "" && cDl === "") {
         const matchId = cLink.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
         if (matchId && matchId[1]) cDl = `https://drive.google.com/uc?export=download&id=${matchId[1]}`;
      }
      chapters.push({ title: cTitle, link: cLink, downloadLink: cDl });
    }
  });

  if (chapters.length === 0) return showCustomAlert("¡Debes añadir al menos un capítulo/tomo con su enlace de lectura!");

  btn.innerText = "Guardando... ⏳"; btn.disabled = true;

  const obraData = {
    titulo: title, formato: format, estado: status,
    genero: genresArray.join(', '), sinopsis: synopsis,
    portada_url: covers[0] || 'https://via.placeholder.com/220x320/1F2833/66FCF1?text=Sin+Portada',
    link_lectura: chapters[0] ? chapters[0].link : 'N/A',
    capitulos: chapters, title: title, format: format,
    status: status, badge: badge || null, genres: genresArray,
    genre: genresArray[0] || 'Desconocido', covers: covers,
    banners: banners, chapters: chapters,
    allow_community_edit: allowEdit
  };

  if (editingAporteId) {
      const { error } = await supabaseApp.from('obras_comunidad').update(obraData).eq('id', editingAporteId);
      btn.innerText = "🔄 Actualizar Obra"; btn.disabled = false;

      if (error) { showCustomAlert("Error al actualizar: " + error.message); } 
      else {
          showCustomAlert("¡Obra actualizada con éxito!");
          clearAporteForm();
          closeAporteModal();
          loadAportes(); 
      }
  } else {
      obraData.id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
      });
      obraData.autor = currentUser.usuario;
      
      const { error } = await supabaseApp.from('obras_comunidad').insert([obraData]);
      btn.innerText = "☁️ Publicar Obra"; btn.disabled = false;

      if (error) { showCustomAlert("Error al guardar: " + error.message); } 
      else {
          showCustomAlert("¡Obra publicada con éxito en la comunidad!");
          clearAporteForm();
          closeAporteModal();
          loadAportes(); 
      }
  }
}

// ==========================================
// RENDERIZADO DE LA GALERÍA DE APORTES (CORREGIDO)
// ==========================================
window.aportesData = []; // Memoria rápida para el buscador

async function loadAportes() {
  const grid = document.getElementById('aportesGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="text-align:center; grid-column: 1 / -1; padding: 30px; color: var(--accent-1);">Cargando aportes... ⏳</div>';

  const { data: obras, error } = await supabaseApp.from('obras_comunidad').select('*').order('fecha_creacion', { ascending: false });

  if (error || !obras || obras.length === 0) { 
      grid.innerHTML = '<div style="text-align:center; grid-column: 1 / -1; color: var(--text-main); padding: 30px;">Aún no hay obras publicadas. ¡Sé el primero!</div>'; 
      window.aportesData = [];
      return; 
  }

  window.aportesData = obras; // Guardamos en memoria
  renderAportesList(obras);   // Llamamos al dibujante
}

// Función dibujante (Se reutiliza al buscar/filtrar)
function renderAportesList(obrasList) {
  const grid = document.getElementById('aportesGrid');
  if (!grid) return;
  
  if (!obrasList || obrasList.length === 0) {
      grid.innerHTML = '<div style="text-align:center; grid-column: 1 / -1; color: var(--text-main); padding: 30px;">No se encontraron obras con ese filtro.</div>';
      return;
  }

  let html = '';
  obrasList.forEach(obra => {
      const fmt = getFormatDetails(obra.format || obra.formato);
      let safeGenre = String(obra.genre || (Array.isArray(obra.genres) ? obra.genres[0] : (obra.genero || 'Desconocido'))).toUpperCase();
      let statusDot = getStatusDot(obra.status || obra.estado || 'emision'); 
      
      const isMyObra = currentUser && currentUser.usuario === obra.autor;
      const isAdmin = currentUser && currentUser.is_admin === true;
      const canEdit = isMyObra || (currentUser && obra.allow_community_edit === true) || isAdmin;
      
      let editBtn = canEdit ? `<button class="btn-read" style="flex:1; background: var(--info); color: white; border:none;" onclick="event.stopPropagation(); loadEditAporte('${obra.id}')">✏️ Editar</button>` : '';
      let deleteBtn = (isMyObra || isAdmin) ? `<button class="btn-read" style="flex:1; background: var(--danger); color: white; border:none;" onclick="deleteAporte(event, '${obra.id}')">🗑️ Borrar</button>` : '';

      const actionBtns = (editBtn || deleteBtn) ? `<div style="display:flex; gap:5px; margin-top:10px; position:relative; z-index:20;">${editBtn}${deleteBtn}</div>` : '';

      let coverImg = (obra.covers && obra.covers.length > 0) ? obra.covers[0] : (obra.portada_url || 'https://via.placeholder.com/220x320/1F2833/66FCF1?text=Sin+Portada');
      const isAutoNew = isRecentlyUpdated(obra.fecha_creacion, 4);
      let badgeHtml = '';
      if (isAutoNew) {
          badgeHtml = `<div class="manga-badge badge-nuevo">Nuevo</div>`;
      } else if (obra.badge) {
          badgeHtml = `<div class="manga-badge ${obra.badge.toLowerCase() === 'nuevo' ? 'badge-nuevo' : 'badge-actualizado'}">${obra.badge}</div>`;
      }
      const obraTitle = obra.title || obra.titulo;

      html += `
      <div class="manga-card" onclick="handleCardTap(event, this)">
        <div class="manga-cover">
          ${badgeHtml}
          <div class="ribbon-wrapper"><span class="ribbon ${fmt.ribbon}">${fmt.label}</span></div>
          <img src="${coverImg}" class="cover-slide active" draggable="false" loading="lazy">
          <div class="manga-overlay">
            <span class="tags" style="background: var(--info); color: #FFF; margin-bottom: 5px; cursor: pointer; position: relative; z-index: 20;" onclick="event.stopPropagation(); window.location.hash='user/${obra.autor}'">👤 De: ${obra.autor}</span>
            <span class="tags">${fmt.icon} ${safeGenre}</span>
            <h3 class="manga-title" title="${obraTitle}">${obraTitle}</h3>
            <button class="btn-read" onclick="window.location.hash='aporte/${obra.id}'">${fmt.icon} Leer Ahora</button>
            ${actionBtns}
          </div>
        </div>
        <div class="manga-info-static">
          <div class="manga-title-static" title="${obraTitle}">${obraTitle}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
             ${statusDot}
          </div>
        </div>
      </div>`;
  });
  grid.innerHTML = html;
}

async function renderAporteDetails(aporteId) {
  const detailsArea = document.getElementById('detailsArea');
  if (!detailsArea) return;
  
  detailsArea.innerHTML = '<div style="text-align:center; padding: 50px; color: var(--accent-1); font-size: 1.2em;">Cargando obra... ⏳</div>';
  detailsArea.style.display = 'block';

  const { data: obra, error } = await supabaseApp.from('obras_comunidad').select('*').eq('id', aporteId).single();
  
  if (error || !obra) { 
      window.location.hash = 'aportes'; 
      return; 
  }

  let bgContent = '';
  if (obra.banners && obra.banners.length > 0) {
      bgContent = obra.banners.map((b, idx) => `<img src="${b}" class="hero-bg-slide ${idx === 0 ? 'active' : ''}" draggable="false">`).join('');
  } else if (obra.covers && obra.covers.length > 0) {
      bgContent = `<img src="${obra.covers[0]}" class="hero-bg-slide blur-fallback active" draggable="false">`;
  } else if (obra.portada_url) {
      bgContent = `<img src="${obra.portada_url}" class="hero-bg-slide blur-fallback active" draggable="false">`;
  } else {
      bgContent = `<div class="hero-gradient-bg"></div>`;
  }

  const isNovelaL = obra.format === 'novela' || obra.formato === 'novela';
  const isNovelaN = obra.format === 'novela_normal' || obra.formato === 'novela_normal';
  const isManhwa = obra.format === 'manhwa' || obra.formato === 'manhwa'; 
  
  let safeGenre = String(obra.genre || (Array.isArray(obra.genres) ? obra.genres[0] : (obra.genero || 'Desconocido'))).toUpperCase();
  let formatDisplay = isNovelaL ? '📖 NOVELA L.' : (isNovelaN ? '📚 NOVELA' : (isManhwa ? '📱 MANHWA' : '💭 MANGA'));
  let chaptersDisplay = isNovelaL ? '📚 Volúmenes' : (isNovelaN ? '📚 Capítulos' : (isManhwa ? '📚 Capítulos' : '📚 Tomos'));
  let statusDot = getStatusDot(obra.status || obra.estado || 'emision');

  let caps = obra.chapters || obra.capitulos || [];
  let chaptersHtml = '';
  if (caps.length > 0) {
      caps.forEach((cap) => {
          // FIX APLICADO: Pasamos el ID real de la obra en lugar de "null" para que guarde historial, monedas y páginas
          chaptersHtml += `<div class="chapter-box" onclick="openViewer('${cap.link}', '${obra.id}', '${cap.title || cap.titulo}')">${cap.title || cap.titulo}</div>`;
      });
  } else {
      chaptersHtml = `<p style="color:var(--text-main);">No hay capítulos disponibles.</p>`;
  }

  const obraTitle = obra.title || obra.titulo;
  const obraSinopsis = obra.synopsis || obra.sinopsis || "El autor no ha proporcionado una sinopsis para esta obra.";

  detailsArea.innerHTML = `
      <div class="hero-banner">
          <button class="btn-back-details" onclick="goBack()" style="top: 15px; left: 15px; position: absolute; z-index: 50;">‹ Volver</button>
          ${bgContent}
          <div class="hero-overlay">
              <div class="details-title-container">
                  <span class="tags" style="background: var(--info); color: #FFF; margin-bottom: 5px; width: fit-content; cursor:pointer;" onclick="window.location.hash='user/${obra.autor}'">👤 Subido por: ${obra.autor}</span>
                  <span class="hero-genre">${formatDisplay} | ${safeGenre}</span>
                  <h2 class="details-title">${obraTitle} ${statusDot}</h2>
              </div>
          </div>
      </div>
      
      <div class="manga-synopsis-container" style="margin-top: 25px;">
          <div class="manga-synopsis-title">📖 Sinopsis de la Comunidad</div>
          <div class="manga-synopsis-text">${obraSinopsis}</div>
      </div>

      <div class="section-header-row">
          <h3 class="chapters-section-title">${chaptersDisplay}</h3>
      </div>
      
      <div class="chapters-grid">${chaptersHtml}</div>
  `;
  window.scrollTo({ top: 0, behavior: 'instant' });
  startHeroSlideshow();
}

// ==========================================
// FUNCIÓN DE ELIMINACIÓN DE APORTES
// ==========================================
async function deleteAporte(event, id) {
  // Detiene el clic para que no te envíe a la subpágina por accidente
  if (event) event.stopPropagation(); 
  
  if (!confirm("⚠️ ¿Estás seguro de que deseas eliminar esta obra por completo? Esta acción no se puede deshacer.")) return;
  
  // Borramos la obra de la base de datos
  const { error } = await supabaseApp.from('obras_comunidad').delete().eq('id', id);
  
  if (error) {
      showCustomAlert("Error al eliminar la obra: " + error.message);
  } else {
      showCustomAlert("La obra ha sido eliminada con éxito.");
      loadAportes(); // Recarga la galería para que la obra desaparezca visualmente al instante
  }
}

// ==========================================
// FIX: LIBERAR SCROLL AL TOCAR FUERA DEL PANEL EN MÓVILES
// ==========================================
document.addEventListener('touchstart', function(event) {
  const filterPanel = document.getElementById('filterPanel');
  const filterBtn = document.getElementById('filterBtn');
  
  // Si el panel está abierto y tocaste cualquier cosa que no sea el panel ni su botón
  if (filterPanel && filterPanel.style.display === 'block') {
      if (!filterPanel.contains(event.target) && event.target !== filterBtn && !filterBtn.contains(event.target)) {
          filterPanel.style.display = 'none';
          document.body.style.overflow = ""; // Devuelve el movimiento a la pantalla
      }
  }
}, { passive: true });

// ==========================================
// SISTEMA DE NOTIFICACIONES (LA CAMPANITA 🔔)
// ==========================================

function toggleNotiPanel() {
    const panel = document.getElementById('notiPanel');
    const filterPanel = document.getElementById('filterPanel');
    if (filterPanel) filterPanel.style.display = 'none';

    if (panel.style.display === 'block') {
        panel.style.display = 'none';
    } else {
        panel.style.display = 'block';
        if (currentUser) fetchNotificaciones(); 
    }
}

async function fetchNotificaciones() {
    if (!currentUser) return;
    const list = document.getElementById('notiList');
    const badge = document.getElementById('notiBadge');

    const { data, error } = await supabaseApp.from('notificaciones')
        .select('*')
        .eq('usuario_destino', currentUser.usuario)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error || !data) return;

    const unreadCount = data.filter(n => !n.leido).length;
    if (badge) badge.style.display = unreadCount > 0 ? 'block' : 'none';

    if (!list) return;
    if (data.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-main); padding: 20px 0;">No tienes notificaciones nuevas.</div>';
        return;
    }

    let html = '';
    data.forEach(n => {
        const isUnread = !n.leido;
        const bg = isUnread ? 'rgba(102, 252, 241, 0.15)' : 'transparent';
        const border = isUnread ? '1px solid var(--accent-1)' : '1px solid transparent';
        
        let icon = '🔔';
        if (n.tipo === 'like') icon = '❤️';
        if (n.tipo === 'respuesta') icon = '💬';
        if (n.tipo === 'super') icon = '💎';

        // AQUÍ ESTÁ LA MAGIA: Le pasamos la ruta de destino
        const enlaceRuta = n.enlace ? n.enlace : 'home';

        html += `
            <div style="background: ${bg}; border: ${border}; padding: 12px; border-radius: 8px; font-size: 0.9em; cursor: pointer; transition: 0.2s;" onclick="markNotiReadAndGo('${n.id}', '${enlaceRuta}')">
                <div style="margin-bottom: 5px;">${icon} <strong style="color: var(--accent-1);">${n.usuario_origen}</strong></div>
                <div style="color: #FFF; line-height: 1.3;">${n.mensaje}</div>
            </div>
        `;
    });
    list.innerHTML = html;
}

async function markAllNotisRead() {
    if (!currentUser) return;
    await supabaseApp.from('notificaciones').update({ leido: true }).eq('usuario_destino', currentUser.usuario).eq('leido', false);
    fetchNotificaciones();
}

// NUEVA FUNCIÓN: Marca como leído y viaja al enlace
async function markNotiReadAndGo(notiId, ruta_destino) {
    await supabaseApp.from('notificaciones').update({ leido: true }).eq('id', notiId);
    const panel = document.getElementById('notiPanel');
    if (panel) panel.style.display = 'none';
    window.location.hash = ruta_destino; // Te lleva al manga o al foro
    fetchNotificaciones();
}

// EL CARTERO ACTUALIZADO (Ahora acepta el 5to dato: enlace_destino)
async function sendNotification(origen, destino, tipo, mensaje, enlace_destino = '') {
    if (origen === destino) return; 
    await supabaseApp.from('notificaciones').insert([{
        usuario_origen: origen,
        usuario_destino: destino,
        tipo: tipo,
        mensaje: mensaje,
        enlace: enlace_destino // Guarda la ruta en la base de datos
    }]);
}

// ==========================================
// ACORDEÓN DE AVISOS LEGALES (FOOTER)
// ==========================================
function toggleLegalBox(clickedBox) {
    // 1. Verificamos si la caja que tocaste ya estaba abierta
    const wasActive = clickedBox.classList.contains('active');
    
    // 2. Cerramos absolutamente todas las cajas
    document.querySelectorAll('.legal-box').forEach(box => {
        box.classList.remove('active');
    });
    
    // 3. Si la caja que tocaste estaba cerrada, la abrimos. 
    // (Si ya estaba abierta, se quedará cerrada gracias al paso anterior).
    if (!wasActive) {
        clickedBox.classList.add('active');
    }
}

// NUEVA FUNCIÓN: Marca como leído, viaja al enlace y prepara el Scroll
async function markNotiReadAndGo(notiId, ruta_destino) {
    await supabaseApp.from('notificaciones').update({ leido: true }).eq('id', notiId);
    const panel = document.getElementById('notiPanel');
    if (panel) panel.style.display = 'none';

    let targetHash = ruta_destino;
    if (ruta_destino.includes('|')) {
        const parts = ruta_destino.split('|');
        targetHash = parts[0];
        window.pendingScrollTarget = parts[1]; // Guardamos el ID del elemento a buscar
    }

    if (window.location.hash.substring(1) === targetHash) {
        handleRouting(true); // Fuerza a redibujar si ya estamos en la misma página
    } else {
        window.location.hash = targetHash; 
    }
    fetchNotificaciones();
}

// ==========================================
// EJECUTOR DE SCROLL AUTOMÁTICO (MEJORADO)
// ==========================================
window.pendingScrollTarget = null;
function executePendingScroll(intentos = 0) {
    if (!window.pendingScrollTarget) return;

    const el = document.getElementById(window.pendingScrollTarget);
    if (el) {
        // Si está oculto dentro de una caja de comentarios del foro, la abrimos
        const parentCommentsBox = el.closest('[id^="foro-comments-"]');
        if (parentCommentsBox && parentCommentsBox.style.display === 'none') {
            parentCommentsBox.style.display = 'block';
        }

        // Hacemos el scroll suave con un pequeño retraso para asegurar fluidez
        setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Le damos un resplandor temporal para que destaque (efecto visual)
            const oldBoxShadow = el.style.boxShadow;
            el.style.boxShadow = '0 0 20px var(--accent-1)';
            setTimeout(() => { el.style.boxShadow = oldBoxShadow; }, 2500);
            
            window.pendingScrollTarget = null; // Misión cumplida
        }, 300);
    } else if (intentos < 8) {
        // Si no lo encuentra rápido, vuelve a intentar cada medio segundo (máximo 4 segundos)
        setTimeout(() => executePendingScroll(intentos + 1), 500);
    } else {
        // Si después de 4 segundos no lo halló, nos rendimos para no saturar la memoria
        window.pendingScrollTarget = null; 
    }
}

// EL CARTERO ACTUALIZADO
async function sendNotification(origen, destino, tipo, mensaje, enlace_destino = '') {
    if (origen === destino) return; 
    await supabaseApp.from('notificaciones').insert([{
        usuario_origen: origen,
        usuario_destino: destino,
        tipo: tipo,
        mensaje: mensaje,
        enlace: enlace_destino
    }]);
}

// ==========================================
// ACORDEÓN DE AVISOS LEGALES (FOOTER)
// ==========================================
function toggleLegalBox(clickedBox) {
    const wasActive = clickedBox.classList.contains('active');
    document.querySelectorAll('.legal-box').forEach(box => { box.classList.remove('active'); });
    if (!wasActive) { clickedBox.classList.add('active'); }
}

// ==========================================
// SISTEMA DE NOTIFICACIONES Y SCROLL (CAMPANITA 🔔)
// ==========================================
function toggleNotiPanel() {
    const panel = document.getElementById('notiPanel');
    const filterPanel = document.getElementById('filterPanel');
    if (filterPanel) filterPanel.style.display = 'none';

    if (panel.style.display === 'block') {
        panel.style.display = 'none';
    } else {
        panel.style.display = 'block';
        if (currentUser) fetchNotificaciones(); 
    }
}

async function fetchNotificaciones() {
    if (!currentUser) return;
    const list = document.getElementById('notiList');
    const badge = document.getElementById('notiBadge');

    const { data, error } = await supabaseApp.from('notificaciones')
        .select('*')
        .eq('usuario_destino', currentUser.usuario)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error || !data) return;

    const unreadCount = data.filter(n => !n.leido).length;
    if (badge) badge.style.display = unreadCount > 0 ? 'block' : 'none';

    if (!list) return;
    if (data.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-main); padding: 20px 0;">No tienes notificaciones nuevas.</div>';
        return;
    }

    let html = '';
    data.forEach(n => {
        const isUnread = !n.leido;
        const bg = isUnread ? 'rgba(102, 252, 241, 0.15)' : 'transparent';
        const border = isUnread ? '1px solid var(--accent-1)' : '1px solid transparent';
        
        let icon = '🔔';
        if (n.tipo === 'like') icon = '❤️';
        if (n.tipo === 'respuesta') icon = '💬';
        if (n.tipo === 'super') icon = '💎';

        const enlaceRuta = n.enlace ? n.enlace : 'home';

        html += `
            <div style="background: ${bg}; border: ${border}; padding: 12px; border-radius: 8px; font-size: 0.9em; cursor: pointer; transition: 0.2s;" onclick="markNotiReadAndGo('${n.id}', '${enlaceRuta}')">
                <div style="margin-bottom: 5px;">${icon} <strong style="color: var(--accent-1);">${n.usuario_origen}</strong></div>
                <div style="color: #FFF; line-height: 1.3;">${n.mensaje}</div>
            </div>
        `;
    });
    list.innerHTML = html;
}

async function markAllNotisRead() {
    if (!currentUser) return;
    await supabaseApp.from('notificaciones').update({ leido: true }).eq('usuario_destino', currentUser.usuario).eq('leido', false);
    fetchNotificaciones();
}

// NUEVA FUNCIÓN: Marca como leído, viaja al enlace y prepara el Scroll
async function markNotiReadAndGo(notiId, ruta_destino) {
    await supabaseApp.from('notificaciones').update({ leido: true }).eq('id', notiId);
    const panel = document.getElementById('notiPanel');
    if (panel) panel.style.display = 'none';

    let targetHash = ruta_destino;
    if (ruta_destino.includes('|')) {
        const parts = ruta_destino.split('|');
        targetHash = parts[0];
        window.pendingScrollTarget = parts[1]; // Guardamos el ID del elemento a buscar
    }

    if (window.location.hash.substring(1) === targetHash) {
        handleRouting(true); // Fuerza a redibujar si ya estamos en la misma página
    } else {
        window.location.hash = targetHash; 
    }
    fetchNotificaciones();
}

// ==========================================
// EJECUTOR DE SCROLL AUTOMÁTICO (ULTRA MEJORADO)
// ==========================================
window.pendingScrollTarget = null;
function executePendingScroll(intentos = 0) {
    if (!window.pendingScrollTarget) return;

    const el = document.getElementById(window.pendingScrollTarget);
    if (el) {
        const parentCommentsBox = el.closest('[id^="foro-comments-"]');
        if (parentCommentsBox && parentCommentsBox.style.display === 'none') {
            parentCommentsBox.style.display = 'block';
        }

        setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            const oldBoxShadow = el.style.boxShadow;
            const oldBg = el.style.backgroundColor;
            const oldBorderColor = el.style.borderColor;
            
            el.style.transition = 'all 0.5s ease';
            el.style.boxShadow = '0 0 25px var(--accent-1), inset 0 0 10px rgba(102, 252, 241, 0.2)';
            el.style.backgroundColor = 'rgba(102, 252, 241, 0.15)';
            el.style.borderColor = 'var(--accent-1)';
            
            setTimeout(() => { 
                el.style.boxShadow = oldBoxShadow; 
                el.style.backgroundColor = oldBg;
                el.style.borderColor = oldBorderColor;
            }, 3000);
            
            window.pendingScrollTarget = null;
        }, 500); 
    } else if (intentos < 10) {
        setTimeout(() => executePendingScroll(intentos + 1), 500);
    } else {
        window.pendingScrollTarget = null; 
    }
}

// EL CARTERO ACTUALIZADO
async function sendNotification(origen, destino, tipo, mensaje, enlace_destino = '') {
    if (origen === destino) return; 
    await supabaseApp.from('notificaciones').insert([{
        usuario_origen: origen,
        usuario_destino: destino,
        tipo: tipo,
        mensaje: mensaje,
        enlace: enlace_destino
    }]);
}

// ==========================================
// MOTOR DE SUBIDA DIRECTA A GOOGLE DRIVE
// ==========================================
async function uploadPdfToDrive(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const row = inputElement.closest('.aporte-chapter-item');
    const btnTrigger = row.querySelector('.btn-file-trigger');
    const linkInput = row.querySelector('.aporte-chap-link');

    if (file.size > 49 * 1024 * 1024) { 
        showCustomAlert("El PDF es muy pesado (máximo 49MB). Por favor comprímelo antes de subirlo.");
        inputElement.value = '';
        return;
    }

    btnTrigger.innerText = "⏳ Subiendo a Drive...";
    btnTrigger.disabled = true;

    const reader = new FileReader();
    reader.onload = async function() {
        const base64Data = reader.result.split(',')[1];
        const payload = { filename: file.name, mimeType: file.type, base64: base64Data };

        try {
            const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwmdxtbAdxPt-L62G7Id_mHyjHcbqXd_K9jDxBasa__PRmMjw4ypRkjA_OvwaLN3NQQLg/exec";
            
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            if (result.success) {
                btnTrigger.innerText = "✅ ¡PDF Subido!"; 
                btnTrigger.style.background = "var(--success)"; 
                btnTrigger.style.color = "#000"; 
                linkInput.value = result.url; 
                
                const coverInput = document.querySelector('.aporte-cover-input');
                if (coverInput && coverInput.value.trim() === '') {
                    coverInput.value = `https://drive.google.com/thumbnail?id=${result.id}&sz=w600`;
                    showCustomAlert("✅ PDF subido y Portada auto-generada.");
                } else {
                    showCustomAlert("✅ PDF subido a Drive.");
                }
                
            } else {
                console.error("Error Script:", result.error); 
                btnTrigger.innerText = "❌ Error en Drive"; 
                btnTrigger.style.background = "var(--danger)"; 
                showCustomAlert("Error de Google: " + result.error);
            }
        } catch (e) {
            console.error("CORS:", e); 
            btnTrigger.innerText = "❌ Falló la conexión"; 
            btnTrigger.style.background = "var(--danger)"; 
            btnTrigger.disabled = false; 
            showCustomAlert("Fallo de conexión.");
        }
    };
    reader.readAsDataURL(file);
}

// ==========================================
// SISTEMA DE MARCAPÁGINAS MANUAL
// ==========================================
function saveBookmark() {
    if (!currentUser) { 
        showCustomAlert("Inicia sesión para guardar tu progreso de lectura."); 
        return; 
    }
    
    const page = prompt("¿En qué número de página o porcentaje te estás quedando?");
    
    if (!page || page.trim() === '') return;
    
    if (!currentUser.marcapaginas) currentUser.marcapaginas = {};
    
    const key = `${window.currentViewerMangaId}_${window.currentViewerChapter}`;
    currentUser.marcapaginas[key] = page.trim();
    
    localStorage.setItem('mangaJH_user', JSON.stringify(currentUser));
    supabaseApp.from('lectores').update({ marcapaginas: currentUser.marcapaginas }).eq('usuario', currentUser.usuario).then();
    
    const bmInfo = document.getElementById('viewerBookmarkInfo');
    if (bmInfo) bmInfo.innerText = `🔖 Pág. ${page.trim()}`;
    
    showCustomAlert(`Marcador guardado en la página ${page.trim()} 🔖`);
}

// ==========================================
// SISTEMA DE RECOMPENSAS DIARIAS (RACHAS)
// ==========================================
window.pendingDailyReward = null;

function checkDailyReward() {
    if (!currentUser) return;
    
    const today = new Date().toLocaleDateString('en-CA'); 
    const lastLogin = currentUser.ultimo_login;
    
    if (lastLogin !== today) {
        let racha = currentUser.racha_dias || 0;
        
        if (lastLogin) { 
            const yesterday = new Date(); 
            yesterday.setDate(yesterday.getDate() - 1); 
            const yesterdayStr = yesterday.toLocaleDateString('en-CA'); 
            
            if (lastLogin !== yesterdayStr) { 
                racha = 0; 
            } 
        }
        
        racha += 1; 
        
        let recompensa = 10 + (Math.min(racha - 1, 7) * 5);
        
        window.pendingDailyReward = { coins: recompensa, newStreak: racha, todayStr: today };
        
        const amountSpan = document.getElementById('dailyRewardAmount'); 
        const streakSpan = document.getElementById('dailyRewardStreak');
        
        if(amountSpan) amountSpan.innerText = recompensa; 
        if(streakSpan) streakSpan.innerText = `🔥 Racha: ${racha} día(s)`;
        
        const modal = document.getElementById('dailyRewardModal'); 
        if (modal) modal.style.display = 'flex';
    }
}

async function claimDailyReward() {
    if (!currentUser || !window.pendingDailyReward) return;
    
    const { coins, newStreak, todayStr } = window.pendingDailyReward;
    
    currentUser.monedas = (currentUser.monedas || 0) + coins; 
    currentUser.ultimo_login = todayStr; 
    currentUser.racha_dias = newStreak;
    
    localStorage.setItem('mangaJH_user', JSON.stringify(currentUser)); 
    updateHeaderUI();
    
    const modal = document.getElementById('dailyRewardModal'); 
    if (modal) modal.style.display = 'none';
    
    await supabaseApp.from('lectores').update({ 
        monedas: currentUser.monedas, 
        ultimo_login: todayStr, 
        racha_dias: newStreak 
    }).eq('usuario', currentUser.usuario);
    
    window.pendingDailyReward = null; 
    showCustomAlert(`¡Recibiste ${coins} 💰! Vuelve mañana para aumentar tu racha.`);
}