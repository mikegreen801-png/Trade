/* login.js — Login/Auth page runtime */
(function () {
  "use strict";
  var S = window.Site;

  var loginFormState = document.getElementById("loginFormState");
  var loggedInState = document.getElementById("loginLoggedInState");

  // Auth slot refresh function
  function updateUI() {
    var user = S.currentUser();
    if (user) {
      if (loginFormState) loginFormState.style.display = "none";
      if (loggedInState) loggedInState.style.display = "";
      
      var userNameEl = document.getElementById("loginUserName");
      var userAvatarEl = document.getElementById("loginUserAvatar");
      if (userNameEl) userNameEl.textContent = "Welcome, " + user.email;
      if (userAvatarEl) userAvatarEl.textContent = (user.email || "?")[0].toUpperCase();

      // Load Alpaca keys
      var keys = S.getAlpacaKeys();
      var alpacaStatus = document.getElementById("alpacaStatus");
      if (keys && keys.keyId) {
        document.getElementById("alpacaKeyId").value = keys.keyId;
        document.getElementById("alpacaSecret").value = keys.secret;
        document.getElementById("alpacaEnv").value = keys.env;
        if (alpacaStatus) alpacaStatus.textContent = "Keys loaded for " + keys.env + " environment.";
      } else {
        if (alpacaStatus) alpacaStatus.textContent = "No keys saved yet.";
      }
    } else {
      if (loginFormState) loginFormState.style.display = "";
      if (loggedInState) loggedInState.style.display = "none";
    }
  }

  // Simple hashing for demo purposes (SHA-256)
  async function hashPassword(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Handle Login / Sign Up
  var loginForm = document.getElementById("loginForm");
  var toggleLink = document.getElementById("loginToggleLink");
  var isSignUp = false;

  if (toggleLink) {
    toggleLink.addEventListener("click", function() {
      isSignUp = !isSignUp;
      document.getElementById("loginHeading").textContent = isSignUp ? "Create account" : "Sign in";
      document.getElementById("loginSubtext").textContent = isSignUp ? "Sign up to start saving your trading workspace locally." : "Sign in to save your Alpaca keys and keep your workspace in sync.";
      document.getElementById("loginSubmitBtn").textContent = isSignUp ? "Create account" : "Sign in";
      document.getElementById("loginToggleText").textContent = isSignUp ? "Already have an account?" : "Don't have an account?";
      toggleLink.textContent = isSignUp ? "Sign in" : "Create one";
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async function(e) {
      e.preventDefault();
      var email = document.getElementById("loginEmail").value.trim();
      var pass = document.getElementById("loginPassword").value;
      if (!email || !pass) return S.toast("Email and password required.", "error");

      var passHash = await hashPassword(pass);
      var res = S.loginUser(email, passHash);
      if (res.ok) {
        S.toast(isSignUp ? "Account created and signed in." : "Signed in successfully.", "success");
        updateUI();
        // Update top nav auth slot dynamically since we are on the page
        if (window.Site && window.Site.updateAuthSlot) window.Site.updateAuthSlot();
        else location.reload(); // fallback
      } else {
        S.toast(res.error, "error");
      }
    });
  }

  // Handle Logout
  var logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function() {
      S.logout();
      S.toast("Signed out.", "info");
      updateUI();
      location.reload(); // Reload to clear top nav and states completely
    });
  }

  // Handle Alpaca Keys
  var alpacaForm = document.getElementById("alpacaForm");
  if (alpacaForm) {
    alpacaForm.addEventListener("submit", function(e) {
      e.preventDefault();
      var keyId = document.getElementById("alpacaKeyId").value.trim();
      var secret = document.getElementById("alpacaSecret").value.trim();
      var env = document.getElementById("alpacaEnv").value;
      if (!keyId || !secret) return S.toast("Both Key ID and Secret are required.", "error");
      
      S.saveAlpacaKeys(keyId, secret, env);
      S.toast("Alpaca keys saved locally.", "success");
      updateUI();
    });
  }

  // Initial render
  updateUI();

})();
