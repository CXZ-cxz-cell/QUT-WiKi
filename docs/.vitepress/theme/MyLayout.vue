<script setup>
import DefaultTheme from 'vitepress/theme'
import { ref, onMounted, onUnmounted } from 'vue'

const visible = ref(false)
const src = ref('')
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)
const lastX = ref(0)
const lastY = ref(0)
const anchorX = ref(0)
const anchorY = ref(0)

function open(s) {
  src.value = s
  visible.value = true
  scale.value = 1
  tx.value = 0
  ty.value = 0
  document.body.style.overflow = 'hidden'
}

function close() {
  visible.value = false
  document.body.style.overflow = ''
}

function onWheel(e) {
  e.preventDefault()
  const rect = e.currentTarget.getBoundingClientRect()
  const ox = e.clientX - rect.left - rect.width / 2
  const oy = e.clientY - rect.top - rect.height / 2
  const delta = e.deltaY < 0 ? 0.15 : -0.15
  const ns = Math.min(Math.max(scale.value + delta, 0.3), 6)
  const ratio = ns / scale.value
  tx.value = tx.value * ratio - ox * (ratio - 1)
  ty.value = ty.value * ratio - oy * (ratio - 1)
  scale.value = ns
}

function onDblClick(e) {
  e.preventDefault()
  if (scale.value > 1) {
    scale.value = 1
    tx.value = 0
    ty.value = 0
  } else {
    scale.value = 2.5
    tx.value = 0
    ty.value = 0
  }
}

function onPointerDown(e) {
  if (e.button !== 0) return
  dragging.value = true
  lastX.value = e.clientX
  lastY.value = e.clientY
  anchorX.value = tx.value
  anchorY.value = ty.value
  e.currentTarget.setPointerCapture(e.pointerId)
}

function onPointerMove(e) {
  if (!dragging.value) return
  tx.value = anchorX.value + (e.clientX - lastX.value)
  ty.value = anchorY.value + (e.clientY - lastY.value)
}

function onPointerUp(e) {
  const dx = Math.abs(e.clientX - lastX.value)
  const dy = Math.abs(e.clientY - lastY.value)
  if (scale.value <= 1 && dx < 3 && dy < 3) close()
  dragging.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

function onDocumentClick(e) {
  const target = e.target
  if (target instanceof HTMLImageElement && target.closest('.main')) {
    open(target.currentSrc || target.src)
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <DefaultTheme.Layout />
  <Teleport to="body">
    <div v-if="visible" class="img-viewer-bg" @click="close">
      <button class="img-viewer-close" @click="close">&times;</button>
      <div
        class="img-viewer-stage"
        @click.stop
        @wheel="onWheel"
        @dblclick="onDblClick"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
      >
        <img
          :src="src"
          class="img-viewer-img"
          :style="{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
          }"
          draggable="false"
        />
      </div>
    </div>
  </Teleport>
</template>

<style>
.img-viewer-bg {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
}

.img-viewer-close {
  position: absolute;
  top: 16px;
  right: 20px;
  z-index: 2;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.img-viewer-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.img-viewer-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.img-viewer-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
  transition: transform 0.1s ease-out;
}
</style>
