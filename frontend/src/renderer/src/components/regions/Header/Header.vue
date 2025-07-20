<script setup lang="ts">
import CrossIcon from "@renderer/components/UI/Icon/CrossIcon.vue";
import DashIcon from "@renderer/components/UI/Icon/DashIcon.vue";

import styles from "./Header.module.css";

const minimizeWindow = (): void => {
  window.api.electron.minimizeWindow();
};

const closeApplication = (): void => {
  window.api.electron.closeApp();
};
</script>

<template>
  <header :class="styles.header">
    <div>
      <div :class="styles.appTitle">Swap</div>
    </div>

    <div>
      <button :class="styles.button" @click="minimizeWindow">
        <DashIcon width="15px" height="16px" />
      </button>
      <button
        :class="[styles.button, styles.closeWindowButton]"
        @click="closeApplication"
      >
        <CrossIcon width="16px" height="16px" />
      </button>
    </div>
  </header>
</template>
