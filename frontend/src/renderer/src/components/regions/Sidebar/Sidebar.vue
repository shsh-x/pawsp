<script setup lang="ts">
import SidebarButton from "@renderer/components/SidebarButton/SidebarButton.vue";
import SettingsIcon from "@renderer/components/UI/Icon/SettingsIcon.vue";

import styles from "./Sidebar.module.css";
</script>

<template>
  <div :class="styles.sidebar">
    <div :class="styles.pluginList">
      <SidebarButton>Plugin</SidebarButton>
      <SidebarButton>Plugin</SidebarButton>
      <SidebarButton>Plugin</SidebarButton>
      <SidebarButton>Plugin</SidebarButton>
      <SidebarButton>Plugin</SidebarButton>
      <SidebarButton>Plugin</SidebarButton>
      <SidebarButton>Plugin</SidebarButton>
      <SidebarButton>Plugin</SidebarButton>
    </div>

    <div :class="styles.settings">
      <SidebarButton>
        <SettingsIcon width="40px" height="40px" />
      </SidebarButton>
    </div>
  </div>
</template>
