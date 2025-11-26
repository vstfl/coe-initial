<script>
  import { currentPath } from '../lib/stores.js';

  function navigate(path) {
    if (path === $currentPath) return;
    window.location.hash = path;
    currentPath.set(path);
  }
</script>

<nav class="absolute top-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-200 bg-white/90 p-1 shadow-lg backdrop-blur-sm">
  <button
    type="button"
    class={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      $currentPath === '/'
        ? 'bg-slate-900 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`}
    on:click={() => navigate('/')}
  >
    Home
  </button>
  <button
    type="button"
    class={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      $currentPath === '/collection/demo'
        ? 'bg-slate-900 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`}
    on:click={() => navigate('/collection/demo')}
  >
    Demo
  </button>
</nav>
