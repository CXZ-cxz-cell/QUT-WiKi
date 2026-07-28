<script setup>
import { useData } from 'vitepress'
import { computed } from 'vue'
import contributorsData from '../../contributors.json'

const { page } = useData()

const contributors = computed(() => {
  const path = page.value?.relativePath
  if (!path) return []
  return contributorsData[path] || []
})

function avatarUrl(contributor) {
  if (contributor.github) {
    return `https://github.com/${contributor.github}.png?size=40`
  }
  return null
}

function initials(name) {
  const ascii = name.match(/[A-Za-z]+/g)
  if (ascii && ascii.length) {
    return ascii.map(p => p[0].toUpperCase()).join('').slice(0, 2)
  }
  return name.slice(0, 2).toUpperCase()
}

function hue(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}
</script>

<template>
  <div v-if="contributors.length" class="contributors">
    <h3 class="contributors-title">本文贡献者</h3>
    <div class="contributors-list">
      <a
        v-for="c in contributors"
        :key="c.email"
        class="contributor-item"
        :href="c.github ? `https://github.com/${c.github}` : undefined"
        :target="c.github ? '_blank' : undefined"
        :rel="c.github ? 'noopener noreferrer' : undefined"
        :title="`${c.name}（${c.commits} 次提交）`"
      >
        <img
          v-if="avatarUrl(c)"
          :src="avatarUrl(c)"
          :alt="c.name"
          class="contributor-avatar"
          loading="lazy"
        />
        <span
          v-else
          class="contributor-avatar contributor-avatar-text"
          :style="{ background: `hsl(${hue(c.name)}, 50%, 50%)` }"
        >{{ initials(c.name) }}</span>
        <span class="contributor-name">{{ c.name }}</span>
        <span class="contributor-commits">{{ c.commits }}</span>
      </a>
    </div>
  </div>
</template>

<style scoped>
.contributors {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--vp-c-divider);
}

.contributors-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  margin: 0 0 10px;
}

.contributors-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.contributor-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 3px;
  border-radius: 20px;
  background: var(--vp-c-bg-soft);
  text-decoration: none;
  transition: background 0.15s;
}

.contributor-item:hover {
  background: var(--vp-c-bg-mute);
}

.contributor-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.contributor-avatar-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
}

.contributor-name {
  font-size: 13px;
  color: var(--vp-c-text-1);
}

.contributor-commits {
  font-size: 10px;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-mute);
  padding: 0 5px;
  border-radius: 8px;
  line-height: 16px;
}
</style>
