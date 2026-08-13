<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  BUILDINGS,
  CATEGORY_CONFIG,
  CATEGORY_ICON_PATHS,
  CAMPUS_CONFIG,
  FILTER_LIST
} from './map-data.js'

/* 高德地图 Web 端 JS API key（lbs.amap.com 控制台申请，应用类型：Web端(JS API)） */
const AMAP_KEY = 'cc942326fd33951c36e3f35a16bc204f'

const PIN_SIZE = 28
const PIN_SCALE = { idle: 1, hover: 1.3, selected: 1.4 }
const FIRST_PAINT_TIMEOUT_MS = 2500
/* 高德官方内置样式：normal 标准 / dark 夜间 */
const MAP_STYLES = { light: 'amap://styles/normal', dark: 'amap://styles/dark' }

/* ================= 状态 ================= */
const mapEl = ref(null)
let map = null
let AMap = null
const mapReady = ref(false)
const mapError = ref('')

const currentCampus = ref('h')
const currentCategory = ref('all')
const searchKeyword = ref('')
const sidebarOpen = ref(false)
const selected = ref(null)
const hoverTip = ref(null)

let markerCache = new Map()
let polygonsRef = null
let searchTimer = null
let hoverCloseTimer = null
let destroyFlag = false

/* ================= 派生数据 ================= */
const campusBuildings = computed(() =>
  BUILDINGS.filter((b) => b.campusId === currentCampus.value)
)

