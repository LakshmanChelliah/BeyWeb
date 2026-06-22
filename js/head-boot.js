(function () {
  var useCdn =
    (location.hostname === 'localhost' && location.port === '3000') ||
    location.hostname.endsWith('github.io');
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
  var el = document.createElement('script');
  el.type = 'importmap';
  el.textContent = JSON.stringify({ imports: imports });
  document.head.appendChild(el);

  if (document.body && document.body.classList.contains('mobile')) {
    window.__BEYWEB_BOOT_TIMEOUT__ = setTimeout(function () {
      if (window.__BEYWEB_BOOTED__) return;
      var fb = document.getElementById('boot-fallback');
      if (fb) fb.hidden = false;
    }, 12000);
  }
})();
