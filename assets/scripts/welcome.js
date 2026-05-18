/* welcome.js - Landing page interactions */
(function() {
  "use strict";
  /* Animate tiles into view when they scroll into the viewport */
  if (!window.IntersectionObserver) return;
  var tiles = document.querySelectorAll('.action-tile');
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  tiles.forEach(function(tile, i) {
    tile.style.opacity = '0';
    tile.style.transform = 'translateY(16px)';
    tile.style.transition = 'opacity 0.35s ease ' + (i * 0.06) + 's, transform 0.35s ease ' + (i * 0.06) + 's';
    observer.observe(tile);
  });
})();
