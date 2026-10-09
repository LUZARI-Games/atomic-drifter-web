// Website bridge for the Ship Interior Planner.
// Loaded BEFORE the planner (injected by scripts/build-planner.mjs). The planner itself stays untouched.
//
// 1. Replaces the Claude artifact runtime (window.claude): "downloads" becomes a normal browser download,
//    everything else ("db", "user") is unavailable, so the planner keeps ships in this browser (localStorage).
// 2. Adds a "TEST IN GAME" button: it presses the planner's own DOWNLOAD GODOT JSON button (#gdBtn),
//    catches that file instead of downloading it, stores it and opens the game.
//    "SHIP LAB" does the same but opens the Ship Lab (same ship from all view angles).
// 3. Keeps the planner's "BEFORE YOU START · LOAD YOUR GAME TABLES" window (#setup) from popping up by itself on load.
//    Only the Unreal team needs those tables; they can still open it any time ([T] key or the tables button).
(function () {
  'use strict';
  var TEST_KEY = 'adw.testShip';
  var capture = null; // function(text) while TEST IN GAME is waiting for the Godot export

  function blobText(data) {
    if (typeof data === 'string') return Promise.resolve(data);
    if (data && typeof data.text === 'function') return data.text();
    return Promise.resolve(String(data));
  }

  var downloads = {
    save: function (opts) {
      var filename = (opts && opts.filename) || 'download.json';
      var data = opts && opts.data;
      if (capture && /_godot\.json$/i.test(filename)) {
        var done = capture; capture = null;
        return blobText(data).then(done);
      }
      var blob = data instanceof Blob ? data : new Blob([data == null ? '' : data], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return Promise.resolve();
    }
  };

  if (!window.claude) {
    window.claude = {
      use: function (name) {
        if (name === 'downloads') return Promise.resolve(downloads);
        var e = new Error(name + ' is not available on the website'); e.code = 'unavailable';
        return Promise.reject(e);
      }
    };
  }

  function toast(text, warn) {
    var t = document.getElementById('adwToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'adwToast';
      t.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:2147483647;' +
        'padding:8px 14px;background:#15191C;border:3px solid currentColor;font:15px "Monofonto","Share Tech Mono",monospace;' +
        'letter-spacing:1px;pointer-events:none;max-width:90vw;text-align:center';
      document.body.appendChild(t);
    }
    t.textContent = text; t.style.color = warn ? '#F5B942' : '#E8ECEE'; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 3500);
  }

  function testInGame(target) {
    var gd = document.getElementById('gdBtn');
    if (!gd) { toast('THIS PLANNER VERSION HAS NO GODOT EXPORT', true); return; }
    var timer = setTimeout(function () {
      capture = null; toast('BUILD A SHIP FIRST (NO TILES TO EXPORT)', true);
    }, 1500);
    capture = function (text) {
      clearTimeout(timer);
      try {
        var ship = JSON.parse(text);
        localStorage.setItem(TEST_KEY, JSON.stringify(ship));
      } catch (e) { toast('COULD NOT HAND THE SHIP TO THE GAME', true); return; }
      toast(target === 'lab' ? 'SHIP SENT · OPENING SHIP LAB' : 'SHIP SENT · OPENING GAME');
      location.href = target === 'lab' ? '../ship-lab/' : '../?ship=test';
    };
    gd.click();
  }

  function addButtons() {
    var bar = document.createElement('div');
    // Sits on the bottom edge of the planner's drawing area (its largest canvas), so it never covers the panels.
    // Below the planner's dialogs (z-index 20), styled like the planner's own buttons.
    bar.style.cssText = 'position:fixed;transform:translateX(-50%);z-index:15;display:flex;gap:8px';
    var css = 'font:15px "Monofonto","Share Tech Mono",monospace;letter-spacing:2px;padding:6px 12px;cursor:pointer;white-space:nowrap;' +
      'background:#15191C;color:#E8ECEE;border:3px solid #E8ECEE';
    var test = document.createElement('button');
    test.type = 'button'; test.textContent = '▶ TEST IN GAME'; test.style.cssText = css;
    test.style.background = '#E8ECEE'; test.style.color = '#0F1214';
    test.title = 'Open this ship in the Atomic Drifter web prototype';
    test.addEventListener('click', function () { testInGame('game'); });
    var lab = document.createElement('button');
    lab.type = 'button'; lab.textContent = '▶ SHIP LAB'; lab.style.cssText = css;
    lab.title = 'Open this ship in the Ship Lab (top-down + isometric views)';
    lab.addEventListener('click', function () { testInGame('lab'); });
    var game = document.createElement('a');
    game.href = '../'; game.textContent = 'GAME'; game.style.cssText = css + ';text-decoration:none';
    bar.appendChild(game); bar.appendChild(lab); bar.appendChild(test);
    document.body.appendChild(bar);

    function place() {
      var best = null, area = 0;
      document.querySelectorAll('canvas').forEach(function (c) {
        var r = c.getBoundingClientRect(), a = r.width * r.height;
        if (a > area) { area = a; best = r; }
      });
      if (!best) { bar.style.left = '50%'; bar.style.top = ''; bar.style.bottom = '10px'; return; }
      bar.style.bottom = '';
      bar.style.left = Math.round(best.left + best.width / 2) + 'px';
      bar.style.top = Math.round(Math.min(best.bottom, window.innerHeight) - bar.offsetHeight - 10) + 'px';
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    setInterval(place, 1000); // planner panels can change size without a resize event
  }

  // The planner opens #setup automatically shortly after start when tables are missing.
  // Any opening before the first tap/key of the user is that automatic one -> close it again.
  function suppressAutoSetup() {
    var userActed = false;
    var mark = function () { userActed = true; };
    window.addEventListener('pointerdown', mark, true);
    window.addEventListener('keydown', mark, true);
    var watch = function () {
      var el = document.getElementById('setup');
      if (!el) return;
      var close = function () { if (!userActed && !el.hidden) el.hidden = true; };
      close();
      var obs = new MutationObserver(close);
      obs.observe(el, { attributes: true, attributeFilter: ['hidden'] });
      setTimeout(function () { obs.disconnect(); }, 8000); // the planner opens it within 1.5 s
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
    else watch();
  }
  suppressAutoSetup();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButtons);
  else addButtons();
})();
