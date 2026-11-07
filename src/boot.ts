(function () {
        var panel = document.getElementById('sipandu-boot-error');
        var detail = document.getElementById('sipandu-boot-error-detail');
        var root = document.getElementById('root');
        var hasSpecificError = false;
        var BOOT_RETRY_PREFIX = 'sipandu:boot-asset-retry:';
        var BOOT_RETRY_QUERY = '__sipandu_boot_retry';
        var clearBootRetryMarkers = function () {
          try {
            for (var i = window.sessionStorage.length - 1; i >= 0; i--) {
              var key = window.sessionStorage.key(i);
              if (key && key.indexOf(BOOT_RETRY_PREFIX) === 0) window.sessionStorage.removeItem(key);
            }
          } catch (_) { /* Storage may be unavailable in private/restricted contexts. */ }
        };
        // Remove the one-time cache-busting query after the fresh document arrives.
        try {
          var initialUrl = new URL(window.location.href);
          if (initialUrl.searchParams.has(BOOT_RETRY_QUERY)) {
            initialUrl.searchParams.delete(BOOT_RETRY_QUERY);
            window.history.replaceState(window.history.state, '', initialUrl.pathname + initialUrl.search + initialUrl.hash);
          }
        } catch (_) { /* URL cleanup is optional and never blocks startup. */ }
        var showError = function (message, isSpecific) {
          if (root && root.childElementCount > 0) return;
          // Keep a concrete asset/runtime error instead of replacing it with the
          // generic boot timeout after twenty seconds.
          if (hasSpecificError && !isSpecific) return;
          if (isSpecific) hasSpecificError = true;
          panel.style.display = 'block';
          detail.textContent = String(message || 'Kesalahan tidak diketahui').slice(0, 3000);
        };
        // A wallpaper/logo is optional: its own component has a fallback, and an image
        // preload failing must never be reported as a fatal application boot failure.
        var isNonCriticalImageAsset = function (target) {
          if (!target) return false;
          var tagName = String(target.tagName || '').toUpperCase();
          if (tagName === 'IMG') return true;
          if (tagName !== 'LINK') return false;
          var relTokens = String(target.rel || '').toLowerCase().split(/\\s+/);
          return relTokens.indexOf('preload') !== -1 && String(target.as || '').toLowerCase() === 'image';
        };
        var retryWithFreshDocument = function (assetUrl) {
          // Only retry failed application scripts/styles, not images, APIs, or fonts.
          if (!/\.(?:m?js|css)(?:[?#]|$)/i.test(assetUrl)) return false;
          var assetPath = String(assetUrl).split(/[?#]/)[0];
          var retryKey = BOOT_RETRY_PREFIX + window.location.pathname + ':' + assetPath;
          try {
            // One automatic reload per failed asset per tab session prevents loops.
            if (window.sessionStorage.getItem(retryKey) === '1') return false;
            window.sessionStorage.setItem(retryKey, '1');
          } catch (_) {
            // If the guard cannot be saved, do not risk an infinite reload loop.
            return false;
          }
          try {
            var freshUrl = new URL(window.location.href);
            freshUrl.searchParams.set(BOOT_RETRY_QUERY, String(Date.now()));
            window.location.replace(freshUrl.toString());
            return true;
          } catch (_) {
            return false;
          }
        };
        window.addEventListener('error', function (event) {
          var target = event.target;
          if (target && target !== window && (target.src || target.href)) {
            // Keep non-critical image failures out of the boot error screen. LoginPage
            // retries the wallpaper with its source JPEG and hides it only as a last resort.
            if (isNonCriticalImageAsset(target)) {
              if (window.console && typeof window.console.warn === 'function') {
                window.console.warn('SIPANDU: aset gambar tidak tersedia; aplikasi tetap dilanjutkan.', target.src || target.href);
              }
              return;
            }
            var assetUrl = target.src || target.href;
            if (retryWithFreshDocument(assetUrl)) return;
            showError('Aset aplikasi gagal dimuat: ' + assetUrl + '. Muat ulang halaman; jika berulang, periksa koneksi dan URL aset.', true);
          } else {
            showError((event.message || 'JavaScript gagal dijalankan') + (event.filename ? '\\n' + event.filename + ':' + event.lineno : ''), true);
          }
        }, true);
        window.addEventListener('unhandledrejection', function (event) {
          showError('Kesalahan proses aplikasi: ' + (event.reason && event.reason.message ? event.reason.message : event.reason), true);
        });
        var observer = new MutationObserver(function () {
          if (root && root.childElementCount > 0) {
            panel.style.display = 'none';
            clearBootRetryMarkers();
            observer.disconnect();
          }
        });
        observer.observe(root, { childList: true });
        window.setTimeout(function () {
          if (!root || root.childElementCount === 0) {
            // Some stalled/mismatched module requests do not surface a useful
            // resource-error event. Force one fresh HTML request, but never loop.
            var timeoutRetryKey = BOOT_RETRY_PREFIX + window.location.pathname + ':boot-timeout';
            try {
              if (window.sessionStorage.getItem(timeoutRetryKey) !== '1') {
                window.sessionStorage.setItem(timeoutRetryKey, '1');
                var freshUrl = new URL(window.location.href);
                freshUrl.searchParams.set(BOOT_RETRY_QUERY, 'timeout-' + Date.now());
                window.location.replace(freshUrl.toString());
                return;
              }
            } catch (_) { /* Keep the actionable diagnostic when storage/navigation is unavailable. */ }
            var appScripts = Array.prototype.map.call(
              document.querySelectorAll('script[type="module"][src]'),
              function (script) { return script.src; }
            );
            showError(
              'Aplikasi tetap belum menampilkan antarmuka setelah percobaan muat ulang otomatis. URL modul: ' +
              (appScripts.join(', ') || 'tag modul JavaScript tidak ditemukan') +
              '. Periksa status berkas modul di jaringan atau deployment; data browser tidak dihapus.',
              true
            );
          }
        }, 20000);
      })();

document.getElementById('sipandu-boot-reload')?.addEventListener('click', () => {
  const url = new URL(window.location.href);
  url.searchParams.set('__sipandu_chunk_retry', 'boot-' + Date.now());
  window.location.replace(url.toString());
});