const filteredBuildings = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  return campusBuildings.value.filter((b) => {
    if (currentCategory.value !== 'all' && b.category !== currentCategory.value) return false
    if (kw) {
      const hay = (b.name + ' ' + (b.desc || '')).toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

/* 筛选后仍保留选中的建筑 */
const markerBuildings = computed(() => {
  const list = filteredBuildings.value
  if (!selected.value || list.some((b) => b.id === selected.value.id)) return list
  return [...list, selected.value]
})

const campusName = computed(() => CAMPUS_CONFIG[currentCampus.value]?.name || '')
const isDark = () => document.documentElement.classList.contains('dark')

/* ================= 校区建筑边界多边形（GCJ02，可选）
 * 用高德坐标拾取器描出校区范围轮廓后填入，如：
 * POLYGONS.h = [[[120.20, 35.97], [120.21, 35.97], ...]]
 * 暂无数据时留空，不影响地图使用。
 * ================= */
const POLYGONS = {
  h: [],
  s: [],
  l: []
}

/* ================= 高德地图加载 ================= */
function loadAMap() {
  return new Promise((resolve, reject) => {
    if (window.AMap) return resolve(window.AMap)
    /* 2021 年后申请的 key 需要安全密钥，必须在 SDK 脚本加载前设置 */
    window._AMapSecurityConfig = {
      securityJsCode: '08b66b63cfa12c5beccf95cb1cdb8839'
    }
    window.__QUTMapReady = () => {
      if (window.AMap) resolve(window.AMap)
      else reject(new Error('高德地图 SDK 已响应，但没有提供地图对象'))
    }
    const script = document.createElement('script')
    script.async = true
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_KEY)}&callback=__QUTMapReady`
    script.onerror = () => reject(new Error('高德地图 SDK 加载失败'))
    document.head.appendChild(script)
    setTimeout(() => reject(new Error('高德地图 SDK 加载超时')), 15000)
  })
}

/* ================= 坐标转换（仅外链导航用） ================= */
const X_PI = (Math.PI * 3000) / 180
const AXIS = 6378245
const ECCENTRICITY = 0.006693421622965943

function gcj02ToBd09([lng, lat]) {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI)
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI)
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006]
}

function transformLat(lng, lat) {
  let v = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  v += ((20 * Math.sin(6 * lng * Math.PI) + 20 * Math.sin(2 * lng * Math.PI)) * 2) / 3
  v += ((20 * Math.sin(lat * Math.PI) + 40 * Math.sin((lat / 3) * Math.PI)) * 2) / 3
  v += ((160 * Math.sin((lat / 12) * Math.PI) + 320 * Math.sin((lat * Math.PI) / 30)) * 2) / 3
  return v
}

function transformLng(lng, lat) {
  let v = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  v += ((20 * Math.sin(6 * lng * Math.PI) + 20 * Math.sin(2 * lng * Math.PI)) * 2) / 3
  v += ((20 * Math.sin(lng * Math.PI) + 40 * Math.sin((lng / 3) * Math.PI)) * 2) / 3
  v += ((150 * Math.sin((lng / 12) * Math.PI) + 300 * Math.sin((lng / 30) * Math.PI)) * 2) / 3
  return v
}

function gcj02ToWgs84([lng, lat]) {
  const dLat = transformLat(lng - 105, lat - 35)
  const dLng = transformLng(lng - 105, lat - 35)
  const rad = (lat / 180) * Math.PI
  const magic = 1 - ECCENTRICITY * Math.sin(rad) ** 2
  const sqrtMagic = Math.sqrt(magic)
  const aLat = (dLat * 180) / (((AXIS * (1 - ECCENTRICITY)) / (magic * sqrtMagic)) * Math.PI)
  const aLng = (dLng * 180) / ((AXIS / sqrtMagic) * Math.cos(rad) * Math.PI)
  return [lng * 2 - (lng + aLng), lat * 2 - (lat + aLat)]
}

function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* ================= Lucide 分类图标（marker / 列表 / 详情卡用） ================= */
function categoryIconMarkup(category, size = 14) {
  const paths = CATEGORY_ICON_PATHS[category] || ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
  )
}

/* ================= 导航链接（5 平台） ================= */
function navigationLinksFor(b) {
  const [lng, lat] = b.coord
  const [bdLng, bdLat] = gcj02ToBd09(b.coord)
  const [wgsLng, wgsLat] = gcj02ToWgs84(b.coord)
  const name = encodeURIComponent(b.name)
  return [
    { id: 'amap', label: '高德', href: `https://uri.amap.com/marker?position=${lng},${lat}&name=${name}&src=QUTWiKi&coordinate=gaode&callnative=1` },
    { id: 'baidu', label: '百度', href: `https://api.map.baidu.com/marker?location=${bdLat},${bdLng}&title=${name}&content=${name}&output=html&src=webapp.QUTWiKi` },
    { id: 'tencent', label: '腾讯', href: `https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${name};addr:${name}&referer=QUTWiKi` },
    { id: 'apple', label: 'Apple', href: `https://maps.apple.com/?ll=${wgsLat},${wgsLng}&q=${name}` }
  ]
}

/* ================= 地图初始化 ================= */
function initMap() {
  const campus = CAMPUS_CONFIG[currentCampus.value]
  map = new AMap.Map(mapEl.value, {
    center: campus.coord,
    zoom: campus.zoom,
    mapStyle: MAP_STYLES[isDark() ? 'dark' : 'light'],
    viewMode: '2D',
    scrollWheel: true
  })
  renderPolygons(campus.id)
  mapReady.value = true
}

function renderPolygons(campusId) {
  if (polygonsRef) {
    try { map.remove(polygonsRef) } catch (e) { /* noop */ }
    polygonsRef = null
  }
  const paths = (POLYGONS[campusId] || [])
  if (!paths.length || !map) return
  polygonsRef = paths.map((path) =>
    new AMap.Polygon({
      path,
      fillColor: '#4069B2',
      fillOpacity: 0.08,
      strokeColor: '#4069B2',
      strokeOpacity: 0.8,
      strokeStyle: 'dashed',
      strokeWeight: 2,
      zIndex: 2
    })
  )
  map.add(polygonsRef)
}

/* ================= marker（缓存 + 增量更新） ================= */
function markerPinMarkup(category) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" style="display:block;filter:drop-shadow(0 1px 2px rgb(15 23 42 / .2))">' +
    '<path d="M12 2c-3.87 0-7 3.13-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Z" fill="var(--c-primary)" stroke="rgba(255,255,255,0.9)" stroke-width="1" stroke-linejoin="round" style="transition:fill 160ms ease"/></svg>' +
    '<span style="position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);color:#fff;display:grid;place-items:center">' +
    categoryIconMarkup(category, 11) +
    '</span>'
  )
}

function applyPinState(root, selectedFlag) {
  const body = root.querySelector('[data-map-pin-body]')
  if (!body) return
  body.dataset.selected = selectedFlag ? 'true' : 'false'
  body.style.transform = `scale(${selectedFlag ? PIN_SCALE.selected : PIN_SCALE.idle})`
  const pin = body.querySelector('svg path')
  if (pin) pin.style.fill = selectedFlag ? 'var(--c-primary-hover)' : 'var(--c-primary)'
}

