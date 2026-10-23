/* Printed ink route symbols: a consistent set of code-native map illustrations. */
(function(){'use strict';var A=globalThis.IBARA.ART;
var skull='<path d="M17 44C8 38 9 18 18 12C26 6 42 7 48 16C56 27 52 39 44 43L43 54H22L21 44Z"/><path d="M21 28L29 31L25 38L18 35ZM41 28L46 33L39 38L35 31Z" fill="#ead7ac" stroke="none"/><path d="M31 36L27 43H35Z" fill="#ead7ac" stroke="none"/><path d="M27 48V54M33 48V54M39 47V53" stroke="#ead7ac" stroke-width="2"/>';
var art={enc:skull,start:skull,elite:'<path d="M18 20C8 19 8 11 6 7C18 10 23 13 23 17M42 18C45 10 52 10 58 7C55 18 51 22 45 22"/>'+skull,
event:'<path d="M21 20C20 8 45 7 45 22C45 31 32 31 32 40" fill="none" stroke-width="6"/><path d="M29 48H36V55H29Z"/>',
rest:'<path d="M30 6C35 22 51 23 47 39C43 54 19 54 16 39C14 29 23 20 25 17C23 31 28 33 30 31C35 25 27 17 30 6Z"/><path d="M17 56L49 45M16 45L49 56" stroke-width="4" fill="none"/>',
shop:'<path d="M24 8H42L39 19C48 24 54 36 51 48C48 58 17 57 13 47C8 36 18 24 25 19Z"/><path d="M25 18H40M26 12L32 19L39 12" fill="none" stroke="#ead7ac"/><ellipse cx="33" cy="38" rx="9" ry="12" fill="#ead7ac"/><path d="M33 29V46M37 33C28 28 26 38 34 39C41 41 35 49 28 43" fill="none"/>',
treasure:'<path d="M10 31V20C10 5 53 6 54 20V31L49 33V54H14V33Z"/><path d="M11 29H53M21 12V52M44 12V52" stroke="#ead7ac" fill="none" stroke-width="3"/><path d="M27 26H38V38H27Z" fill="#ead7ac"/><path d="M32 30V35" fill="none"/>',
boss:'<path d="M8 18L22 31L32 9L43 31L57 18L50 52H15Z"/><path d="M17 43H48" stroke="#ead7ac" fill="none" stroke-width="3"/>'};
A.node=function(kind){return '<svg class="node-svg ink-node" viewBox="0 0 64 64" fill="#382b21" stroke="#382b21" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+(art[kind]||art.enc)+'</svg>';};
A.NODE_NAME.event='イベント';
})();
