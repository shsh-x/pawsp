<script setup lang="ts">
import { BaseIcon } from "@renderer/components/UI/Icon/Icon";

const {
  color = "#fff",
  width = "16px",
  height = "16px",
} = defineProps<BaseIcon>();
</script>

<template>
  <svg
    :width="width"
    :height="height"
    viewBox="0 0 16 16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path :fill="color" d="M2 8a1 1 0 011-1h10a1 1 0 110 2H3a1 1 0 01-1-1z" />
  </svg>
</template>