function applyPinHover(root, hovered) {
  const body = root.querySelector('[data-map-pin-body]')
  if (!body) return
  const selectedFlag = body.dataset.selected === 'true'
  body.style.transform = `scale(${selectedFlag ? PIN_SCALE.selected : hovered ? PIN_SCALE.hover : PIN_SCALE.idle})`
}

function createMarkerPin(building, selectedFlag) {
  const root = document.createElement('div')
  root.className = 'qut-pin-root'
  root.dataset.buildingId = building.id

  const body = document.createElement('div')
  body.dataset.mapPinBody = 'true'
  body.dataset.selected = selectedFlag ? 'true' : 'false'
  body.style.transform = `scale(${selectedFlag ? PIN_SCALE.selected : PIN_SCALE.idle})`
  body.innerHTML = markerPinMarkup(building.category)

  root.appendChild(body)
  return root
}

function renderMarkers() {
  if (!map || !AMap) return
  const list = markerBuildings.value
  const visibleIds = new Set(list.map((b) => b.id))

  for (const [id, entry] of markerCache) {
    if (visibleIds.has(id)) continue
    entry.marker.off('click', entry.listeners.click)
    entry.marker.off('mouseover', entry.listeners.mouseover)
    entry.marker.off('mouseout', entry.listeners.mouseout)
    map.remove(entry.marker)
    markerCache.delete(id)
    if (hoverTip.value?.building.id === id) hoverTip.value = null
  }

  for (const b of list) {
    if (markerCache.has(b.id)) {
      applyPinState(markerCache.get(b.id).root, b.id === selected.value?.id)
      continue
    }
    const root = createMarkerPin(b, b.id === selected.value?.id)
    const marker = new AMap.Marker({
      position: b.coord,
      content: root,
      offset: new AMap.Pixel(-PIN_SIZE / 2, -PIN_SIZE),
      zIndex: b.id === selected.value?.id ? 120 : 10
    })
    const listeners = {
      click: () => onSelect(b),
      mouseover: () => showHoverTip(b, root),
      mouseout: () => hideHoverTip(root)
    }
    marker.on('click', listeners.click)
    marker.on('mouseover', listeners.mouseover)
    marker.on('mouseout', listeners.mouseout)
    map.add(marker)
    markerCache.set(b.id, { marker, root, listeners })
  }
}

/* ================= hover 提示（跟随地图移动） ================= */
function showHoverTip(building, root) {
  if (!map) return
  clearHoverCloseTimer()
  applyPinHover(root, true)
  const { x, y } = map.lngLatToContainer(building.coord)
  hoverTip.value = { building, x, y: y - PIN_SIZE * PIN_SCALE.hover }
}

function hideHoverTip(root) {
  applyPinHover(root, false)
  clearHoverCloseTimer()
  hoverCloseTimer = setTimeout(() => { hoverTip.value = null }, 80)
}

function clearHoverCloseTimer() {
  if (hoverCloseTimer) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null }
}

watch(hoverTip, (tip) => {
  if (!tip) return
  const sync = () => {
    if (!map || !hoverTip.value || hoverTip.value.building.id !== tip.building.id) return
    const { x, y } = map.lngLatToContainer(tip.building.coord)
    const nextY = y - PIN_SIZE * PIN_SCALE.hover
    if (Math.abs(hoverTip.value.x - x) < 0.5 && Math.abs(hoverTip.value.y - nextY) < 0.5) return
    hoverTip.value = { building: tip.building, x, y: nextY }
  }
  map.on('mapmove', sync)
  map.on('zoomchange', sync)
  return () => {
    map.off('mapmove', sync)
    map.off('zoomchange', sync)
  }
})

/* ================= 选中 ================= */
function onSelect(b) {
  selected.value = b
  if (map) {
    for (const [id, entry] of markerCache) {
      const isSelected = id === b.id
      applyPinState(entry.root, isSelected)
      entry.marker.setzIndex(isSelected ? 120 : 10)
    }
    hoverTip.value = null
    map.panTo(b.coord)
  }
  if (window.matchMedia('(max-width: 767px)').matches) sidebarOpen.value = false
}

function clearSelection() {
  selected.value = null
  for (const [, entry] of markerCache) {
    applyPinState(entry.root, false)
    entry.marker.setzIndex(10)
  }
}

