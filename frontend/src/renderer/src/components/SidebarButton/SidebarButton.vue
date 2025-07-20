<script setup lang="ts">
import { ButtonHTMLAttributes } from "vue";

import styles from "./SidebarButton.module.css";

const props = defineProps</* @vue-ignore */ ButtonHTMLAttributes>();
</script>

<template>
  <button v-bind="props" :class="styles.button">
    <slot />
  </button>
</template>
