/* course.js */
function switchModule(moduleId) {
  var modules = document.querySelectorAll('.module');
  for (var i = 0; i < modules.length; i++) {
    modules[i].classList.remove('active');
  }

  var buttons = document.querySelectorAll('.nav-tabs button');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.remove('active');
    buttons[i].className = 'secondary-btn'; // reset to default
  }

  var target = document.getElementById(moduleId);
  if (target) target.classList.add('active');

  if (window.event && window.event.target) {
    window.event.target.classList.add('active');
    window.event.target.className = 'secondary-btn active';
  }
}

// Make it global
window.switchModule = switchModule;