function selectCampus(e) {
  const next = e.target.value
  if (next === currentCampus.value) return
  currentCampus.value = next
  selected.value = null
  currentCategory.value = 'all'
  searchKeyword.value = ''
  if (map) {
    const c = CAMPUS_CONFIG[next]
    map.setZoomAndCenter(c.zoom, c.coord)
    clearMarkerCache()
    renderPolygons(next)
    renderMarkers()
  }
}

function clearMarkerCache() {
  for (const [, entry] of markerCache) {
    try { map.remove(entry.marker) } catch (e) { /* noop */ }
  }
  markerCache.clear()
}

function selectCategory(e) {
  currentCategory.value = e.target.value
  renderMarkers()
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(renderMarkers, 200)
}

function clearSearch() {
  searchKeyword.value = ''
  onSearchInput()
}

/* ================= 主题联动（MutationObserver 监听 html.dark，切换高德官方夜间样式） ================= */
let themeObserver = null

function applyMapTheme() {
  if (!map) return
  const dark = document.documentElement.classList.contains('dark')
  const style = MAP_STYLES[dark ? 'dark' : 'light']
  if (map.getMapStyle && map.getMapStyle() !== style) {
    map.setMapStyle(style)
  }
}

function startThemeObserver() {
  themeObserver = new MutationObserver(() => applyMapTheme())
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })
}

/* ================= 生命周期 ================= */
async function bootstrap() {
  try {
    AMap = await loadAMap()
    await nextTick()
    initMap()
    renderMarkers()
    startThemeObserver()
    applyMapTheme()
  } catch (e) {
    console.error('[MapView] init failed:', e)
    mapError.value = '地图加载失败：' + (e && e.message ? e.message : String(e))
  }
}

function retry() {
  mapError.value = ''
  bootstrap()
}

onMounted(() => {
  bootstrap()
})

onUnmounted(() => {
  destroyFlag = true
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
  clearHoverCloseTimer()
  if (searchTimer) clearTimeout(searchTimer)
  if (map) {
    try { map.destroy() } catch (e) { /* noop */ }
    map = null
  }
  markerCache.clear()
})
</script>

