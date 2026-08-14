<template>
  <view v-if="node && node.hr" class="rt-hr" />

  <!-- 绝大多数消息没有 ANSI 样式：直接使用一个文本节点，避免富文本解析和大量子节点。 -->
  <text v-else-if="renderMode === 'plain'" class="rt" :style="outer">{{ plainText }}</text>

  <!-- 有颜色但没有命令：一次性提交 nodes，避免每个 ANSI 片段各建一个 Vue 组件节点。 -->
  <rich-text
    v-else-if="renderMode === 'rich'"
    class="rt rt-rich"
    :style="outer"
    :nodes="richNodes"
  />

  <!-- 只有真正包含行内命令时才保留分段事件节点。 -->
  <text v-else class="rt" :style="outer">
    <template v-for="(seg, i) in interactiveSegments" :key="i">
      <text
        v-if="seg.btn"
        class="rt-btn"
        hover-class="hp"
        :data-id="seg.id"
        :data-label="seg.t"
        @tap.stop="onBtn(seg)"
      >{{ seg.t }}</text>
      <text v-else :style="seg.style">{{ seg.t }}</text>
    </template>
  </text>
</template>

<script setup>
import { computed } from 'vue'
import { parseRich } from '@/utils/ansi.js'
import { state } from '@/utils/store.js'
import { mapRichColorsForLight } from '@/utils/theme.js'

const props = defineProps({
  node: { type: Object, default: null },
  segs: { type: Array, default: null },
  // 大型按钮列表可传原始文字，只在按钮真正挂载时才解析 ANSI。
  text: { type: String, default: null },
  size: { type: [Number, String], default: 24 }
})

const emit = defineEmits(['btn'])

const segList = computed(() => {
  if (props.node && props.node.hr) return []
  if (props.segs) return props.segs
  if (props.node && props.node.segs) return props.node.segs
  if (props.node && props.node.raw !== undefined) return parseRich(props.node.raw)
  if (props.text !== null) return parseRich(props.text)
  return []
})

const outer = computed(() => ({ fontSize: props.size + 'rpx' }))
const plainText = computed(() => segList.value.map((seg) => seg.t || '').join(''))

function styleText(seg) {
  const styles = []
  const colors = state.themeMode === 'light'
    ? mapRichColorsForLight(seg.fg, seg.bg)
    : { fg: seg.fg, bg: seg.bg }
  if (colors.fg) styles.push('color:' + colors.fg)
  if (colors.bg) styles.push('background-color:' + colors.bg)
  if (seg.bold) styles.push('font-weight:bold')
  if (seg.under) styles.push('text-decoration:underline')
  return styles.join(';')
}

const renderMode = computed(() => {
  let styled = false
  for (const seg of segList.value) {
    if (seg.btn) return 'interactive'
    if (seg.fg || seg.bg || seg.bold || seg.under) styled = true
  }
  return styled ? 'rich' : 'plain'
})

const richNodes = computed(() => segList.value.map((seg) => {
  const style = styleText(seg)
  const text = { type: 'text', text: seg.t || '' }
  return style
    ? { name: 'span', attrs: { style }, children: [text] }
    : text
}))

const interactiveSegments = computed(() => segList.value.map((seg) => ({
  ...seg,
  style: seg.btn ? '' : styleText(seg)
})))

function onBtn(seg) {
  emit('btn', { cmd: seg.id, label: seg.t })
}
</script>

<style>
.rt {
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--app-text, #dddddd);
}
.rt-rich {
  display: inline;
}
.rt-btn {
  display: inline;
  color: var(--app-primary, #7fb2ff);
  background-color: var(--app-primary-soft, rgba(70, 130, 255, 0.15));
  padding-left: 6rpx;
  padding-right: 6rpx;
  margin: 0 2rpx;
  border-bottom: var(--app-border-width, 1rpx) solid var(--app-primary-hover, #4a7fd0);
  border-radius: var(--app-radius-small, 4rpx);
}
.rt-hr {
  height: 1rpx;
  margin: 6rpx 0;
  background: var(--app-border, #555555);
  border: none;
}
</style>
