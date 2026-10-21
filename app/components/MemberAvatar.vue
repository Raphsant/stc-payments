<script setup lang="ts">
const props = defineProps<{ username: string; avatarUrl?: string | null; size?: number }>()
const { avatarGrad, initial } = useMemberFormat()
const px = computed(() => props.size ?? 36)
// Discord avatar URLs go stale when a member changes their picture.
const broken = ref(false)
watch(() => props.avatarUrl, () => { broken.value = false })
const showImg = computed(() => !!props.avatarUrl && !broken.value)
</script>

<template>
  <div
    class="m-av"
    :style="{
      width: `${px}px`, height: `${px}px`, fontSize: `${Math.round(px * 0.47)}px`,
      borderRadius: `${Math.round(px / 4)}px`,
      ...(showImg ? {} : { background: avatarGrad(username) }),
    }"
  >
    <img v-if="showImg" :src="avatarUrl!" :alt="username" @error="broken = true">
    <template v-else>{{ initial(username) }}</template>
  </div>
</template>

<style scoped>
.m-av {
  flex-shrink: 0; display: grid; place-items: center;
  font-family: var(--disp); font-weight: 800; color: var(--text);
  border: 1px solid var(--line-2); overflow: hidden;
}
.m-av img { width: 100%; height: 100%; object-fit: cover; }
</style>