<template>
  <section class="map-section">
    <!-- 顶部工具条（3.5rem，抄 CQU-openlib） -->
    <header class="map-header">
      <h1 class="map-title">校园地图</h1>
      <div class="campus-select-wrap">
        <select class="campus-select" :value="currentCampus" @change="selectCampus" aria-label="选择校区">
          <option v-for="(cfg, key) in CAMPUS_CONFIG" :key="key" :value="key">{{ cfg.name }}</option>
        </select>
        <svg class="campus-caret" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="map-header-right">
        <button class="mobile-list-btn" aria-label="打开地点列表" @click="sidebarOpen = true">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>
        </button>
      </div>
    </header>

    <div class="map-body">
      <!-- 左侧地点列表 -->
      <aside class="map-sidebar" :class="{ 'map-sidebar-open': sidebarOpen }" aria-label="校园地点">
        <div class="sidebar-mobile-head">
          <span>校园地点</span>
          <button class="icon-btn" aria-label="关闭地点列表" @click="sidebarOpen = false">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div class="sidebar-search">
          <label class="search-box">
            <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <span class="sr-only">搜索地点</span>
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="搜索"
              @input="onSearchInput"
            />
            <button v-if="searchKeyword" class="icon-btn clear-btn" aria-label="清空搜索" @click="clearSearch">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </label>
          <select class="category-select" :value="currentCategory" @change="selectCategory" aria-label="地点分类">
            <option v-for="item in FILTER_LIST" :key="item.key" :value="item.key">{{ item.label }}</option>
          </select>
        </div>

        <div class="building-list">
          <button
            v-for="b in filteredBuildings"
            :key="b.id"
            type="button"
            class="building-item"
            :class="{ active: selected?.id === b.id }"
            @click="onSelect(b)"
          >
            <span class="cat-icon" :style="{ color: (CATEGORY_CONFIG[b.category] || {}).color || '#2C8AC9' }" v-html="categoryIconMarkup(b.category, 14)"></span>
            <span class="building-info">
              <span class="building-name">{{ b.name }}</span>
              <span v-if="b.desc" class="building-desc">{{ b.desc }}</span>
            </span>
          </button>
          <div v-if="filteredBuildings.length === 0" class="empty-tip">
            <svg class="empty-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
            <p class="empty-title">没有匹配的地点</p>
            <p class="empty-sub">换个关键词或分类试试</p>
          </div>
        </div>
      </aside>

      <!-- 移动端遮罩 -->
      <div v-if="sidebarOpen" class="map-scrim" @click="sidebarOpen = false"></div>

      <!-- 右侧地图 -->
      <div class="map-canvas">
        <div ref="mapEl" class="map-el"></div>

        <!-- 加载 / 错误占位层 -->
        <div v-if="!mapReady && !mapError" class="map-placeholder">
          <span class="spinner"></span>
          <p class="placeholder-text">地图加载中</p>
        </div>
        <div v-if="mapError" class="map-placeholder">
          <p class="error-title">地图暂时不可用</p>
          <p class="error-desc">{{ mapError }}</p>
          <button class="retry-btn" type="button" @click="retry">重新加载</button>
        </div>

        <!-- hover 悬浮提示 -->
        <div
          v-if="hoverTip"
          class="map-hover-tip"
          :style="{ left: hoverTip.x + 'px', top: hoverTip.y + 'px' }"
        >
          <p class="hover-name">{{ hoverTip.building.name }}</p>
          <p class="hover-cat">{{ (CATEGORY_CONFIG[hoverTip.building.category] || {}).label || '其他' }}</p>
        </div>

        <!-- 移动端：打开地点列表浮层按钮（仅小屏显示） -->
        <button
          v-if="!sidebarOpen"
          type="button"
          class="mobile-open-list"
          aria-label="打开地点列表"
          @click="sidebarOpen = true"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/></svg>
          {{ filteredBuildings.length }} 个地点
        </button>

        <!-- 缩放控件 -->
        <div class="map-zoom-ctrl">
          <button class="zoom-btn" aria-label="放大地图" :disabled="!mapReady" @click="map && map.zoomIn()">
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          </button>
          <div class="zoom-divider"></div>
          <button class="zoom-btn" aria-label="缩小地图" :disabled="!mapReady" @click="map && map.zoomOut()">
            <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>
          </button>
        </div>

        <!-- 选中地点详情卡片（右下角） -->
        <section v-if="selected" class="map-detail-card">
          <div class="detail-head">
            <span class="detail-icon" v-html="categoryIconMarkup(selected.category, 15)"></span>
            <div class="detail-info">
              <h2 class="detail-name">{{ selected.name }}</h2>
              <p v-if="selected.desc" class="detail-desc">{{ selected.desc }}</p>
            </div>
            <button class="icon-btn" aria-label="关闭地点详情" @click="clearSelection">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <div class="nav-btns">
            <a
              v-for="link in navigationLinksFor(selected)"
              :key="link.id"
              :href="link.href"
              target="_blank"
              rel="noopener noreferrer"
              class="nav-btn"
            >
              {{ link.label }}
            </a>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ============================================================
   CQU-openlib 设计体系（抄自其 theme/colors.ts，OKLCH）
   ============================================================ */
.map-section {
  --c-primary: #015D95;
  --c-primary-hover: #014A78;
  --c-primary-soft: rgba(1, 93, 149, 0.1);
  --c-primary-faint: rgba(1, 93, 149, 0.06);
  --c-mist: rgba(1, 93, 149, 0.06);
  --c-ink: #213547;
  --c-muted: #838387;
  --c-line: rgba(33, 53, 71, 0.09);
  --c-paper: #f6f6f7;
  --c-panel: #ffffff;
  --c-elev: #ffffff;
  --c-icon: #a1a1a6;
  --c-icon-strong: #3c3c43;
  --c-backdrop: rgba(33, 53, 71, 0.4);

  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--vp-nav-height, 64px));
  width: 100%;
  overflow: hidden;
  background: var(--c-paper);
  color: var(--c-ink);
  font-family: inherit;
}

