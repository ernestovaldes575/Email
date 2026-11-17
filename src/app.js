(function () {
  const Auth = window.AuthCore;
  const STORAGE_KEY = "whatsapp-login-demo:session";
  const runtimeConfig = window.WHATSAPP_LOGIN_CONFIG || {};
  const debugEnabled = runtimeConfig.debugConsole === true;

  const elements = {
    appShell: document.getElementById("appShell"),
    registrationForm: document.getElementById("registrationForm"),
    registrationSubmit: document.getElementById("registrationSubmit"),
    registrationFeedback: document.getElementById("registrationFeedback"),
    phone: document.getElementById("phone"),
    emptyState: document.getElementById("emptyState"),
    pendingState: document.getElementById("pendingState"),
    accessState: document.getElementById("accessState"),
    qrCode: document.getElementById("qrCode"),
    statusBadge: document.getElementById("statusBadge"),
    summaryPhone: document.getElementById("summaryPhone"),
    expiresIn: document.getElementById("expiresIn"),
    demoCodeBlock: document.getElementById("demoCodeBlock"),
    demoCode: document.getElementById("demoCode"),
    whatsappLink: document.getElementById("whatsappLink"),
    copyMessageButton: document.getElementById("copyMessageButton"),
    verificationForm: document.getElementById("verificationForm"),
    verificationCode: document.getElementById("verificationCode"),
    verificationFeedback: document.getElementById("verificationFeedback"),
    resendButton: document.getElementById("resendButton"),
    accessPhone: document.getElementById("accessPhone"),
    accessCoordinates: document.getElementById("accessCoordinates"),
    accessTime: document.getElementById("accessTime"),
    portalLink: document.getElementById("portalLink"),
    debugConsole: document.getElementById("debugConsole"),
    debugOutput: document.getElementById("debugOutput"),
    copyDebugButton: document.getElementById("copyDebugButton"),
    debugCopyStatus: document.getElementById("debugCopyStatus")
  };

  const externalLogin = Auth.parseExternalLoginParams(window.location.search);
  let currentSession = null;
  let countdownTimer = null;
  let startupCoordinates = externalLogin.normalized.coordinates || "";
  const diagnosticEntries = [];

  setVisible(elements.debugConsole, debugEnabled);
  logDiagnostic("Inicio", { url: window.location.href, navegador: navigator.userAgent });
  logDiagnostic("Lectura de Param1", {
    recibido: externalLogin.rawParam1,
    decodificado: externalLogin.decodedParam1,
    formato: externalLogin.format || "sin datos",
    requiereTelefono: externalLogin.requiresPhone,
    portal: externalLogin.normalized.portal || null,
    errores: externalLogin.errors
  });
  window.addEventListener("error", event => {
    logDiagnostic("Error de JavaScript", { mensaje: event.message, archivo: event.filename, linea: event.lineno });
  });
  window.addEventListener("unhandledrejection", event => {
    logDiagnostic("Error asíncrono", { mensaje: String(event.reason && event.reason.message || event.reason) });
  });

  currentSession = initializeSession();

  function getSessionKey(user) {
    return JSON.stringify({
      phone: user.phoneE164,
      coordinates: user.coordinates || "",
      portal: user.portal || null
    });
  }

  function logDiagnostic(message, details) {
    if (!debugEnabled) return;
    const entry = `[${new Date().toISOString()}] ${message}`;
    diagnosticEntries.push(details === undefined ? entry : `${entry}\n${JSON.stringify(details, null, 2)}`);
    if (diagnosticEntries.length > 80) diagnosticEntries.shift();
    elements.debugOutput.value = diagnosticEntries.join("\n\n");
    elements.debugOutput.scrollTop = elements.debugOutput.scrollHeight;
  }

  async function handleCopyDiagnostics() {
    try {
      await navigator.clipboard.writeText(elements.debugOutput.value);
      elements.debugCopyStatus.textContent = "Diagnóstico copiado. Ya puedes enviarlo al desarrollador.";
    } catch (error) {
      elements.debugOutput.focus();
      elements.debugOutput.select();
      elements.debugCopyStatus.textContent = "Texto seleccionado. Usa Copiar en tu dispositivo o Ctrl+C.";
    }
  }

  function getPortalUrl(session) {
    return Auth.buildPortalAccessUrl({
      phone: session.user.phoneE164,
      coordinates: session.user.coordinates,
      portal: session.user.portal,
      includePhoneParam: true
    });
  }

  function initializeSession() {
    const storedSession = loadSession();

    if (!externalLogin.hasParams) {
      return null;
    }

    if (!externalLogin.isValid || externalLogin.requiresPhone) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const paramKey = getSessionKey(externalLogin.normalized);
    const canReuseStoredSession =
      storedSession &&
      storedSession.source === "external-login" &&
      storedSession.paramKey === paramKey &&
      !Auth.isExpired(storedSession);

    if (canReuseStoredSession) {
      logDiagnostic("Sesión vigente recuperada", { telefono: storedSession.user.phoneE164, estado: storedSession.status });
      return storedSession;
    }

    const session = Auth.createVerificationSession(externalLogin.normalized);
    session.source = "external-login";
    session.paramKey = paramKey;
    saveSession(session);
    logDiagnostic("Autorización creada desde Param1", { telefono: session.user.phoneE164 });
    return session;
  }

  function applyStartupMode() {
    const showRegistration = !currentSession &&
      (!externalLogin.hasParams || (externalLogin.isValid && externalLogin.requiresPhone));
    setVisible(elements.registrationForm, showRegistration);
    elements.appShell.classList.toggle("authorization-only", !showRegistration);

    if (externalLogin.isValid && !externalLogin.requiresPhone) {
      elements.phone.value = externalLogin.normalized.phoneDisplay;
    }
  }

  preloadCoordinates();

  function getQueryReceiverPhone() {
    const queryParams = new URLSearchParams(window.location.search);
    return Auth.sanitizeDigits(queryParams.get("wa"));
  }

  function getReceiverPhoneForSession(session) {
    const queryPhone = getQueryReceiverPhone();

    if (queryPhone) {
      return queryPhone;
    }

    if (runtimeConfig.receiverMode === "fixed") {
      return Auth.sanitizeDigits(runtimeConfig.authorizationReceiverPhone || runtimeConfig.whatsappBusinessPhone || "");
    }

    return session && session.user ? session.user.phoneE164 : "";
  }

  function setVisible(element, isVisible) {
    element.classList.toggle("hidden", !isVisible);
  }

  function notify(title, text, icon) {
    if (window.Swal) {
      window.Swal.fire({
        title,
        text,
        icon,
        confirmButtonColor: "#128c7e"
      });
      return;
    }

    window.alert(`${title}\n${text}`);
  }

  function clearFieldErrors() {
    document.querySelectorAll("[data-error-for]").forEach((node) => {
      node.textContent = "";
    });

    [elements.phone].forEach((input) => {
      input.classList.remove("is-invalid");
    });
  }

  function setRegistrationReady(isReady) {
    if (elements.registrationSubmit) {
      elements.registrationSubmit.disabled = !isReady;
    }
  }

  function setLocationFeedback(message) {
    elements.registrationFeedback.textContent = message;
    elements.verificationFeedback.textContent = message;
  }

  async function preloadCoordinates() {
    if (isValidCoordinates(startupCoordinates)) {
      setRegistrationReady(true);
      setLocationFeedback("Ubicación recibida. Ya puedes verificar.");
      logDiagnostic("Ubicación recibida en Param2", { coordenadas: startupCoordinates });
      return;
    }

    if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      startupCoordinates = "";
      setRegistrationReady(false);
      setLocationFeedback("La ubicación requiere HTTPS o localhost. Abre esta pantalla desde un sitio seguro.");
      logDiagnostic("Ubicación no disponible", { motivo: "Se requiere HTTPS o localhost" });
      return;
    }

    const coordinates = await getBrowserCoordinates();
    if (isValidCoordinates(coordinates)) {
      startupCoordinates = coordinates;
      if (currentSession && !isValidCoordinates(currentSession.user.coordinates)) {
        saveSession({
          ...currentSession,
          user: { ...currentSession.user, coordinates }
        });
      }
      setRegistrationReady(true);
      setLocationFeedback("Ubicación capturada. Ya puedes verificar.");
      logDiagnostic("Ubicación capturada", { coordenadas: startupCoordinates });
      return;
    }

    startupCoordinates = "";
    setRegistrationReady(false);
    setLocationFeedback("La ubicación es obligatoria. Permite el acceso para continuar.");
  }

  function showFieldErrors(errors) {
    clearFieldErrors();

    Object.entries(errors).forEach(([field, message]) => {
      const errorNode = document.querySelector(`[data-error-for="${field}"]`);
      if (errorNode) {
        errorNode.textContent = message;
      }

      const input = elements[field];
      if (input && input.classList) {
        input.classList.add("is-invalid");
      }
    });
  }

  function saveSession(session) {
    currentSession = session;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  }

  function loadSession() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  function clearSession() {
    currentSession = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  function getBrowserCoordinates() {
    if (!navigator.geolocation) {
      logDiagnostic("Ubicación no disponible", { motivo: "El navegador no ofrece geolocalización" });
      return Promise.resolve("");
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude = Number(position.coords.latitude.toFixed(6));
          const longitude = Number(position.coords.longitude.toFixed(6));
          resolve(Auth.parseCoordinatesParam(`${latitude},${longitude}`));
        },
        (error) => {
          logDiagnostic("Error de ubicación", { codigo: error && error.code, mensaje: error && error.message });
          if (error && error.code === error.PERMISSION_DENIED) {
            elements.verificationFeedback.textContent = "Permite el acceso a ubicacion para continuar.";
          } else if (error && error.code === error.TIMEOUT) {
            elements.verificationFeedback.textContent = "La ubicacion tardo demasiado en responder. Intentalo de nuevo.";
          } else {
            elements.verificationFeedback.textContent = "No se pudo obtener la ubicacion del dispositivo.";
          }
          resolve("");
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60000
        }
      );
    });
  }

  function isValidCoordinates(value) {
    return Boolean(Auth.parseCoordinatesParam(value));
  }

  function getAuthorizationPayload(session) {
    return {
      businessPhone: getReceiverPhoneForSession(session),
      code: session.code,
      email: session.user.email,
      userPhone: session.user.phoneE164,
      coordinates: session.user.coordinates || ""
    };
  }

  function renderQrCode(url) {
    elements.qrCode.innerHTML = "";

    if (!url) {
      elements.qrCode.innerHTML = '<div class="px-3 text-center text-sm font-medium text-slate-500">Falta numero destino</div>';
      return;
    }

    if (!window.QRCode) {
      elements.qrCode.textContent = "QR";
      return;
    }

    new window.QRCode(elements.qrCode, {
      text: url,
      width: 156,
      height: 156,
      colorDark: "#17212b",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M
    });
  }

  function updateCountdown() {
    if (!currentSession || currentSession.status !== "pending") {
      stopCountdown();
      return;
    }

    const remaining = currentSession.expiresAt - Date.now();
    elements.expiresIn.textContent = Auth.formatRemainingTime(remaining);

    if (remaining <= 0) {
      currentSession = { ...currentSession, status: "expired" };
      saveSession(currentSession);
      render();
    }
  }

  function startCountdown() {
    stopCountdown();
    updateCountdown();
    countdownTimer = window.setInterval(updateCountdown, 1000);
  }

  function stopCountdown() {
    if (countdownTimer) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function setPendingAvailability(isAvailable, hasReceiverPhone) {
    elements.verificationCode.disabled = !isAvailable;
    elements.whatsappLink.setAttribute("aria-disabled", String(!isAvailable || !hasReceiverPhone));
    elements.whatsappLink.classList.toggle("pointer-events-none", !isAvailable || !hasReceiverPhone);
    elements.copyMessageButton.disabled = !isAvailable;
  }

  function renderEmpty() {
    setVisible(elements.emptyState, true);
    setVisible(elements.pendingState, false);
    setVisible(elements.accessState, false);
    stopCountdown();

    if (externalLogin.hasParams && !externalLogin.isValid) {
      const title = elements.emptyState.querySelector("h2");
      const copy = elements.emptyState.querySelector("p");

      if (title) {
        title.textContent = "Parametros invalidos";
      }

      if (copy) {
        copy.textContent = Object.values(externalLogin.errors).join(" ") || "Param1 no es válido.";
      }
    } else if (externalLogin.requiresPhone && externalLogin.format === "portal") {
      elements.emptyState.querySelector("h2").textContent = "Registra tu número telefónico";
      elements.emptyState.querySelector("p").textContent = "El enlace no incluye un teléfono. Captúralo para autorizar el acceso y enviarlo al portal.";
    }
  }

  function renderPending(session) {
    if (session.status === "blocked") {
      session = saveSession({ ...session, status: "pending" });
    }

    const expired = session.status === "expired" || Auth.isExpired(session);
    const available = !expired;
    const receiverPhone = getReceiverPhoneForSession(session);
    const authUrl = Auth.buildWhatsAppAuthorizationUrl(getAuthorizationPayload(session));
    const hasReceiverPhone = Boolean(receiverPhone);

    setVisible(elements.emptyState, false);
    setVisible(elements.pendingState, true);
    setVisible(elements.accessState, false);

    elements.summaryPhone.textContent = session.user.phoneDisplay;
    if (elements.demoCode) {
      elements.demoCode.textContent = "";
    }
    elements.whatsappLink.href = authUrl || "#";
    elements.verificationFeedback.textContent = expired
        ? "El código expiró. Genera uno nuevo para continuar."
        : hasReceiverPhone
          ? "Puedes intentar las veces necesarias mientras el código esté vigente."
          : "Captura un telefono valido para abrir un chat directo.";

    elements.statusBadge.className = "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm font-medium";
    if (expired) {
      elements.statusBadge.classList.add("bg-slate-100", "text-slate-700");
      elements.statusBadge.innerHTML = '<span class="h-2 w-2 rounded-full bg-slate-500"></span> Expirado';
    } else {
      elements.statusBadge.classList.add("bg-amber-100", "text-amber-800");
      elements.statusBadge.innerHTML = '<span class="h-2 w-2 rounded-full bg-amber-500"></span> Pendiente';
    }

    setPendingAvailability(available, hasReceiverPhone);
    renderQrCode(authUrl);

    if (available) {
      startCountdown();
    } else {
      stopCountdown();
      elements.expiresIn.textContent = "00:00";
    }
  }

  function renderAccess(session) {
    setVisible(elements.emptyState, false);
    setVisible(elements.pendingState, false);
    setVisible(elements.accessState, true);
    stopCountdown();

    elements.accessPhone.textContent = session.user.phoneDisplay;
    elements.accessCoordinates.textContent = session.user.coordinates || "Sin coordenadas";
    elements.accessTime.textContent = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(session.verifiedAt || Date.now()));
    const portalUrl = getPortalUrl(session);
    elements.portalLink.href = portalUrl;
    const param1 = new URL(portalUrl).searchParams.get("Param1");
    logDiagnostic("Redirigiendo al servidor ASP", {
      url: portalUrl,
      param1,
      param1Decodificado: session.user.portal ? Auth.decodeBase64Utf8(param1) : param1,
      coordenadas: session.user.coordinates || ""
    });
  }

  function render() {
    applyStartupMode();
    if (!currentSession) {
      renderEmpty();
      return;
    }

    if (currentSession.status === "verified") {
      renderAccess(currentSession);
      window.location.href = elements.portalLink.href;
      return;
    }

    renderPending(currentSession);

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  async function handleRegistrationSubmit(event) {
    event.preventDefault();

    const result = Auth.validatePhoneAccess({
      phone: elements.phone.value
    });

    if (!result.isValid) {
      showFieldErrors(result.errors);
      logDiagnostic("Teléfono capturado no válido", result.errors);
      return;
    }

    clearFieldErrors();
    setRegistrationReady(false);
    setLocationFeedback("Obteniendo ubicación del dispositivo...");
    const coordinates = externalLogin.normalized.coordinates || startupCoordinates || await getBrowserCoordinates();

    if (!isValidCoordinates(coordinates)) {
      setLocationFeedback("La ubicación es obligatoria. Activa el GPS o permite el acceso a ubicación para continuar.");
      setRegistrationReady(true);
      notify(
        "Ubicacion requerida",
        "Debes permitir el acceso a ubicacion para generar la validacion.",
        "warning"
      );
      return;
    }

    const session = Auth.createVerificationSession({
      ...result.normalized,
      coordinates,
      portal: externalLogin.normalized.portal
    });
    session.source = "manual";
    session.paramKey = getSessionKey(result.normalized);
    saveSession(session);
    logDiagnostic("Teléfono registrado para autorización", {
      telefono: session.user.phoneE164,
      coordenadas: coordinates,
      portal: session.user.portal || null
    });
    elements.verificationCode.value = "";
    elements.verificationFeedback.textContent = "";
    setRegistrationReady(true);
    render();
    notify("Validación creada", "Abre WhatsApp y envía el mensaje de autorización.", "success");
  }

  async function handleVerificationSubmit(event) {
    event.preventDefault();

    if (!currentSession) {
      return;
    }

    const result = Auth.verifyCode(currentSession, elements.verificationCode.value);
    saveSession(result.session);
    logDiagnostic("Resultado de verificación", { correcto: result.ok, motivo: result.reason });

    if (result.ok) {
      elements.verificationCode.value = "";
      const savingAccess = saveAuthorizedAccess(result.session);
      render();
      const savedAccess = await savingAccess;
      saveSession({
        ...result.session,
        accessSaved: savedAccess.ok
      });
      return;
    }

    render();

    if (result.reason === "invalid_code") {
      elements.verificationFeedback.textContent = "Código incorrecto. Puedes volver a intentarlo.";
      return;
    }

    if (result.reason === "expired") {
      notify("Código expirado", "Genera un nuevo código para continuar.", "warning");
      return;
    }
  }

  async function handleCopyMessage() {
    if (!currentSession) {
      return;
    }

    const message = Auth.buildAuthorizationMessage(getAuthorizationPayload(currentSession));

    try {
      await navigator.clipboard.writeText(message);
      notify("Mensaje copiado", "Pégalo en WhatsApp para autorizar.", "success");
    } catch (error) {
      notify("No se pudo copiar", message, "info");
    }
  }

  async function saveAuthorizedAccess(session) {
    const payload = {
      phone: session.user.phoneE164,
      phoneDisplay: session.user.phoneDisplay,
      coordinates: session.user.coordinates || "",
      authorizedAt: new Date(session.verifiedAt || Date.now()).toISOString(),
      source: session.source || "manual"
    };

    // Conserva una copia antes de navegar, incluso si la página se cierra durante el envío.
    localStorage.setItem("whatsapp-login-demo:last-access", JSON.stringify(payload));
    logDiagnostic("Guardando acceso", { endpoint: "guardar-acceso.php", metodo: "POST", datos: payload });
    try {
      const response = await fetch("guardar-acceso.php", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      logDiagnostic("Respuesta de guardar acceso", { http: response.status, correcto: response.ok });

      if (!response.ok) {
        throw new Error("SAVE_FAILED");
      }

      return { ok: true };
    } catch (error) {
      logDiagnostic("No se pudo guardar el acceso; se conserva copia local", { mensaje: error.message });
      return { ok: false, error };
    }
  }

  function handleResend() {
    if (!currentSession) {
      return;
    }

    const nextSession = Auth.createVerificationSession(currentSession.user);
    nextSession.source = currentSession.source;
    nextSession.paramKey = currentSession.paramKey;
    saveSession(nextSession);
    elements.verificationCode.value = "";
    render();
    notify("Nuevo código generado", "El código anterior ya no debe usarse.", "success");
  }

  elements.registrationForm.addEventListener("submit", handleRegistrationSubmit);
  elements.verificationForm.addEventListener("submit", handleVerificationSubmit);
  elements.copyMessageButton.addEventListener("click", handleCopyMessage);
  elements.resendButton.addEventListener("click", handleResend);
  elements.copyDebugButton.addEventListener("click", handleCopyDiagnostics);
  elements.portalLink.addEventListener("click", () => {
    logDiagnostic("Navegando al servidor ASP", { url: elements.portalLink.href });
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }

  render();
})();
