/* =========================================================
   Sankha Cooray — portfolio v3 · contact form
   POSTs to the Apps Script backend (see ../contact-sankhacooray-com).
   Uses Content-Type: text/plain to dodge the CORS preflight.
   ========================================================= */
(function () {
  "use strict";

  // ⚠️ Paste your deployed Apps Script web-app URL here (ends in /exec).
  // Until set, the form shows a friendly fallback and links to LinkedIn.
  var APPS_SCRIPT_URL = "";

  var form    = document.getElementById("contactForm");
  if (!form) return;
  var fields  = document.getElementById("formFields");
  var btn     = document.getElementById("submitBtn");
  var status  = document.getElementById("formStatus");
  var success = document.getElementById("contactSuccess");

  function setLoading(loading) {
    fields.disabled = loading;
    btn.disabled = loading;
    btn.classList.toggle("is-loading", loading);
    btn.setAttribute("aria-busy", loading ? "true" : "false");
  }
  function showError(msg) {
    status.style.color = "#ef6b6b";
    status.textContent = msg;
  }
  function showSuccess() {
    form.hidden = true;
    if (success) success.hidden = false;
  }

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
