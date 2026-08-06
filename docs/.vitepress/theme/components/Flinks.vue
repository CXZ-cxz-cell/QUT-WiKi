<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'
import Flink from './Flink.vue'

export interface FlinkItem {
  name: string
  link: string
  avatar?: string
  siteshot?: string
  desc?: string
  descr?: string
}

const props = withDefaults(defineProps<{
  links?: FlinkItem[]
}>(), {
  links: undefined,
})

const { frontmatter } = useData()

const items = computed<FlinkItem[]>(
  () => props.links ?? (frontmatter.value.flinks as FlinkItem[] | undefined) ?? [],
)
</script>

<template>
  <div class="qut-flinks" role="list">
    <Flink
      v-for="(item, index) in items"
      :key="index"
      :name="item.name"
      :link="item.link"
      :avatar="item.avatar"
      :siteshot="item.siteshot"
      :desc="item.desc ?? item.descr"
    />
  </div>
</template>
