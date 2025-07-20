import { SplashTips } from "./tips";

document.addEventListener("DOMContentLoaded", () => {
  const statusMessageEl = document.querySelector(
    ".status-message",
  ) as HTMLDivElement;
  const tipTextEl = document.querySelector(".tip-text") as HTMLParagraphElement;
  const progressBarContainerEl = document.querySelector(
    ".progress-bar-container",
  ) as HTMLDivElement;
  const progressBarEl = document.querySelector(
    ".progress-bar",
  ) as HTMLDivElement;

  let currentTipIndex = Math.floor(Math.random() * SplashTips.length);

  const displayNextTip = (): void => {
    if (tipTextEl) {
      tipTextEl.textContent = SplashTips[currentTipIndex];
      currentTipIndex = (currentTipIndex + 1) % SplashTips.length;
    }
  };

  displayNextTip();
  setInterval(displayNextTip, 6000);

  window.api.splash.onStatusUpdate((message) => {
    statusMessageEl.textContent = message;
  });

  window.api.splash.onProgressUpdate((progress) => {
    if (!progress) {
      progressBarContainerEl.style.display = "none";
      return;
    }

    progressBarContainerEl.style.display = "block";
    progressBarEl.style.width = `${progress.percent}%`;
    if (progress.message) {
      statusMessageEl.textContent = progress.message;
    }
  });
});
