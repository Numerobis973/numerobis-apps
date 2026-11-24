/* WALDO SIG — les outils de QGIS les plus utiles, dans Waldo, sans rien compliquer (Numérobis, 23/11/2026).
   Un seul bouton « SIG » ouvre un panneau à trois onglets :
     Images   : remonter le temps (photos IGN 1950 → 2025, satellites Pléiades/SPOT), rideau avant/après,
                satellite récent (Sentinel-2, Copernicus), infrarouge et relief ;
     Mesures  : distance, surface, tampon (autour d'un tracé ou d'une parcelle touchée) ;
     Fichiers : importer (GeoJSON, KML, GPX, Shapefile zippé, CSV ; sur le PC aussi GPKG, DXF, TAB… par QGIS),
                exporter mes tracés (GeoJSON, KML ; sur le PC aussi DXF en UTM 22N pour ArchiCAD), télécharger l'image de la vue,
                et sur le PC : carte PDF de la vue (mise en page QGIS) et image géoréférencée GeoTIFF.
   Données ouvertes et gratuites : Géoplateforme IGN, API Carto (cadastre), Copernicus Sentinel-2 (Earth Search, Element 84).
   Bibliothèques libres chargées seulement quand on s'en sert : Turf (MIT), toGeoJSON (BSD-2), shpjs (MIT), geotiff.js (MIT).
   Utilisation : WaldoSIG.init({carte, mode: "telephone" | "pc", base: "sig_libs/", place: élément où mettre le bouton}) */
