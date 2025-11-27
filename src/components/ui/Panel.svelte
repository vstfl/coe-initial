<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";
    import type { ClassName } from "../../types";

    let className: ClassName = "";
    export { className as class };

    const baseStyles = "bg-white rounded-lg shadow-lg p-4";
    $: classes = `${baseStyles} ${className}`;
</script>

<div class={classes} {...$$restProps}>
    <slot />
</div>
