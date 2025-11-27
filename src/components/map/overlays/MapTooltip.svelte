<script lang="ts">
    import { tooltipState } from "../../../lib/stores";
    import { fade } from "svelte/transition";

    // Subscribe to the store
    // $tooltipState will be available
</script>

{#if $tooltipState}
    <div
        class="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2"
        style="left: {$tooltipState.x}px; top: {$tooltipState.y}px;"
        transition:fade={{ duration: 100 }}
    >
        <div
            class="bg-white/90 backdrop-blur-sm shadow-lg rounded-lg p-3 text-sm border border-slate-200 max-w-xs"
        >
            {#if $tooltipState.type === "trip-point"}
                <div class="font-semibold text-slate-800 mb-1">Trip Point</div>
                <div class="space-y-0.5 text-slate-600">
                    {#if $tooltipState.data.speed2d != null}
                        <div>
                            Speed: <span class="font-medium text-slate-900"
                                >{Math.round($tooltipState.data.speed2d * 3.6)} km/h</span
                            >
                        </div>
                    {/if}
                    {#if $tooltipState.data.timestamp}
                        <div class="text-xs text-slate-500">
                            {$tooltipState.data.timestamp}
                        </div>
                    {/if}
                </div>
            {:else if $tooltipState.type === "camera"}
                <div class="font-semibold text-slate-800 mb-1">
                    Traffic Camera
                </div>
                <div class="space-y-0.5 text-slate-600">
                    <div>{$tooltipState.data.primaryRoad}</div>
                    <div class="text-xs">
                        {$tooltipState.data.secondaryRoad}
                    </div>
                    {#if $tooltipState.data.status}
                        <div
                            class="mt-1 inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700"
                        >
                            {$tooltipState.data.status}
                        </div>
                    {/if}
                </div>
            {:else if $tooltipState.type === "demo-point"}
                <div class="font-semibold text-slate-800 mb-1">
                    Demo Capture
                </div>
                <div class="space-y-0.5 text-slate-600">
                    {#if $tooltipState.data.timestamp}
                        <div class="text-xs text-slate-500">
                            {new Date(
                                $tooltipState.data.timestamp,
                            ).toLocaleTimeString()}
                        </div>
                    {/if}
                    {#if $tooltipState.data.image}
                        <div
                            class="text-xs text-slate-400 mt-1 truncate max-w-[200px]"
                        >
                            {$tooltipState.data.image}
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="text-slate-500">Unknown Feature</div>
            {/if}

            <!-- Arrow -->
            <div
                class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white/90"
            ></div>
        </div>
    </div>
{/if}
