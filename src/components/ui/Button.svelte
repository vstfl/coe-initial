<script lang="ts">
    import type { HTMLButtonAttributes } from "svelte/elements";
    import type { ClassName } from "../../types";

    // Svelte 4 props
    export let variant: "primary" | "secondary" | "ghost" | "icon" = "primary";
    export let size: "sm" | "md" | "lg" | "icon" = "md";
    let className: ClassName = "";
    export { className as class };

    const baseStyles =
        "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

    const variants = {
        primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
        secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
        ghost: "hover:bg-slate-100 hover:text-slate-900",
        icon: "hover:bg-slate-100 text-slate-700",
    };

    const sizes = {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 py-2 text-sm",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
    };

    $: classes = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;
</script>

<button class={classes} {...$$restProps} on:click>
    <slot />
</button>