html.dark .map-section {
  --c-primary: #4AB3E8;
  --c-primary-hover: #7CC4EC;
  --c-primary-soft: rgba(74, 179, 232, 0.16);
  --c-primary-faint: rgba(74, 179, 232, 0.09);
  --c-mist: rgba(74, 179, 232, 0.09);
  --c-ink: rgba(235, 235, 245, 0.92);
  --c-muted: rgba(235, 235, 245, 0.52);
  --c-line: rgba(235, 235, 245, 0.11);
  --c-paper: #161618;
  --c-panel: #252529;
  --c-elev: #2f2f33;
  --c-icon: #6b6b70;
  --c-icon-strong: rgba(235, 235, 245, 0.82);
  --c-backdrop: rgba(0, 0, 0, 0.55);
}

/* ===== 顶部工具条 ===== */
.map-header {
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 3.5rem;
  flex-shrink: 0;
  padding: 0 12px;
  border-bottom: 1px solid var(--c-line);
  background: var(--c-panel);
}
.map-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--c-ink);
  white-space: nowrap;
  line-height: 1.2;
}
.campus-select-wrap {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.campus-select {
  max-width: 100%;
  appearance: none;
  -webkit-appearance: none;
  padding: 4px 26px 4px 10px;
  font-size: 13px;
  color: var(--c-ink);
  background: var(--c-paper);
  border: 1px solid var(--c-line);
  border-radius: 6px;
  cursor: pointer;
  outline: none;
}
.campus-select:focus {
  border-color: var(--c-primary);
}
.campus-caret {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--c-icon);
}
.map-header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: auto;
}
.mobile-list-btn {
  display: none;
  width: 32px;
  height: 32px;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--c-icon-strong);
  cursor: pointer;
}
.mobile-list-btn:hover {
  background: var(--c-mist);
}

/* ===== 主体 ===== */
.map-body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ===== 左侧地点列表 ===== */
.map-sidebar {
  display: flex;
  flex-direction: column;
  width: 21rem;
  flex-shrink: 0;
  background: var(--c-panel);
  border-right: 1px solid var(--c-line);
}
.sidebar-mobile-head {
  display: none;
  align-items: center;
  justify-content: space-between;
  height: 2.5rem;
  padding: 0 12px;
  border-bottom: 1px solid var(--c-line);
}
.sidebar-mobile-head span {
  font-size: 12px;
  font-weight: 500;
  color: var(--c-muted);
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--c-icon-strong);
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--c-mist);
}

.sidebar-search {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--c-line);
}
.search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 40px;
  border: 1px solid var(--c-line);
  border-radius: 6px;
  background: var(--c-paper);
  transition: border-color 0.15s;
}
.search-box:focus-within {
  border-color: var(--c-primary);
}
.search-icon {
  position: absolute;
  left: 10px;
  color: var(--c-icon-strong);
}
.search-box input {
  width: 100%;
  height: 100%;
  padding: 0 30px 0 32px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--c-ink);
  outline: none;
}
.search-box input::placeholder {
  color: var(--c-muted);
}
.clear-btn {
  position: absolute;
  right: 6px;
}
.category-select {
  width: 8.5rem;
  padding: 0 8px;
  font-size: 12px;
  color: var(--c-ink);
  background: var(--c-paper);
  border: 1px solid var(--c-line);
  border-radius: 6px;
  cursor: pointer;
  outline: none;
}
.category-select:focus {
  border-color: var(--c-primary);
}

.building-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 8px;
}
.building-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid var(--c-line);
  background: var(--c-panel);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}
.building-item:hover {
  background: var(--c-mist);
}
.building-item.active {
  background: var(--c-primary-faint);
}
.cat-icon {
  margin-top: 2px;
  flex-shrink: 0;
  opacity: 0.9;
}
.building-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.building-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--c-ink);
  line-height: 1.3;
}
.building-desc {
  font-size: 12px;
  color: var(--c-muted);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}
.empty-tip {
  padding: 40px 24px;
  text-align: center;
}
.empty-icon {
  margin: 0 auto;
  color: var(--c-icon-strong);
  display: block;
}
.empty-title {
  margin: 8px 0 4px;
  font-weight: 500;
  color: var(--c-ink);
}
.empty-sub {
  margin: 0;
  font-size: 12px;
  color: var(--c-muted);
}

