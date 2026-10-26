/* スレイザスパイア — minimal keyed DOM morph.
   Patches a live element so that its children match freshly rendered markup, keeping every element whose
   place and identity are unchanged. Running animations, focus, scroll positions and loaded images survive a
   re-render, and CSS transitions (HP bars, cards sliding in the hand) can play between two states.
   Keys: data-key, id, data-u (+ data-a), data-pi. Unkeyed nodes are matched in order by tag name. */
(function (root) {
'use strict';
var STS = root.STS || (root.STS = {});

function keyOf(n) {
  if (n.nodeType !== 1) return null;
  var k = n.getAttribute('data-key');
  if (k != null) return 'k:' + k;
  if (n.id) return 'id:' + n.id;
  var u = n.getAttribute('data-u');
  if (u != null) return n.tagName + ':u:' + u + ':' + (n.getAttribute('data-a') || '');
  var pi = n.getAttribute('data-pi');
  if (pi != null) return n.tagName + ':p:' + pi;
  return null;
}

function syncAttrs(live, next) {
  var la = live.attributes, na = next.attributes, i, a;
  for (i = la.length - 1; i >= 0; i--) {
    a = la[i];
    if (next.hasAttribute(a.name)) continue;
    if (live.tagName === 'DETAILS' && a.name === 'open') continue; // the reader's choice
    live.removeAttribute(a.name);
  }
  for (i = 0; i < na.length; i++) {
    a = na[i];
    if (live.getAttribute(a.name) !== a.value) live.setAttribute(a.name, a.value);
  }
}

function morphNode(live, next) {
  if (live.nodeType !== 1) { if (live.nodeValue !== next.nodeValue) live.nodeValue = next.nodeValue; return; }
  syncAttrs(live, next);
  if (live.tagName === 'INPUT' || live.tagName === 'TEXTAREA') {
    // Never overwrite what the player is typing.
    if (live !== live.ownerDocument.activeElement) { var v = next.getAttribute('value') || ''; if (live.value !== v) live.value = v; }
    return;
  }
  if (live.hasAttribute('data-morph-keep')) return; // contents managed elsewhere
  morphChildren(live, next);
}

function morphChildren(lp, np) {
  var kids = Array.prototype.slice.call(np.childNodes);
  var keyed = Object.create(null), c, k;
  for (c = lp.firstChild; c; c = c.nextSibling) { k = keyOf(c); if (k && !keyed[k]) keyed[k] = c; }
  var cur = lp.firstChild;
  for (var j = 0; j < kids.length; j++) {
    var nc = kids[j], match = null;
    k = keyOf(nc);
    if (k) {
      var cand = keyed[k];
      if (cand && cand.nodeName === nc.nodeName && cand.parentNode === lp) { match = cand; delete keyed[k]; }
    } else {
      var s = cur;
      while (s && keyOf(s)) s = s.nextSibling;
      if (s && s.nodeType === nc.nodeType && s.nodeName === nc.nodeName) match = s;
    }
    if (match) {
      if (match === cur) cur = cur.nextSibling;
      else lp.insertBefore(match, cur);
      morphNode(match, nc);
    } else {
      lp.insertBefore(nc, cur); // the parsed node itself moves into place
    }
  }
  while (cur) { var nx = cur.nextSibling; lp.removeChild(cur); cur = nx; }
}

/* target: live element; src: HTML string or a DocumentFragment / template content. */
STS.morph = function (target, src) {
  var frag = src;
  if (typeof src === 'string') { var t = target.ownerDocument.createElement('template'); t.innerHTML = src; frag = t.content; }
  morphChildren(target, frag);
};
STS.morph.keyOf = keyOf;
})(typeof window !== 'undefined' ? window : globalThis);