(function () {
  "use strict";
  const W = {};
  const IGN = (c, f, s) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${c}&STYLE=${s || "normal"}&FORMAT=${f}&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
  // couches vérifiées sur Cayenne le 23/11/2026 (tuiles présentes et non vides)
  const TEMPS = [
    {id: "c1950", an: "1950", nom: "Carte 1950", couche: "GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950", f: "image/jpeg", s: "SCAN50_1950", max: 15},
    {id: "p1950", an: "1950-65", nom: "Photos 1950-1965", couche: "ORTHOIMAGERY.ORTHOPHOTOS.1950-1965", f: "image/png", s: "BDORTHOHISTORIQUE", max: 18},
    {id: "p2001", an: "2001", nom: "Photos 2000-2005", couche: "ORTHOIMAGERY.ORTHOPHOTOS2000-2005", f: "image/jpeg", max: 18},
    {id: "p2006", an: "2006", nom: "Photos 2006-2010", couche: "ORTHOIMAGERY.ORTHOPHOTOS2006-2010", f: "image/jpeg", max: 18},
    {id: "s2015", an: "2015", nom: "Satellite Pléiades 2015", couche: "ORTHOIMAGERY.ORTHO-SAT.PLEIADES.2015", f: "image/png", max: 18},
    {id: "s2016", an: "2016", nom: "Satellite Pléiades 2016", couche: "ORTHOIMAGERY.ORTHO-SAT.PLEIADES.2016", f: "image/png", max: 18},
    {id: "s2017", an: "2017", nom: "Satellite Pléiades 2017", couche: "ORTHOIMAGERY.ORTHO-SAT.PLEIADES.2017", f: "image/png", max: 18},
    {id: "s2018", an: "2018", nom: "Satellite Pléiades 2018", couche: "ORTHOIMAGERY.ORTHO-SAT.PLEIADES.2018", f: "image/png", max: 18},
    {id: "s2019", an: "2019", nom: "Satellite Pléiades 2019", couche: "ORTHOIMAGERY.ORTHO-SAT.PLEIADES.2019", f: "image/png", max: 18},
    {id: "p2020", an: "2016-20", nom: "Photos 2016-2020", couche: "ORTHOIMAGERY.ORTHOPHOTOS2016-2020", f: "image/jpeg", max: 19},
    {id: "s2020", an: "2020", nom: "Satellite Pléiades 2020", couche: "ORTHOIMAGERY.ORTHO-SAT.PLEIADES.2020", f: "image/png", max: 18},
    {id: "s2021", an: "2021", nom: "Satellite Pléiades 2021", couche: "ORTHOIMAGERY.ORTHO-SAT.PLEIADES.2021", f: "image/png", max: 18},
    {id: "p2021", an: "2021 photo", nom: "Photos IGN (actuelles)", couche: "ORTHOIMAGERY.ORTHOPHOTOS", f: "image/jpeg", max: 19},
    {id: "s2023", an: "2023", nom: "Satellite SPOT 2023", couche: "ORTHOIMAGERY.ORTHO-SAT.SPOT.2023", f: "image/jpeg", max: 17},
    {id: "p2025", an: "2025", nom: "Photos express 2025", couche: "ORTHOIMAGERY.ORTHOPHOTOS.ORTHO-EXPRESS.2025", f: "image/jpeg", max: 19}];
  const THEMES = [
    {id: "irc", nom: "Infrarouge couleur", note: "la végétation vivante ressort en rouge (photos IGN récentes)", couche: "ORTHOIMAGERY.ORTHOPHOTOS.IRC", f: "image/jpeg", max: 19, op: 1},
    {id: "irc18", nom: "Infrarouge 2018", note: "pour comparer la végétation avec 2018", couche: "ORTHOIMAGERY.ORTHOPHOTOS.IRC.2018", f: "image/jpeg", max: 19, op: 1},
    {id: "ombre", nom: "Relief ombré", note: "estompage IGN, posé en transparence sur le fond", couche: "ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW", f: "image/png", s: "estompage_grayscale", max: 15, op: .55},
    {id: "pentes", nom: "Pentes", note: "classes de pente IGN (vue d'ensemble, pas au niveau d'une parcelle)", couche: "ELEVATION.SLOPES", f: "image/jpeg", max: 13, op: .6}];
  const STAC = "https://earth-search.aws.element84.com/v1/search";
  const OR = "#d4a017", CORAIL = "#ff5a3c", BLEU = "#2f8fdb";
  let C, mode, base, panneau, etat = {temps: null, opTemps: 1, themes: {}, rideau: false, avant: "p1950", s2: null};
  let dessin = {type: null, pts: []}, traces = [], imports = [], onglet = "images";
  const $$ = (s, r) => (r || panneau).querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const fr = (n, d = 0) => Number(n).toLocaleString("fr-FR", {maximumFractionDigits: d, minimumFractionDigits: d});
  const lire = (k, d) => { try { const v = localStorage.getItem("waldosig_" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const ecrire = (k, v) => { try { localStorage.setItem("waldosig_" + k, JSON.stringify(v)); } catch (e) {} };
  let msg = "";
  function dire(t, ms) { msg = t || ""; const el = $$("#sig-info"); if (el) { el.textContent = msg; el.hidden = !msg; } clearTimeout(dire.t); if (ms) dire.t = setTimeout(() => { msg = ""; const e = $$("#sig-info"); if (e) e.hidden = true; }, ms); }

  // ------------------------------------------------------------ bibliothèques à la demande
  const charges = {};
  function lib(nom, fichier, test) {
    if (test()) return Promise.resolve();
    if (!charges[nom]) charges[nom] = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = base + fichier; s.onload = ok; s.onerror = () => ko(new Error("bibliothèque " + nom + " introuvable")); document.head.appendChild(s); });
    return charges[nom];
  }
  const turf = () => lib("turf", "turf.min.js", () => window.turf);
  const togeo = () => lib("togeojson", "togeojson.umd.js", () => window.toGeoJSON);
  const shpjs = () => lib("shp", "shp.min.js", () => window.shp);
  const geotiff = () => lib("geotiff", "geotiff.js", () => window.GeoTIFF);

  // ------------------------------------------------------------ couches sur la carte
  function avant() { for (const id of ["cadastre-ombre", "cadastre-r", "cadastre", "polys-fond", "prix", "adr"]) if (C.getLayer(id)) return id; return undefined; }
  function poseRaster(id, tiles, max, op, dessous) {
    if (!C.getSource(id)) C.addSource(id, {type: "raster", tiles: [tiles], tileSize: 256, maxzoom: max, attribution: "© IGN"});
    if (!C.getLayer(id)) C.addLayer({id, type: "raster", source: id, paint: {"raster-opacity": op, "raster-fade-duration": 150}}, dessous || avant());
    else C.setPaintProperty(id, "raster-opacity", op);
  }
  function enleve(id) { if (C.getLayer(id)) C.removeLayer(id); if (C.getSource(id)) C.removeSource(id); }
  // le style de la carte doit être chargé pour ajouter une couche ; sinon on attend qu'il le soit
  function quandPret(fn, n = 0) { if (n > 30) return; if (C.style && C.style._loaded) { try { fn(); } catch (e) { setTimeout(() => quandPret(fn, n + 1), 300); } } else setTimeout(() => quandPret(fn, n + 1), 300); }
  function appliquerTemps() { quandPret(appliquerTemps_); }
  function appliquerTemps_() {
    enleve("sig-temps");
    const t = TEMPS.find(x => x.id === etat.temps);
    if (t) poseRaster("sig-temps", IGN(t.couche, t.f, t.s), t.max, etat.opTemps, C.getLayer("sig-theme-irc") ? "sig-theme-irc" : undefined);
    ecrire("etat", etat);
  }
  function appliquerThemes() { quandPret(appliquerThemes_); }
  function appliquerThemes_() {
    for (const t of THEMES) { const id = "sig-theme-" + t.id; if (etat.themes[t.id]) poseRaster(id, IGN(t.couche, t.f, t.s), t.max, t.op); else enleve(id); }
    ecrire("etat", etat);
  }
  function sources() {
    const vide = {type: "FeatureCollection", features: []};
    for (const s of ["sig-traces", "sig-encours", "sig-imports"]) if (!C.getSource(s)) C.addSource(s, {type: "geojson", data: vide});
    const L = [
      {id: "sig-imports-fond", type: "fill", source: "sig-imports", filter: ["==", ["geometry-type"], "Polygon"], paint: {"fill-color": BLEU, "fill-opacity": .18}},
      {id: "sig-imports-trait", type: "line", source: "sig-imports", filter: ["!=", ["geometry-type"], "Point"], paint: {"line-color": BLEU, "line-width": 2.4}},
      {id: "sig-imports-pt", type: "circle", source: "sig-imports", filter: ["==", ["geometry-type"], "Point"], paint: {"circle-radius": 5, "circle-color": BLEU, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5}},
      {id: "sig-traces-fond", type: "fill", source: "sig-traces", filter: ["==", ["geometry-type"], "Polygon"], paint: {"fill-color": ["coalesce", ["get", "couleur"], OR], "fill-opacity": .22}},
      {id: "sig-traces-trait", type: "line", source: "sig-traces", filter: ["!=", ["geometry-type"], "Point"], paint: {"line-color": ["coalesce", ["get", "couleur"], OR], "line-width": 3}},
      {id: "sig-traces-txt", type: "symbol", source: "sig-traces", filter: ["has", "etiquette"], layout: {"text-field": ["get", "etiquette"], "text-font": ["Source Sans Pro Semibold"], "text-size": 13, "symbol-placement": "point"},
        paint: {"text-color": "#111", "text-halo-color": "#fff", "text-halo-width": 2}},
      {id: "sig-encours-trait", type: "line", source: "sig-encours", filter: ["!=", ["geometry-type"], "Point"], paint: {"line-color": CORAIL, "line-width": 3, "line-dasharray": [2, 1]}},
      {id: "sig-encours-pt", type: "circle", source: "sig-encours", filter: ["==", ["geometry-type"], "Point"], paint: {"circle-radius": 6, "circle-color": CORAIL, "circle-stroke-color": "#fff", "circle-stroke-width": 2}}];
    for (const l of L) if (!C.getLayer(l.id)) C.addLayer(l);
  }
  const fc = f => ({type: "FeatureCollection", features: f});
  function majTraces() { if (C.getSource("sig-traces")) C.getSource("sig-traces").setData(fc(traces)); ecrire("traces", traces); }
  function majImports() { if (C.getSource("sig-imports")) C.getSource("sig-imports").setData(fc(imports.flatMap(i => i.visible ? i.g.features : []))); }

  // ------------------------------------------------------------ mesures (géodésiques, sur l'ellipsoïde arrondi : écart < 0,3 % à Cayenne)
  const R = 6371008.8, rad = Math.PI / 180;
  function dist(a, b) { const dl = (b[1] - a[1]) * rad, dn = (b[0] - a[0]) * rad, h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
  function longueur(p) { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; }
  function aire(p) { if (p.length < 3) return 0; let s = 0; const q = p.concat([p[0]]); for (let i = 0; i < q.length - 1; i++) s += (q[i + 1][0] - q[i][0]) * rad * (2 + Math.sin(q[i][1] * rad) + Math.sin(q[i + 1][1] * rad)); return Math.abs(s * R * R / 2); }
  const m = v => v >= 1000 ? fr(v / 1000, 2) + " km" : fr(v, v < 100 ? 1 : 0) + " m";
  const m2 = v => v >= 10000 ? fr(v, 0) + " m² (" + fr(v / 10000, 2) + " ha)" : fr(v, 0) + " m²";
  function encours() {
    const p = dessin.pts, F = p.map(c => ({type: "Feature", properties: {}, geometry: {type: "Point", coordinates: c}}));
    if (p.length > 1) F.push({type: "Feature", properties: {}, geometry: dessin.type === "surface" && p.length > 2 ? {type: "Polygon", coordinates: [p.concat([p[0]])]} : {type: "LineString", coordinates: p}});
    C.getSource("sig-encours").setData(fc(F));
    const r = $$("#sig-mesure");
    if (r) r.innerHTML = dessin.type === "distance" ? `<b>${m(longueur(p))}</b> · ${p.length} point${p.length > 1 ? "s" : ""}`
      : dessin.type === "surface" ? `<b>${m2(aire(p))}</b> · périmètre ${m(longueur(p.concat(p.length > 2 ? [p[0]] : [])))}`
      : dessin.type === "tampon" ? "Touche une parcelle ou un tracé, ou un point de la carte" : dessin.type === "topo" ? "Touche la parcelle à relever" : "";
  }
  function commencer(type) {
    dessin = {type, pts: []}; window.WALDO_SIG_OCCUPE = true; C.doubleClickZoom.disable(); C.getCanvas().style.cursor = "crosshair";
    dire(type === "tampon" ? "Touche la carte : parcelle, tracé ou point." : type === "topo" ? "Touche la parcelle à relever." : "Touche la carte pour poser les points, puis « Terminer ».");
    dessinerPanneau(); encours();
  }
  function arreter() { dessin = {type: null, pts: []}; window.WALDO_SIG_OCCUPE = false; C.doubleClickZoom.enable(); C.getCanvas().style.cursor = ""; if (C.getSource("sig-encours")) C.getSource("sig-encours").setData(fc([])); dire(""); dessinerPanneau(); }
  function terminer() {
    const p = dessin.pts;
    if (dessin.type === "distance" && p.length > 1) traces.push({type: "Feature", properties: {nom: "Distance", couleur: OR, etiquette: m(longueur(p)), mesure: Math.round(longueur(p) * 100) / 100}, geometry: {type: "LineString", coordinates: p}});
    if (dessin.type === "surface" && p.length > 2) traces.push({type: "Feature", properties: {nom: "Surface", couleur: OR, etiquette: m2(aire(p)), mesure_m2: Math.round(aire(p)), perimetre_m: Math.round(longueur(p.concat([p[0]])) * 10) / 10}, geometry: {type: "Polygon", coordinates: [p.concat([p[0]])]}});
    majTraces(); arreter();
  }
  async function tamponEn(e) {
    const r = Math.max(1, Number($$("#sig-rayon")?.value || 50)); let cible = null, quoi = "";
    const vus = C.queryRenderedFeatures(e.point, {layers: ["sig-traces-fond", "sig-traces-trait", "sig-imports-fond", "sig-imports-trait"].filter(l => C.getLayer(l))});
    if (vus.length) { cible = {type: "Feature", properties: {}, geometry: vus[0].geometry}; quoi = vus[0].properties.nom || "tracé"; }
    else {
      try { dire("Je cherche la parcelle…");
        const g = encodeURIComponent(JSON.stringify({type: "Point", coordinates: [e.lngLat.lng, e.lngLat.lat]}));
        const j = await (await fetch(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${g}`)).json(); const f = (j.features || [])[0];
        if (f) { cible = {type: "Feature", properties: {}, geometry: f.geometry}; quoi = `parcelle ${f.properties.section} ${Number(f.properties.numero)}`; }
      } catch (x) {}
      if (!cible) { cible = {type: "Feature", properties: {}, geometry: {type: "Point", coordinates: [e.lngLat.lng, e.lngLat.lat]}}; quoi = "point"; }
    }
    try { dire("Calcul du tampon…"); await turf(); } catch (x) { dire("Outil de tampon indisponible (bibliothèque non chargée).", 4000); return; }
    const b = window.turf.buffer(cible, r, {units: "meters", steps: 16});
    b.properties = {nom: `Tampon ${fr(r)} m autour de ${quoi}`, couleur: CORAIL, etiquette: `${fr(r)} m`, rayon_m: r};
    if (cible.geometry.type !== "Point") traces.push(Object.assign(cible, {properties: {nom: quoi, couleur: OR}}));
    traces.push(b); majTraces(); dessinerPanneau(); dire(`Tampon de ${fr(r)} m autour de ${quoi} : ${m2(window.turf.area(b))}.`, 6000);
  }

  // ------------------------------------------------------------ relevé topo indicatif d'une parcelle (PC : QGIS + IGN)
  async function topoEn(e) {
    let ref = null;
    try { dire("Je cherche la parcelle…");
      const g = encodeURIComponent(JSON.stringify({type: "Point", coordinates: [e.lngLat.lng, e.lngLat.lat]}));
      const f = ((await (await fetch(`https://apicarto.ign.fr/api/cadastre/parcelle?geom=${g}`)).json()).features || [])[0];
      if (f) ref = `${f.properties.section} ${Number(f.properties.numero)}`;
    } catch (x) {}
    if (!ref) return dire("Pas de parcelle cadastrée ici.", 4000);
    const pf = !!etat.pf; arreter();
    dire(`Relevé topo de ${ref} en cours (1 à 2 min) : terrain IGN, courbes, points cotés, profils, ombres${pf ? ", plateforme + talus" : ""}…`);
    try {
      const j = await (await fetch("/api/sig/topo?" + new URLSearchParams({parcelle: ref, plateforme: pf ? "1" : "0"}))).json();
      if (!j.ok) return dire("Relevé impossible : " + (j.erreur || "").slice(0, 200), 8000);
      if (j.courbes) ajouterImport(`Courbes ${ref} (TN)`, j.courbes);
      const s_ = j.stats || {}, p_ = j.plateforme;
      dire(`${ref} : altitudes ${String(s_.z_min).replace(".", ",")} à ${String(s_.z_max).replace(".", ",")} m NGG, pente moyenne ${String(s_.pente_moy_pct).replace(".", ",")} %` +
        (p_ ? ` ; plateforme ${String(p_.altitude).replace(".", ",")} m : remblai ${p_.remblai_m3} m³, déblai ${p_.deblai_m3} m³` : "") + ". Document indicatif, à faire vérifier par un géomètre-expert.");
      onglet = "fichiers"; dessinerPanneau(); resultat(`Relevé topo de ${ref} prêt (plan A3, DXF, profils, ombres, base 3D)`, j.plan || j.dossier);
    } catch (x) { dire("Le serveur de Waldo ne répond pas.", 5000); }
  }

  // ------------------------------------------------------------ rideau avant / après
  let C2 = null, rideau = null, posRideau = .5;
  function styleAvant() {
    const t = TEMPS.find(x => x.id === etat.avant) || TEMPS[1];
    return {version: 8, sources: {a: {type: "raster", tiles: [IGN(t.couche, t.f, t.s)], tileSize: 256, maxzoom: t.max},
      cad: {type: "vector", tiles: ["https://data.geopf.fr/tms/1.0.0/PCI/{z}/{x}/{y}.pbf"], minzoom: 5, maxzoom: 19}},
      layers: [{id: "fond", type: "background", paint: {"background-color": "#222"}}, {id: "a", type: "raster", source: "a"},
        {id: "cad", type: "line", source: "cad", "source-layer": "parcelle", minzoom: 15, paint: {"line-color": OR, "line-width": 1.2, "line-opacity": .9}}]};
  }
  function ouvrirRideau() {
    if (rideau) return;
    const hote = C.getContainer();
    rideau = document.createElement("div"); rideau.className = "sig-rideau";
    rideau.innerHTML = `<div class="sig-r-carte"></div><div class="sig-r-barre"><span class="sig-r-poignee" title="Glisser">⟷</span></div><span class="sig-r-g"></span><span class="sig-r-d">aujourd'hui</span>`;
    hote.appendChild(rideau);
    C2 = new maplibregl.Map({container: $$(".sig-r-carte", rideau), style: styleAvant(), interactive: false, attributionControl: false,
      center: C.getCenter(), zoom: C.getZoom(), bearing: C.getBearing(), pitch: C.getPitch(), fadeDuration: 0});
    C.on("move", suivre); C.on("resize", () => C2 && C2.resize());
    const barre = $$(".sig-r-barre", rideau);
    const tirer = ev => { const r = hote.getBoundingClientRect(), x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left; posRideau = Math.min(.97, Math.max(.03, x / r.width)); placer(); ev.preventDefault(); };
    const fin = () => { removeEventListener("pointermove", tirer); removeEventListener("touchmove", tirer); };
    barre.addEventListener("pointerdown", ev => { addEventListener("pointermove", tirer); addEventListener("pointerup", fin, {once: true}); ev.preventDefault(); });
    barre.addEventListener("touchstart", ev => { addEventListener("touchmove", tirer, {passive: false}); addEventListener("touchend", fin, {once: true}); }, {passive: true});
    placer(); etiquettes();
  }
  function suivre() { if (C2) C2.jumpTo({center: C.getCenter(), zoom: C.getZoom(), bearing: C.getBearing(), pitch: C.getPitch()}); }
  function placer() { if (!rideau) return; const p = (posRideau * 100).toFixed(2) + "%"; $$(".sig-r-carte", rideau).style.clipPath = `inset(0 calc(100% - ${p}) 0 0)`; $$(".sig-r-barre", rideau).style.left = p; }
  function etiquettes() { if (!rideau) return; const t = TEMPS.find(x => x.id === etat.avant); $$(".sig-r-g", rideau).textContent = "◀ " + (t ? t.nom : ""); const d = TEMPS.find(x => x.id === etat.temps); $$(".sig-r-d", rideau).textContent = (d ? d.nom : "aujourd'hui") + " ▶"; }
  function fermerRideau() { if (!rideau) return; C.off("move", suivre); try { C2.remove(); } catch (e) {} rideau.remove(); rideau = C2 = null; }

  // ------------------------------------------------------------ Sentinel-2 (Copernicus) : images de moins de 5 jours à quelques semaines
  function utmZone(epsg) { const z = epsg % 100, nord = Math.floor(epsg / 100) === 326; return {z, nord}; }
  const A_ = 6378137, F_ = 1 / 298.257223563, E2 = F_ * (2 - F_), EP2 = E2 / (1 - E2), K0 = .9996;
  function versUTM(lon, lat, z) {
    const l0 = ((z - 1) * 6 - 180 + 3) * rad, p = lat * rad, N = A_ / Math.sqrt(1 - E2 * Math.sin(p) ** 2), T = Math.tan(p) ** 2, Cc = EP2 * Math.cos(p) ** 2, A = Math.cos(p) * (lon * rad - l0);
    const e4 = E2 * E2, e6 = e4 * E2;
    const M = A_ * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p) - (35 * e6 / 3072) * Math.sin(6 * p));
    const x = K0 * N * (A + (1 - T + Cc) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * Cc - 58 * EP2) * A ** 5 / 120) + 500000;
    const y = K0 * (M + N * Math.tan(p) * (A * A / 2 + (5 - T + 9 * Cc + 4 * Cc * Cc) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * Cc - 330 * EP2) * A ** 6 / 720));
    return [x, y];
  }
  function depuisUTM(x, y, z) {
    const l0 = ((z - 1) * 6 - 180 + 3) * rad, e4 = E2 * E2, e6 = e4 * E2, e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    const mu = (y / K0) / (A_ * (1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const N1 = A_ / Math.sqrt(1 - E2 * Math.sin(p1) ** 2), T1 = Math.tan(p1) ** 2, C1 = EP2 * Math.cos(p1) ** 2, R1 = A_ * (1 - E2) / (1 - E2 * Math.sin(p1) ** 2) ** 1.5, D = (x - 500000) / (N1 * K0);
    const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6 / 720);
    const lon = l0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
    return [lon / rad, lat / rad];
  }
  let s2Liste = [];
  async function s2Chercher() {
    const b = C.getBounds(), bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    dire("Je cherche les images Sentinel-2 de cette zone…");
    try {
      const r = await fetch(STAC, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({collections: ["sentinel-2-l2a"], bbox, limit: 30,
        query: {"eo:cloud_cover": {lt: 70}}, sortby: [{field: "properties.datetime", direction: "desc"}], fields: {include: ["properties.datetime", "properties.eo:cloud_cover", "properties.proj:epsg", "properties.proj:code", "assets.visual", "bbox"]}})});
      const j = await r.json(); const vus = new Set();
      s2Liste = (j.features || []).filter(f => f.assets && f.assets.visual).filter(f => { const d = f.properties.datetime.slice(0, 10); if (vus.has(d)) return false; vus.add(d); return true; }).slice(0, 10);
      dire(s2Liste.length ? "" : "Aucune image Sentinel-2 récente sur cette zone.", 5000);
    } catch (e) { dire("Le catalogue Sentinel-2 ne répond pas (réseau ?).", 5000); s2Liste = []; }
    dessinerPanneau();
  }
  async function s2Afficher(i) {
    const f = s2Liste[i]; if (!f) return;
    const epsg = Number(f.properties["proj:epsg"] || String(f.properties["proj:code"] || "").split(":")[1]);
    if (!epsg || Math.floor(epsg / 100) !== 326) { dire("Projection de l'image non prise en charge.", 4000); return; }
    const {z} = utmZone(epsg);
    dire("Je télécharge la partie utile de l'image (quelques secondes)…");
    try {
      await geotiff();
      const b = C.getBounds(), P = [[b.getWest(), b.getSouth()], [b.getEast(), b.getSouth()], [b.getEast(), b.getNorth()], [b.getWest(), b.getNorth()],
        [(b.getWest() + b.getEast()) / 2, b.getSouth()], [(b.getWest() + b.getEast()) / 2, b.getNorth()]].map(c => versUTM(c[0], c[1], z));
      let x0 = Math.min(...P.map(p => p[0])), x1 = Math.max(...P.map(p => p[0])), y0 = Math.min(...P.map(p => p[1])), y1 = Math.max(...P.map(p => p[1]));
      const can = C.getCanvas(), lw = Math.min(2048, can.width), lh = Math.max(1, Math.round(lw * (y1 - y0) / (x1 - x0)));
      const w = Math.min(lw, Math.ceil((x1 - x0) / 10)), h = Math.max(1, Math.round(w * (y1 - y0) / (x1 - x0)));   // pas plus fin que les 10 m du satellite
      const tif = await window.GeoTIFF.fromUrl(f.assets.visual.href, {allowFullFile: false});
      const ras = await tif.readRasters({bbox: [x0, y0, x1, y1], width: w, height: h, interleave: true, samples: [0, 1, 2], fillValue: 0, resampleMethod: "bilinear"});
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const g = cv.getContext("2d"), im = g.createImageData(w, h);
      for (let k = 0, n = w * h; k < n; k++) { const r = ras[3 * k], v = ras[3 * k + 1], bl = ras[3 * k + 2]; im.data[4 * k] = r; im.data[4 * k + 1] = v; im.data[4 * k + 2] = bl; im.data[4 * k + 3] = (r || v || bl) ? 255 : 0; }
      g.putImageData(im, 0, 0);
      const coins = [[x0, y1], [x1, y1], [x1, y0], [x0, y0]].map(c => depuisUTM(c[0], c[1], z));
      enleve("sig-s2");
      C.addSource("sig-s2", {type: "image", url: cv.toDataURL("image/jpeg", .9), coordinates: coins});
      C.addLayer({id: "sig-s2", type: "raster", source: "sig-s2", paint: {"raster-opacity": 1, "raster-fade-duration": 0, "raster-resampling": "linear"}}, avant());
      etat.s2 = {date: f.properties.datetime.slice(0, 10), nuages: f.properties["eo:cloud_cover"]};
      dire(`Sentinel-2 du ${etat.s2.date.split("-").reverse().join("/")} affiché (pixels de 10 m : pour voir l'évolution d'un quartier, pas le détail d'une parcelle).`, 7000);
      dessinerPanneau(); void lh;
    } catch (e) { dire("Image Sentinel-2 indisponible : " + (e.message || e), 6000); }
  }
  function s2Enlever() { enleve("sig-s2"); etat.s2 = null; dessinerPanneau(); }

  // ------------------------------------------------------------ fichiers : import / export
  function ajouterImport(nom, g) {
    if (!g || !g.features) { dire("Fichier lu, mais sans objet géographique.", 4000); return; }
    const pts = []; (function parc(c) { if (typeof c[0] === "number") pts.push(c); else c.forEach(parc); })(g.features.filter(f => f.geometry).map(f => f.geometry.coordinates));
    const horsDegres = pts.some(p => Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90);
    if (horsDegres) { dire("Coordonnées en mètres (UTM ?) : sur le PC, ouvre ce fichier par l'import QGIS, qui le remet en degrés.", 7000); return; }
    g.features.forEach(f => { f.properties = Object.assign({}, f.properties, {nom: f.properties?.name || f.properties?.nom || nom}); });
    imports.push({nom, g, visible: true}); majImports();
    if (pts.length) { const b = new maplibregl.LngLatBounds(); pts.forEach(p => b.extend(p)); C.fitBounds(b, {padding: 60, maxZoom: 18}); }
    dire(`${nom} : ${g.features.length} objet${g.features.length > 1 ? "s" : ""} affiché${g.features.length > 1 ? "s" : ""}.`, 5000); dessinerPanneau();
  }
  function csvVersGeo(txt) {
    const L = txt.split(/\r?\n/).filter(l => l.trim()), sep = (L[0].match(/;/g) || []).length > (L[0].match(/,/g) || []).length ? ";" : ",";
    const t = L[0].split(sep).map(x => x.trim().toLowerCase().replace(/"/g, "")), ix = t.findIndex(x => /^(lon|lng|longitude|x)$/.test(x)), iy = t.findIndex(x => /^(lat|latitude|y)$/.test(x));
    if (ix < 0 || iy < 0) throw new Error("colonnes lon/lat (ou x/y) introuvables");
    return fc(L.slice(1).map(l => { const v = l.split(sep).map(x => x.trim().replace(/"/g, "")), p = {}; t.forEach((k, i) => p[k] = v[i]);
      return {type: "Feature", properties: p, geometry: {type: "Point", coordinates: [parseFloat(v[ix].replace(",", ".")), parseFloat(v[iy].replace(",", "."))]}}; }).filter(f => isFinite(f.geometry.coordinates[0])));
  }
  async function importer(fichier) {
    const nom = fichier.name, ext = nom.split(".").pop().toLowerCase();
    dire("Lecture de " + nom + "…");
    try {
      if (ext === "geojson" || ext === "json") return ajouterImport(nom, JSON.parse(await fichier.text()));
      if (ext === "kml" || ext === "gpx") { await togeo(); const x = new DOMParser().parseFromString(await fichier.text(), "text/xml"); return ajouterImport(nom, window.toGeoJSON[ext](x)); }
      if (ext === "zip") { await shpjs(); let g = await window.shp(await fichier.arrayBuffer()); if (Array.isArray(g)) g = fc(g.flatMap(x => x.features)); return ajouterImport(nom, g); }
      if (ext === "csv" || ext === "txt") return ajouterImport(nom, csvVersGeo(await fichier.text()));
      if (mode === "pc") {          // tout le reste passe par QGIS sur le PC (GPKG, DXF, SHP seul, TAB, MIF, ODS…)
        const r = await fetch("/api/sig/convertir?vers=GeoJSON&nom=" + encodeURIComponent(nom), {method: "POST", body: fichier});
        const j = await r.json(); if (!j.ok) throw new Error(j.erreur || j.texte || "conversion impossible");
        return ajouterImport(nom, j.geojson);
      }
      dire("Format à ouvrir sur le PC (QGIS) : " + ext.toUpperCase() + ". Ici : GeoJSON, KML, GPX, Shapefile zippé, CSV.", 7000);
    } catch (e) { dire("Lecture impossible : " + (e.message || e), 6000); }
  }
  function tous() { return fc(traces.concat(imports.flatMap(i => i.visible ? i.g.features : []))); }
  function telecharger(nom, contenu, type) {
    const u = URL.createObjectURL(new Blob([contenu], {type})); const a = document.createElement("a"); a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  function versKML(g) {
    const co = c => c.map(p => p[0] + "," + p[1]).join(" "), x = s => esc(s).replace(/'/g, "&apos;");
    const geom = gm => gm.type === "Point" ? `<Point><coordinates>${gm.coordinates[0]},${gm.coordinates[1]}</coordinates></Point>`
      : gm.type === "LineString" ? `<LineString><coordinates>${co(gm.coordinates)}</coordinates></LineString>`
      : gm.type === "Polygon" ? `<Polygon>${gm.coordinates.map((r, i) => `<${i ? "inner" : "outer"}BoundaryIs><LinearRing><coordinates>${co(r)}</coordinates></LinearRing></${i ? "inner" : "outer"}BoundaryIs>`).join("")}</Polygon>`
      : gm.type.startsWith("Multi") ? `<MultiGeometry>${gm.coordinates.map(c => geom({type: gm.type.slice(5), coordinates: c})).join("")}</MultiGeometry>` : "";
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Waldo</name>${g.features.map(f =>
      `<Placemark><name>${x(f.properties?.nom || "")}</name><description>${x(f.properties?.etiquette || "")}</description>${geom(f.geometry)}</Placemark>`).join("")}</Document></kml>`;
  }
  const horo = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  async function exporter(f) {
    const g = tous(); if (!g.features.length) { dire("Rien à exporter : trace une mesure ou importe un fichier d'abord.", 4000); return; }
    if (f === "geojson") return telecharger(`waldo_${horo()}.geojson`, JSON.stringify(g, null, 1), "application/geo+json");
    if (f === "kml") return telecharger(`waldo_${horo()}.kml`, versKML(g), "application/vnd.google-earth.kml+xml");
    if (f === "dxf" || f === "gpkg") {
      dire("Conversion par QGIS…");
      const j = await (await fetch(`/api/sig/convertir?vers=${f === "dxf" ? "DXF" : "GPKG"}&nom=waldo_traces.geojson`, {method: "POST", body: JSON.stringify(g)})).json();
      if (!j.ok) return dire("Conversion impossible : " + (j.erreur || ""), 6000);
      dire(""); resultat(`${f.toUpperCase()} prêt (RGFG95 / UTM 22N)`, j.fichier);
    }
  }
  function imageVue() {
    C.once("render", () => { C.getCanvas().toBlob(b => { if (!b) return dire("Capture impossible sur cet appareil.", 4000);
      const u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = `waldo_vue_${horo()}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }, "image/png"); });
    C.triggerRepaint();
  }

  // ------------------------------------------------------------ PC : carte PDF et GeoTIFF par QGIS
  function vueQGIS() {
    const b = C.getBounds(), cs = [];
    const t = TEMPS.find(x => x.id === etat.temps); if (t) cs.push({nom: t.nom, couche: t.couche, format: t.f, style: t.s || "normal", opacite: etat.opTemps, zmax: t.max});
    for (const th of THEMES) if (etat.themes[th.id]) cs.push({nom: th.nom, couche: th.couche, format: th.f, style: th.s || "normal", opacite: th.op, zmax: th.max});
    const fondPhoto = C.getLayer("photo") && C.getLayoutProperty("photo", "visibility") !== "none";
    return {emprise: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(v => v.toFixed(7)).join(","), couches: JSON.stringify(cs), fond: (t && etat.opTemps >= .99) ? "aucun" : (fondPhoto ? "photo" : "plan")};
  }
  function resultat(titre, fichier) {
    const el = $$("#sig-res"); if (!el) return;
    el.innerHTML = `<div class="sig-ok"><b>${esc(titre)}</b><small>${esc(fichier)}</small><button data-montrer="${esc(fichier)}">Ouvrir</button><button data-dossier="${esc(fichier)}">Voir dans le dossier</button></div>`;
    el.querySelector("[data-montrer]").onclick = () => fetch("/api/sig/montrer?ouvrir=1&f=" + encodeURIComponent(fichier));
    el.querySelector("[data-dossier]").onclick = () => fetch("/api/sig/montrer?f=" + encodeURIComponent(fichier));
  }
  async function pdfVue() {
    const titre = ($$("#sig-titre")?.value || "").trim() || "Plan de situation", format = $$("#sig-format")?.value || "A4 paysage", v = vueQGIS();
    dire("QGIS prépare la carte (30 s à 1 min)…");
    const p = new URLSearchParams(Object.assign(v, {titre, format, cadastre: C.getLayer("cadastre") && C.getLayoutProperty("cadastre", "visibility") !== "none" ? "1" : "0", traces: JSON.stringify(tous())}));
    try { const j = await (await fetch("/api/sig/pdf", {method: "POST", body: p})).json(); dire("");
      if (!j.ok) return dire("QGIS n'a pas pu faire la carte : " + (j.erreur || "").slice(0, 200), 8000); resultat("Carte PDF prête", j.pdf);
    } catch (e) { dire("Le serveur de Waldo ne répond pas.", 5000); }
  }
  async function tifVue() {
    const res = $$("#sig-resol")?.value || "0.5", v = vueQGIS();
    dire("QGIS fabrique l'image géoréférencée…");
    try { const j = await (await fetch("/api/sig/image?" + new URLSearchParams(Object.assign(v, {resolution: res})))).json(); dire("");
      if (!j.ok) return dire("Image impossible : " + (j.erreur || "").slice(0, 200), 8000); resultat(`GeoTIFF ${j.largeur_px} × ${j.hauteur_px} px, ${String(j.resolution_m).replace(".", ",")} m/pixel`, j.geotiff);
    } catch (e) { dire("Le serveur de Waldo ne répond pas.", 5000); }
  }

  // ------------------------------------------------------------ panneau
  function dessinerPanneau() {
    if (!panneau || panneau.hidden) return;
    const ong = (id, t) => `<button class="sig-ong ${onglet === id ? "actif" : ""}" data-ong="${id}">${t}</button>`;
    let h = `<div class="sig-tete"><b>SIG</b><div class="sig-ongs">${ong("images", "Images")}${ong("mesures", "Mesures")}${ong("fichiers", "Fichiers")}</div><button class="sig-x" aria-label="Fermer">✕</button></div><div class="sig-corps">`;
    if (onglet === "images") {
      h += `<h4>Remonter le temps</h4><div class="sig-annees"><button data-temps="" class="${!etat.temps ? "actif" : ""}">Aujourd'hui</button>${TEMPS.map(t => `<button data-temps="${t.id}" class="${etat.temps === t.id ? "actif" : ""}" title="${esc(t.nom)}">${esc(t.an)}</button>`).join("")}</div>`;
      if (etat.temps) h += `<label class="sig-curseur">Transparence <input type="range" id="sig-op" min="0.2" max="1" step="0.05" value="${etat.opTemps}"></label><p class="sig-note">${esc(TEMPS.find(t => t.id === etat.temps).nom)} · © IGN</p>`;
      h += `<h4>Rideau avant / après</h4><div class="sig-ligne"><button id="sig-rid" class="${etat.rideau ? "actif" : ""}">${etat.rideau ? "Fermer le rideau" : "Ouvrir le rideau"}</button>
        <select id="sig-avant" aria-label="Image de gauche">${TEMPS.map(t => `<option value="${t.id}" ${etat.avant === t.id ? "selected" : ""}>${esc(t.nom)}</option>`).join("")}</select></div>
        <p class="sig-note">À gauche l'image choisie, à droite la carte actuelle (ou l'année choisie au-dessus). Glisse la barre.</p>`;
      h += `<h4>Satellite récent (Sentinel-2)</h4><div class="sig-ligne"><button id="sig-s2">Chercher les images de cette zone</button>${etat.s2 ? `<button id="sig-s2x">Enlever (${etat.s2.date.split("-").reverse().join("/")})</button>` : ""}</div>`;
      if (s2Liste.length) h += `<div class="sig-liste">${s2Liste.map((f, i) => `<button data-s2="${i}"><b>${f.properties.datetime.slice(0, 10).split("-").reverse().join("/")}</b><small>nuages sur la tuile : ${fr(f.properties["eo:cloud_cover"])} %</small></button>`).join("")}</div>`;
      h += `<p class="sig-note">Copernicus Sentinel-2, nouvelle image tous les 5 jours environ ; pixels de 10 m. La Guyane est souvent nuageuse : essaie plusieurs dates.</p>`;
      h += `<h4>Infrarouge et relief</h4>${THEMES.map(t => `<button class="sig-bascule ${etat.themes[t.id] ? "actif" : ""}" data-theme="${t.id}"><span>${esc(t.nom)}<small>${esc(t.note)}</small></span><i></i></button>`).join("")}`;
    }
    if (onglet === "mesures") {
      const actif = t => dessin.type === t ? "actif" : "";
      h += `<div class="sig-trois"><button data-dessin="distance" class="${actif("distance")}">📏 Distance</button><button data-dessin="surface" class="${actif("surface")}">⬠ Surface</button><button data-dessin="tampon" class="${actif("tampon")}">◎ Tampon</button></div>`;
      if (mode === "pc") h += `<h4>Relevé topo indicatif</h4><div class="sig-ligne"><button data-dessin="topo" class="${actif("topo")}">⛰ Relevé topo d'une parcelle</button></div>
        <label class="sig-curseur"><input type="checkbox" id="sig-pf" ${etat.pf ? "checked" : ""}> avec plateforme + talus (volumes de terrassement)</label>
        <p class="sig-note">Touche la parcelle : plan A3 coté, DXF (UTM 22N) pour ArchiCAD, points cotés pour le géomètre, profils au 1/200, ombres portées, base 3D (SketchUp, ArchiCAD). Données IGN : document indicatif.</p>`;
      if (dessin.type === "tampon") h += `<label class="sig-curseur">Rayon du tampon <input type="number" id="sig-rayon" min="1" max="5000" step="1" value="${lire("rayon", 50)}"> m</label>`;
      if (dessin.type) h += `<div id="sig-mesure" class="sig-mesure"></div><div class="sig-ligne">${!["tampon", "topo"].includes(dessin.type) ? `<button id="sig-fin" class="principal">Terminer</button><button id="sig-annul">Retirer le dernier point</button>` : ""}<button id="sig-stop">Arrêter</button></div>`;
      h += traces.length ? `<h4>Mes tracés</h4><div class="sig-liste">${traces.map((t, i) => `<div class="sig-trace"><span>${esc(t.properties.nom)}<small>${esc(t.properties.etiquette || "")}</small></span><button data-suppr="${i}" aria-label="Supprimer">✕</button></div>`).join("")}</div><div class="sig-ligne"><button id="sig-vider">Tout effacer</button></div>` : `<p class="sig-note">Distances et surfaces calculées sur l'ellipsoïde terrestre. Le tampon dessine une zone à distance fixe autour d'une parcelle (touche-la) ou d'un tracé : utile pour un périmètre de 100 m, une marge de recul…</p>`;
    }
    if (onglet === "fichiers") {
      h += `<h4>Importer</h4><label class="sig-fichier"><input type="file" id="sig-imp" accept="${mode === "pc" ? "" : ".geojson,.json,.kml,.gpx,.zip,.csv,.txt"}">Choisir un fichier…</label>
        <p class="sig-note">${mode === "pc" ? "GeoJSON, KML, GPX, Shapefile zippé, CSV (lon/lat) ; et par QGIS : GPKG, DXF (UTM 22N), SHP, TAB, MIF…" : "GeoJSON, KML, GPX, Shapefile zippé (.zip), CSV avec colonnes lon/lat. Les autres formats s'ouvrent sur le PC."}</p>`;
      if (imports.length) h += `<div class="sig-liste">${imports.map((x, i) => `<div class="sig-trace"><span>${esc(x.nom)}<small>${x.g.features.length} objets</small></span><button data-voir="${i}">${x.visible ? "Masquer" : "Montrer"}</button><button data-retirer="${i}" aria-label="Retirer">✕</button></div>`).join("")}</div>`;
      h += `<h4>Exporter mes tracés et imports</h4><div class="sig-ligne"><button data-exp="geojson">GeoJSON</button><button data-exp="kml">KML (Google Earth)</button>${mode === "pc" ? `<button data-exp="dxf">DXF pour ArchiCAD</button><button data-exp="gpkg">GPKG pour QGIS</button>` : ""}</div>`;
      h += `<h4>Télécharger l'image</h4><div class="sig-ligne"><button id="sig-png">Image de la vue (PNG)</button></div>`;
      if (mode === "pc") h += `<div class="sig-ligne"><select id="sig-resol" aria-label="Finesse"><option value="0.2">0,2 m/pixel (très fin)</option><option value="0.5" selected>0,5 m/pixel</option><option value="1">1 m/pixel</option><option value="2">2 m/pixel</option></select><button id="sig-tif">Image géoréférencée (GeoTIFF)</button></div>
        <h4>Carte PDF de la vue (QGIS)</h4><input id="sig-titre" class="sig-champ" placeholder="Titre de la carte (ex. Plan de situation AM 959)"><div class="sig-ligne"><select id="sig-format"><option>A4 paysage</option><option>A4 portrait</option><option>A3 paysage</option><option>A3 portrait</option></select><button id="sig-pdf" class="principal">Faire la carte PDF</button></div>
        <p class="sig-note">Même vue, même fond, mêmes années et tracés ; avec titre, échelle, nord, légende et sources. Fichiers rangés dans Echanges\\QGIS.</p><div id="sig-res"></div>`;
    }
    h += `</div><div id="sig-info" class="sig-info" hidden></div>`;
    panneau.innerHTML = h;
    // actions
    $$(".sig-x").onclick = () => basculer(false);
    panneau.querySelectorAll("[data-ong]").forEach(b => b.onclick = () => { onglet = b.dataset.ong; if (dessin.type && onglet !== "mesures") arreter(); else dessinerPanneau(); });
    panneau.querySelectorAll("[data-temps]").forEach(b => b.onclick = () => { etat.temps = b.dataset.temps || null; appliquerTemps(); etiquettes(); dessinerPanneau(); });
    const op = $$("#sig-op"); if (op) op.oninput = () => { etat.opTemps = Number(op.value); if (C.getLayer("sig-temps")) C.setPaintProperty("sig-temps", "raster-opacity", etat.opTemps); ecrire("etat", etat); };
    const rid = $$("#sig-rid"); if (rid) rid.onclick = () => { etat.rideau = !etat.rideau; etat.rideau ? ouvrirRideau() : fermerRideau(); ecrire("etat", etat); dessinerPanneau(); };
    const av = $$("#sig-avant"); if (av) av.onchange = () => { etat.avant = av.value; if (C2) C2.setStyle(styleAvant()); etiquettes(); ecrire("etat", etat); };
    const s2 = $$("#sig-s2"); if (s2) s2.onclick = s2Chercher;
    const s2x = $$("#sig-s2x"); if (s2x) s2x.onclick = s2Enlever;
    panneau.querySelectorAll("[data-s2]").forEach(b => b.onclick = () => s2Afficher(+b.dataset.s2));
    panneau.querySelectorAll("[data-theme]").forEach(b => b.onclick = () => { etat.themes[b.dataset.theme] = !etat.themes[b.dataset.theme]; appliquerThemes(); dessinerPanneau(); });
    panneau.querySelectorAll("[data-dessin]").forEach(b => b.onclick = () => dessin.type === b.dataset.dessin ? arreter() : commencer(b.dataset.dessin));
    const fin = $$("#sig-fin"); if (fin) fin.onclick = terminer;
    const an = $$("#sig-annul"); if (an) an.onclick = () => { dessin.pts.pop(); encours(); };
    const st = $$("#sig-stop"); if (st) st.onclick = arreter;
    const cpf = $$("#sig-pf"); if (cpf) cpf.onchange = () => { etat.pf = cpf.checked; ecrire("etat", etat); };
    const ry = $$("#sig-rayon"); if (ry) ry.onchange = () => ecrire("rayon", Number(ry.value));
    panneau.querySelectorAll("[data-suppr]").forEach(b => b.onclick = () => { traces.splice(+b.dataset.suppr, 1); majTraces(); dessinerPanneau(); });
    const vd = $$("#sig-vider"); if (vd) vd.onclick = () => { traces = []; majTraces(); dessinerPanneau(); };
    const imp = $$("#sig-imp"); if (imp) imp.onchange = () => { if (imp.files[0]) importer(imp.files[0]); };
    panneau.querySelectorAll("[data-voir]").forEach(b => b.onclick = () => { const x = imports[+b.dataset.voir]; x.visible = !x.visible; majImports(); dessinerPanneau(); });
    panneau.querySelectorAll("[data-retirer]").forEach(b => b.onclick = () => { imports.splice(+b.dataset.retirer, 1); majImports(); dessinerPanneau(); });
    panneau.querySelectorAll("[data-exp]").forEach(b => b.onclick = () => exporter(b.dataset.exp));
    const png = $$("#sig-png"); if (png) png.onclick = imageVue;
    const tif = $$("#sig-tif"); if (tif) tif.onclick = tifVue;
    const pdf = $$("#sig-pdf"); if (pdf) pdf.onclick = pdfVue;
    if (msg) { const el = $$("#sig-info"); el.textContent = msg; el.hidden = false; }
    if (dessin.type) encours();
  }
  function basculer(ouvrir) {
    panneau.hidden = !ouvrir; W.bouton && W.bouton.classList.toggle("actif", ouvrir);
    if (ouvrir) { dessinerPanneau(); if (W.surOuverture) W.surOuverture(); } else if (dessin.type) arreter();
  }

  // ------------------------------------------------------------ style
  const CSS = `
  .sig-panneau{position:fixed;z-index:8;display:flex;flex-direction:column;background:var(--sig-fond);color:var(--sig-texte);font:14px/1.4 var(--sig-police);box-shadow:0 8px 30px rgba(0,0,0,.35)}
  .sig-panneau[hidden]{display:none!important}
  .sig-telephone .sig-panneau{left:0;right:0;bottom:0;max-height:66vh;border-radius:20px 20px 0 0;padding-bottom:env(safe-area-inset-bottom,0px)}
  .sig-pc .sig-panneau{top:128px;right:22px;width:380px;max-height:calc(100vh - 170px);border:1px solid var(--sig-trait);border-radius:2px 14px 2px 14px;backdrop-filter:blur(8px)}
  .sig-tete{display:flex;align-items:center;gap:10px;padding:12px max(14px,env(safe-area-inset-right,0px)) 8px max(14px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--sig-trait)}
  .sig-tete>b{color:var(--sig-or);letter-spacing:.12em}
  .sig-ongs{display:flex;gap:6px;flex:1;min-width:0;overflow-x:auto}
  .sig-panneau button,.sig-panneau select,.sig-panneau input{font:inherit;color:inherit}
  .sig-panneau button,.sig-panneau select{background:var(--sig-bouton);border:1px solid var(--sig-trait);border-radius:10px;padding:8px 11px;min-height:40px;cursor:pointer}
  .sig-telephone .sig-panneau button,.sig-telephone .sig-panneau select{min-height:46px}
  .sig-panneau button.actif{background:var(--sig-actif);border-color:var(--sig-or);color:var(--sig-actif-texte)}
  .sig-panneau button.principal{background:var(--sig-or);border-color:var(--sig-or);color:#2b2100;font-weight:600}
  .sig-x{margin-left:auto;width:40px;padding:0!important}
  .sig-corps{overflow:auto;padding:4px max(14px,env(safe-area-inset-right,0px)) 14px max(14px,env(safe-area-inset-left,0px))}
  .sig-corps h4{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--sig-doux);margin:16px 0 8px}
  .sig-annees{display:flex;flex-wrap:wrap;gap:6px}.sig-annees button{min-width:58px}
  .sig-ligne{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.sig-ligne select{flex:1;min-width:0}
  .sig-trois{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
  .sig-note{color:var(--sig-doux);font-size:12.5px;margin:6px 0}
  .sig-curseur{display:flex;align-items:center;gap:10px;margin:10px 0;color:var(--sig-doux)}.sig-curseur input[type=range]{flex:1}
  .sig-curseur input[type=number]{width:90px;padding:8px;border-radius:10px;border:1px solid var(--sig-trait);background:var(--sig-bouton)}
  .sig-liste{display:flex;flex-direction:column;gap:6px;margin:8px 0}
  .sig-liste>button{display:flex;justify-content:space-between;align-items:center;text-align:left}.sig-liste small,.sig-bascule small,.sig-trace small,.sig-ok small{display:block;color:var(--sig-doux);font-size:12px}
  .sig-bascule{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;text-align:left;margin-bottom:8px}
  .sig-bascule i{flex:0 0 40px;height:24px;border-radius:12px;background:var(--sig-trait);position:relative}
  .sig-bascule i:after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:9px;background:#fff;transition:left .2s}
  .sig-bascule.actif i{background:var(--sig-or)}.sig-bascule.actif i:after{left:19px}
  .sig-trace{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--sig-trait)}.sig-trace span{flex:1;min-width:0}
  .sig-mesure{font-size:17px;margin:12px 0 4px}
  .sig-fichier{display:block;text-align:center;padding:14px;border:1px dashed var(--sig-or);border-radius:12px;cursor:pointer}.sig-fichier input{display:none}
  .sig-champ{width:100%;padding:10px;border-radius:10px;border:1px solid var(--sig-trait);background:var(--sig-bouton);margin:4px 0}
  .sig-ok{margin-top:10px;padding:10px;border:1px solid var(--sig-or);border-radius:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.sig-ok b{flex-basis:100%}.sig-ok small{flex-basis:100%;word-break:break-all}
  .sig-info{padding:10px 14px;background:var(--sig-actif);color:var(--sig-actif-texte);font-size:13.5px}
  .sig-rideau{position:absolute;inset:0;z-index:1;pointer-events:none}
  .sig-r-carte{position:absolute;inset:0}
  .sig-r-barre{position:absolute;top:0;bottom:0;width:4px;margin-left:-2px;background:#fff;box-shadow:0 0 10px rgba(0,0,0,.6);pointer-events:auto;cursor:ew-resize;touch-action:none}
  .sig-r-poignee{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:22px;background:#fff;color:#111;display:grid;place-items:center;font-size:20px;box-shadow:0 2px 10px rgba(0,0,0,.4)}
  .sig-r-g,.sig-r-d{position:absolute;top:calc(84px + env(safe-area-inset-top,0px));background:rgba(0,0,0,.65);color:#fff;padding:5px 10px;border-radius:12px;font:600 12.5px system-ui,sans-serif}
  .sig-r-g{left:12px}.sig-r-d{right:12px}
  .sig-pc .sig-r-g,.sig-pc .sig-r-d{top:130px}`;
  function style() {
    const s = document.createElement("style");
    const pc = `:root{--sig-fond:var(--panneau,rgba(6,22,15,.92));--sig-texte:var(--texte,#e9e2cf);--sig-trait:var(--trait,rgba(227,211,174,.25));--sig-bouton:rgba(4,17,12,.6);--sig-or:var(--or,#e8b44c);--sig-doux:var(--mute,#9fb0a8);--sig-actif:rgba(232,180,76,.16);--sig-actif-texte:var(--or,#e8b44c);--sig-police:var(--corps,system-ui,sans-serif)}`;
    const tel = `:root{--sig-fond:var(--carte,#fff);--sig-texte:var(--encre,#17211d);--sig-trait:var(--trait,#dcd8cf);--sig-bouton:var(--fond,#f5f3ee);--sig-or:var(--or,#d4a017);--sig-doux:var(--encre2,#5a6660);--sig-actif:var(--vert,#0f2a22);--sig-actif-texte:#fff;--sig-police:var(--ui,system-ui,sans-serif)}`;
    s.textContent = (mode === "pc" ? pc : tel) + CSS; document.head.appendChild(s);
  }

  // ------------------------------------------------------------ démarrage
  W.init = function (o) {
    C = o.carte; mode = o.mode || "telephone"; base = o.base || "sig_libs/";
    document.documentElement.classList.add("sig-" + mode);
    etat = Object.assign(etat, lire("etat", {})); etat.rideau = false; etat.s2 = null; traces = lire("traces", []);
    style();
    panneau = document.createElement("div"); panneau.className = "sig-panneau"; panneau.hidden = true; panneau.setAttribute("role", "dialog"); panneau.setAttribute("aria-label", "Outils SIG");
    document.body.appendChild(panneau);
    let b = o.bouton;
    if (!b) {
      b = document.createElement("button"); b.id = "b-sig"; b.title = "Outils SIG : années, satellite, mesures, fichiers"; b.setAttribute("aria-label", "Outils SIG");
      if (mode === "telephone") { b.className = "fab"; b.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg>`; }
      else b.textContent = "SIG ▾";
      (o.place || document.body).insertBefore(b, (o.place || document.body).firstChild);
    }
    W.bouton = b; b.addEventListener("click", () => basculer(panneau.hidden));
    const pret = () => { sources(); majTraces(); appliquerTemps(); appliquerThemes(); };
    quandPret(pret);
    // le fond IGN principal peut être rechargé par la page (secours, changement de style) : on remet nos couches
    C.on("styledata", () => { if (!C.getSource("sig-traces")) { try { pret(); } catch (e) {} } });
    C.on("click", e => {
      if (!dessin.type) return;
      if (dessin.type === "tampon") { tamponEn(e); return; }
      if (dessin.type === "topo") { topoEn(e); return; }
      dessin.pts.push([+e.lngLat.lng.toFixed(7), +e.lngLat.lat.toFixed(7)]); encours();
    });
    C.on("dblclick", e => { if (dessin.type && dessin.type !== "tampon") { e.preventDefault(); terminer(); } });
    W.etat = () => ({etat, traces: traces.length, imports: imports.length, dessin: dessin.type});
    W.ouvrir = (ong) => { if (ong) onglet = ong; basculer(true); };
    W.fermer = () => basculer(false);
    W.annee = id => { etat.temps = id || null; appliquerTemps(); etiquettes(); dessinerPanneau(); };
    W.theme = (id, on) => { etat.themes[id] = on !== false; appliquerThemes(); dessinerPanneau(); };
    W.rideau = on => { etat.rideau = !!on; on ? ouvrirRideau() : fermerRideau(); dessinerPanneau(); };
    W.TEMPS = TEMPS; W.THEMES = THEMES;
    W._utm = {versUTM, depuisUTM}; W._mesure = {longueur, aire};
  };
  window.WaldoSIG = W;
})();