/* ===== 地图画布 ===== */
.map-canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.map-el {
  position: absolute;
  inset: 0;
}
.map-placeholder {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--c-paper);
}
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--c-line);
  border-top-color: var(--c-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.placeholder-text {
  margin: 0;
  font-size: 13px;
  color: var(--c-muted);
}
.error-title {
  margin: 0;
  font-weight: 500;
  color: var(--c-ink);
}
.error-desc {
  margin: 0;
  font-size: 12px;
  color: var(--c-muted);
  max-width: 320px;
  text-align: center;
}
.retry-btn {
  margin-top: 8px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--c-line);
  border-radius: 6px;
  background: var(--c-panel);
  font-size: 12px;
  font-weight: 500;
  color: var(--c-ink);
  cursor: pointer;
}
.retry-btn:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}

/* hover 悬浮提示 */
.map-hover-tip {
  position: absolute;
  z-index: 80;
  pointer-events: none;
  transform: translate(-50%, -100%) translateY(-8px);
  padding: 6px 10px;
  border: 1px solid var(--c-line);
  border-radius: 6px;
  background: var(--c-elev);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  white-space: nowrap;
  text-align: center;
}
.hover-name {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--c-ink);
  line-height: 1.3;
}
.hover-cat {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--c-muted);
}

/* 缩放控件 */
.map-zoom-ctrl {
  position: absolute;
  right: 12px;
  top: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--c-line);
  border-radius: 6px;
  background: var(--c-panel);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.zoom-btn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--c-icon-strong);
  cursor: pointer;
  transition: background 0.15s;
}
.zoom-btn:hover:not(:disabled) {
  background: var(--c-mist);
  color: var(--c-primary);
}
.zoom-btn:disabled {
  color: var(--c-icon);
  cursor: not-allowed;
}
.zoom-divider {
  height: 1px;
  background: var(--c-line);
}

/* 选中详情卡片（右下角浮出） */
.map-detail-card {
  position: absolute;
  right: 12px;
  bottom: 16px;
  left: 12px;
  z-index: 10;
  padding: 12px;
  border: 1px solid var(--c-line);
  border-radius: 8px;
  background: var(--c-elev);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  animation: detail-in 0.2s ease-out;
}
@keyframes detail-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.detail-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.detail-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: 1px solid var(--c-primary);
  border-radius: 6px;
  background: var(--c-panel);
  color: var(--c-icon-strong);
}
.detail-info {
  flex: 1;
  min-width: 0;
}
.detail-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--c-ink);
  line-height: 1.3;
}
.detail-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--c-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.nav-btns {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 10px;
}
.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 4px;
  border: 1px solid var(--c-line);
  border-radius: 6px;
  background: var(--c-paper);
  font-size: 12px;
  font-weight: 500;
  color: var(--c-ink);
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.15s;
}
.nav-btn:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}

/* 移动端遮罩：仅覆盖地图区域，不盖住顶部工具条（header z-30 以上可点） */
.map-scrim {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: var(--c-backdrop);
}

/* 移动端：打开地点列表浮层按钮（仅小屏显示） */
.mobile-open-list {
  display: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ===== 移动端 ===== */
@media (max-width: 767px) {
  .mobile-list-btn {
    display: grid;
  }
  .mobile-open-list {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 10;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--c-line);
    border-radius: 6px;
    background: var(--c-panel);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    font-size: 13px;
    font-weight: 500;
    color: var(--c-icon-strong);
    cursor: pointer;
  }
  .map-sidebar {
    position: fixed;
    top: calc(var(--vp-nav-height, 64px) + 3.5rem);
    left: 0;
    bottom: 0;
    z-index: 21;
    width: min(22rem, 88vw);
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }
  .map-sidebar-open {
    transform: translateX(0);
  }
  .sidebar-mobile-head {
    display: flex;
  }
  .map-detail-card {
    right: 8px;
    left: 8px;
  }
}
</style>

<style>
/* ===== 全局（非 scoped）：高德 marker 内部样式 ===== */
/* 压低下高德版权/logo 层级，避免盖住侧边栏等 UI */
.map-section .amap-copyright,
.map-section .amap-logo {
  z-index: 5 !important;
}

.qut-pin-root {
  position: relative;
  width: 28px;
  height: 28px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.qut-pin-root [data-map-pin-body] {
  position: relative;
  width: 28px;
  height: 28px;
  transform-origin: bottom center;
  transition: transform 200ms ease-out;
  will-change: transform;
}
.qut-pin-root > [data-map-pin-body] > svg {
  position: absolute;
  inset: 0;
  width: 28px;
  height: 28px;
}
.qut-pin-root > [data-map-pin-body] > span {
  pointer-events: none;
}
</style>
