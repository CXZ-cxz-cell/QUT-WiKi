# API 示例

VitePress 支持在 Markdown 中直接使用 Vue 组件与运行时 API。

## 在 Markdown 中使用 Vue

```vue
<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

当前计数：{{ count }}

<button @click="count++">点我 +1</button>
```

渲染效果：

<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>

当前计数：{{ count }}

<button class="api-btn" @click="count++">点我 +1</button>

<style>
.api-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--vp-button-brand-border);
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  cursor: pointer;
}
.api-btn:hover { opacity: 0.85; }
</style>
