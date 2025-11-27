<script>
  import { fullscreenImage } from "../lib/stores";
</script>

{#if $fullscreenImage}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    on:click|self={() => fullscreenImage.set(null)}
  >
    <button
      type="button"
      class="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
      on:click={() => fullscreenImage.set(null)}
      aria-label="Close fullscreen view"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="h-6 w-6"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
    <img
      src={$fullscreenImage}
      alt="Fullscreen view"
      class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
    />
  </div>
{/if}
