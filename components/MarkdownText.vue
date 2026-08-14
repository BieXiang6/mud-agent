<template>
  <rich-text class="md-text" :nodes="html" />
</template>

<script setup>
import { computed } from 'vue'
import { markdownToHtml } from '@/utils/markdown.js'

const props = defineProps({ content: { type: String, default: '' } })
const html = computed(() => markdownToHtml(props.content))
</script>

<style>
.md-text { display: block; color: inherit; line-height: 1.55; word-break: break-word; }
.md-text :deep(p) { margin: 4rpx 0 10rpx; }
.md-text :deep(h1), .md-text :deep(h2), .md-text :deep(h3), .md-text :deep(h4), .md-text :deep(h5), .md-text :deep(h6) { margin: 12rpx 0 8rpx; color: inherit; font-weight: bold; }
.md-text :deep(h1) { font-size: 1.35em; }
.md-text :deep(h2) { font-size: 1.25em; }
.md-text :deep(h3) { font-size: 1.15em; }
.md-text :deep(ul), .md-text :deep(ol) { margin: 6rpx 0 10rpx; padding-left: 34rpx; }
.md-text :deep(li) { margin: 3rpx 0; }
.md-text :deep(blockquote) { margin: 8rpx 0; padding: 6rpx 12rpx; border-left: 5rpx solid var(--app-primary); background: var(--app-primary-soft); color: var(--app-text-muted); }
.md-text :deep(code) { padding: 2rpx 6rpx; border-radius: var(--app-radius-small, 4rpx); background: var(--app-code-background); color: var(--app-text); font-family: monospace; }
.md-text :deep(pre) { margin: 8rpx 0 12rpx; padding: 10rpx; overflow-x: auto; border: var(--app-border-width, 1rpx) solid var(--app-border); background: var(--app-input-background); white-space: pre-wrap; word-break: break-all; }
.md-text :deep(pre code) { padding: 0; background: transparent; }
.md-text :deep(a) { color: var(--app-primary); text-decoration: underline; }
.md-text :deep(hr) { height: 1rpx; margin: 12rpx 0; border: 0; background: var(--app-border); }
.md-text :deep(table) { width: 100%; margin: 8rpx 0 12rpx; border-collapse: collapse; }
.md-text :deep(th), .md-text :deep(td) { padding: 6rpx 8rpx; border: var(--app-border-width, 1rpx) solid var(--app-border); text-align: left; }
.md-text :deep(th) { background: var(--app-surface-muted); font-weight: bold; }
</style>
