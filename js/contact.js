/* =========================================================
   Sankha Cooray — portfolio v3 · contact form
   POSTs to the Apps Script backend (see ../contact-sankhacooray-com).
   Uses Content-Type: text/plain to dodge the CORS preflight.
   ========================================================= */
(function () {
  "use strict";

  // Deployed Apps Script web-app URL (ends in /exec). See contact-sankhacooray-com.
  var APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzVh7KHZDVkO29XaSiF1zP7LqvwzPy_5yPs4GN4aAofezUaaWaSt36MAwxty_CXe_aSlQ/exec";

  var form     = document.getElementById("contactForm");
  if (!form) return;
  var fields   = document.getElementById("formFields");
  var btn      = document.getElementById("submitBtn");
  var status   = document.getElementById("formStatus");
  var success  = document.getElementById("contactSuccess");
  var again    = document.getElementById("sendAnother");
  var label    = btn.querySelector(".label");
  var labelText = label ? label.textContent : "Send message";

  function setLoading(loading) {
    fields.disabled = loading;
    btn.disabled = loading;
    btn.classList.toggle("is-loading", loading);
    btn.setAttribute("aria-busy", loading ? "true" : "false");
    if (label) label.textContent = loading ? "Sending…" : labelText;
  }
  function showError(msg) {
    status.style.color = "#ef6b6b";
    status.textContent = msg;
  }
  function showSuccess() {
    status.textContent = "";
    form.hidden = true;
    if (success) {
      success.hidden = false;
      // Make sure the confirmation is in view, then move focus to it.
      success.scrollIntoView({ behavior: "smooth", block: "center" });
      success.setAttribute("tabindex", "-1");
      try { success.focus({ preventScroll: true }); } catch (e) {}
    }
  }
  function resetToForm() {
    if (success) success.hidden = true;
    form.reset();
    form.hidden = false;
    status.textContent = "";
    var first = document.getElementById("cf-name");
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    if (first) setTimeout(function () { first.focus(); }, 300);
  }
  if (again) again.addEventListener("click", resetToForm);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    status.textContent = "";

    if (!form.checkValidity()) { form.reportValidity(); return; }

    var payload = {
      name:      form.elements["name"].value,
      email:     form.elements["email"].value,
      message:   form.elements["message"].value,
      company:   form.elements["company"].value, // honeypot
      userAgent: navigator.userAgent,
      source:    "v3.sankhacooray.com"
    };

    if (!APPS_SCRIPT_URL) {
      showError("The contact form isn't wired up yet — please reach me on LinkedIn for now.");
      return;
    }

    setLoading(true);
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) showSuccess();
        else showError((data && data.message) || "Something went wrong. Please try again.");
      })
      .catch(function () {
        showError("Network error — please try again, or reach me on LinkedIn.");
      })
      .finally(function () { setLoading(false); });
  });
})();
