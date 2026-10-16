<template>
  <svg class="pop-battle-table" viewBox="0 0 1400 500" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <pattern id="pop-battle-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="9" r="1.5"/></pattern>
      <pattern id="pop-battle-grain" width="86" height="64" patternUnits="userSpaceOnUse"><path d="m8 12 3-1m24 30 2 1m34-22 3-1m-55 36 2-1m34 5 3-1" fill="none" stroke="currentColor" stroke-width=".8"/><circle cx="40" cy="14" r=".8"/></pattern>
      <clipPath id="pop-battle-clip"><path d="m262 34 1069 39-126 361-1119-26Z"/></clipPath>
    </defs>
    <path fill="#a53542" d="m275 48 1066 39-124 361-1131-22Z"/>
    <path fill="#dce89d" d="m262 34 1069 39-126 361-1119-26Z"/>
    <path fill="#202124" d="m223 35-129 373h6L229 35Z"/>
    <path fill="none" stroke="#83903f" stroke-width="1.2" vector-effect="non-scaling-stroke" opacity=".55" d="m293 51 1016 37-115 328"/>
    <path fill="url(#pop-battle-dots)" opacity=".22" d="m1094 268 152 5-45 159-157-4Z"/>
    <path fill="#fff1d7" d="m115 342 42 1-17 49-42-1Zm58 2 15 1-18 49-15-1Z"/>
    <path fill="#202124" d="m1184 105 59 3v6l-59-3Zm-2 15 36 2v4l-36-2Z"/>
    <rect fill="url(#pop-battle-grain)" opacity=".12" width="1400" height="500" clip-path="url(#pop-battle-clip)"/>
  </svg>
</template>
<style scoped>
.pop-battle-table { position:absolute; inset:15px calc(-1 * var(--pop-gutter)) 0; width:calc(100% + 2 * var(--pop-gutter)); height:calc(100% + 12px); color:#68762f; fill:currentColor; pointer-events:none; z-index:-1; animation:pop-table-print 420ms steps(3,end) both; }
@keyframes pop-table-print { from { clip-path:inset(0 100% 0 0); } to { clip-path:inset(0); } }
@media(prefers-reduced-motion:reduce) { .pop-battle-table { animation:none; } }
</style>
