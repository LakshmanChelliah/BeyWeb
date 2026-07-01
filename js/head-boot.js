(function () {
  var useCdn =
    (location.hostname === 'localhost' && location.port === '3000') ||
    location.hostname.endsWith('github.io');
  var v = window.__BEYWEB_ASSET_V__ || '22';
  var base = window.__BEYWEB_BASE__ || '';

  function ver(relFromRoot) {
    var path = relFromRoot.charAt(0) === '/' ? relFromRoot : '/' + relFromRoot;
    return base + path + '?v=' + v;
  }

  function scopePrefix(relDir) {
    var path = relDir.charAt(0) === '/' ? relDir : '/' + relDir;
    if (!path.endsWith('/')) path += '/';
    return base + path;
  }

  var imports = useCdn
    ? {
        three: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
        'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/',
        'cannon-es': 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js',
      }
    : {
        three: '/vendor/three.module.js',
        'three/addons/': '/vendor/three/examples/jsm/',
        'cannon-es': '/vendor/cannon-es.js',
      };

  // Version relative ES module imports so CDN/browser caches cannot serve stale graphs.
  var scopes = {};
  scopes[scopePrefix('/js')] = {
    './app/bootstrap.js': ver('/js/app/bootstrap.js'),
    './input/keyboard.js': ver('/js/input/keyboard.js'),
    './input/gyro.js': ver('/js/input/gyro.js'),
    './input/ai.js': ver('/js/input/ai.js'),
    './game/modes.js': ver('/js/game/modes.js'),
    './net/remoteInput.js': ver('/js/net/remoteInput.js'),
    './net/inputBuffer.js': ver('/js/net/inputBuffer.js'),
    './config.js': ver('/js/config.js'),
  };
  scopes[scopePrefix('/js/app')] = {
    '../game/engine.js': ver('/js/game/engine.js'),
    '../input/ai.js': ver('/js/input/ai.js'),
    '../ui/selection.js': ver('/js/ui/selection.js'),
    '../ui/playSetup.js': ver('/js/ui/playSetup.js'),
    '../ui/domRefs.js': ver('/js/ui/domRefs.js'),
    '../game/campaignController.js': ver('/js/game/campaignController.js'),
    '../game/onlineController.js': ver('/js/game/onlineController.js'),
    '../ui/onlineLobby.js': ver('/js/ui/onlineLobby.js'),
    '../ui/onlineSelection.js': ver('/js/ui/onlineSelection.js'),
    '../net/client.js': ver('/js/net/client.js'),
    '../net/inputBuffer.js': ver('/js/net/inputBuffer.js'),
    '../net/debug.js': ver('/js/net/debug.js'),
    '../net/protocol.js': ver('/js/net/protocol.js'),
    '../game/modes.js': ver('/js/game/modes.js'),
  };
  scopes[scopePrefix('/js/ui')] = {
    '../game/beys.js': ver('/js/game/beys.js'),
    '../game/abilities.js': ver('/js/game/abilities.js'),
    '../app/basePath.js': ver('/js/app/basePath.js'),
    './beyPackagingStars.js': ver('/js/ui/beyPackagingStars.js'),
    '../net/protocol.js': ver('/js/net/protocol.js'),
    '../input/ai.js': ver('/js/input/ai.js'),
    '../game/modes.js': ver('/js/game/modes.js'),
  };
  scopes[scopePrefix('/js/game')] = {
    './abilities.js': ver('/js/game/abilities.js'),
    './abilities/index.js': ver('/js/game/abilities/index.js'),
    './beys.js': ver('/js/game/beys.js'),
    './state.js': ver('/js/game/state.js'),
    './rules.js': ver('/js/game/rules.js'),
    './simulation.js': ver('/js/game/simulation.js'),
    './engine.js': ver('/js/game/engine.js'),
    './matchFactory.js': ver('/js/game/matchFactory.js'),
    './modes.js': ver('/js/game/modes.js'),
    './stats.js': ver('/js/game/stats.js'),
    './casualMode.js': ver('/js/game/casualMode.js'),
    './campaign.js': ver('/js/game/campaign.js'),
    './campaignController.js': ver('/js/game/campaignController.js'),
    './onlineController.js': ver('/js/game/onlineController.js'),
    '../config.js': ver('/js/config.js'),
    '../physics/world.js': ver('/js/physics/world.js'),
    '../physics/arena.js': ver('/js/physics/arena.js'),
    '../physics/contact.js': ver('/js/physics/contact.js'),
    '../physics/top.js': ver('/js/physics/top.js'),
    '../physics/ringOut.js': ver('/js/physics/ringOut.js'),
    '../physics/steer.js': ver('/js/physics/steer.js'),
    '../physics/arenaGeometry.js': ver('/js/physics/arenaGeometry.js'),
    '../physics/collisionSparks.js': ver('/js/physics/collisionSparks.js'),
    '../render/scene.js': ver('/js/render/scene.js'),
    '../render/arena.js': ver('/js/render/arena.js'),
    '../render/top.js': ver('/js/render/top.js'),
    '../render/starBlastVfx.js': ver('/js/render/starBlastVfx.js'),
    '../render/leoneAbilityVfx.js': ver('/js/render/leoneAbilityVfx.js'),
    '../render/pegasusSpeedBoostVfx.js': ver('/js/render/pegasusSpeedBoostVfx.js'),
    '../render/ldragoAbilityVfx.js': ver('/js/render/ldragoAbilityVfx.js'),
    '../render/darkMoveVfx.js': ver('/js/render/darkMoveVfx.js'),
    '../render/libraAbilityVfx.js': ver('/js/render/libraAbilityVfx.js'),
    '../render/bullAbilityVfx.js': ver('/js/render/bullAbilityVfx.js'),
    '../render/eagleAbilityVfx.js': ver('/js/render/eagleAbilityVfx.js'),
    '../render/strikerAbilityVfx.js': ver('/js/render/strikerAbilityVfx.js'),
    '../render/collisionSparksVfx.js': ver('/js/render/collisionSparksVfx.js'),
    '../net/snapshot.js': ver('/js/net/snapshot.js'),
    '../net/interpolation.js': ver('/js/net/interpolation.js'),
    '../net/collisionSync.js': ver('/js/net/collisionSync.js'),
    '../net/protocol.js': ver('/js/net/protocol.js'),
    '../utils/seededRng.js': ver('/js/utils/seededRng.js'),
    '../utils/math.js': ver('/js/utils/math.js'),
  };
  scopes[scopePrefix('/js/game/abilities')] = {
    './impl.js': ver('/js/game/abilities/impl.js'),
    './index.js': ver('/js/game/abilities/index.js'),
  };

  var el = document.createElement('script');
  el.type = 'importmap';
  el.textContent = JSON.stringify({ imports: imports, scopes: scopes });
  document.head.appendChild(el);

  if (document.body && document.body.classList.contains('mobile')) {
    window.__BEYWEB_BOOT_TIMEOUT__ = setTimeout(function () {
      if (window.__BEYWEB_BOOTED__) return;
      var fb = document.getElementById('boot-fallback');
      if (fb) fb.hidden = false;
    }, 12000);
  }
})();
