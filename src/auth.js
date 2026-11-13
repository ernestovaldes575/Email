(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AuthCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_COUNTRY_CODE = "52";
  const DEFAULT_TTL_MINUTES = 5;
  const DEFAULT_PORTAL_URL = "http://201.122.44.34/PortalSerPub/SerPubVal02.asp";
  const PORTAL_IP_PREFIX = "201.122.44.";

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  function sanitizeDigits(value) {
    const raw = String(value || "").trim();
    const withoutInternationalPrefix = raw.replace(/^00/, "");
    return withoutInternationalPrefix.replace(/\D/g, "");
  }

  function normalizePhone(phone, countryCode = DEFAULT_COUNTRY_CODE) {
    let digits = sanitizeDigits(phone);
    const cleanCountryCode = sanitizeDigits(countryCode) || DEFAULT_COUNTRY_CODE;

    if (digits.length === 10) {
      digits = `${cleanCountryCode}${digits}`;
    }

    if (digits.length < 10 || digits.length > 15) {
      throw new Error("PHONE_INVALID_LENGTH");
    }

    return {
      phoneE164: digits,
      phoneDisplay: `+${digits}`
    };
  }

  function validateRegistration(values) {
    const input = values || {};
    const email = normalizeEmail(input.email);
    const errors = {};
    const normalized = { email };

    if (!isValidEmail(email)) {
      errors.email = "Escribe un correo electrónico válido.";
    }

    try {
      Object.assign(normalized, normalizePhone(input.phone, input.countryCode));
    } catch (error) {
      errors.phone = "Escribe un teléfono válido con 10 a 15 dígitos.";
    }

    if (!input.termsAccepted) {
      errors.termsAccepted = "Debes autorizar la asociación de datos para continuar.";
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      normalized
    };
  }

  function validatePhoneAccess(values) {
    const input = values || {};
    const errors = {};
    const normalized = { email: "" };

    try {
      Object.assign(normalized, normalizePhone(input.phone, input.countryCode));
    } catch (error) {
      errors.phone = "Escribe un telefono valido con 10 a 15 digitos.";
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      normalized
    };
  }

  function getQueryParamCaseInsensitive(params, name) {
    const expected = String(name).toLowerCase();

    for (const [key, value] of params.entries()) {
      if (String(key).toLowerCase() === expected) {
        return value;
      }
    }

    return "";
  }

  function parseCoordinatesParam(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    const match = raw.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (!match) {
      return "";
    }

    const lat = Number(match[1]);
    const lng = Number(match[2]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return "";
    }

    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return "";
    }

    return `${lat},${lng}`;
  }

  function decodeBase64Utf8(value) {
    if (!value || value.length % 4 !== 0 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
      throw new Error("Param1 no contiene Base64 válido.");
    }

    const binary = atob(value);
    if (btoa(binary) !== value) {
      throw new Error("Param1 no contiene Base64 canónico.");
    }

    try {
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch (error) {
      throw new Error("Param1 no contiene texto UTF-8 válido.");
    }
  }

  function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function buildPortalBaseUrl(octet, path) {
    if (!/^\d{1,3}$/.test(octet) || Number(octet) > 255) {
      throw new Error("El último octeto de la IP no es válido.");
    }

    const route = path.replace(/^\//, "").replace(/_/g, "/");
    const segments = route.split("/");
    if (segments.length < 2 || segments.some(segment =>
      !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9.-]+$/.test(segment))) {
      throw new Error("La ruta del portal no es válida.");
    }

    return `http://${PORTAL_IP_PREFIX}${Number(octet)}/${segments.join("/")}`;
  }

  function parseExternalLoginParams(search) {
    const rawSearch = String(search || "").trim();
    const queryStart = rawSearch.indexOf("?");
    const query = queryStart === -1 ? rawSearch : rawSearch.slice(queryStart + 1);
    // Protege los + originales de Base64 sin aceptar %20 como un +.
    const params = search instanceof URLSearchParams
      ? search
      : new URLSearchParams(query.split("#")[0].replace(/\+/g, "%2B"));
    const matches = [...params].filter(([name]) => name.toLowerCase() === "param1");
    const coordinates = parseCoordinatesParam(getQueryParamCaseInsensitive(params, "Param2"));
    const rawParam1 = matches.length ? matches[0][1] : "";
    const result = {
      hasParams: matches.length > 0,
      isValid: false,
      requiresPhone: false,
      rawParam1,
      decodedParam1: "",
      errors: {},
      normalized: { coordinates }
    };

    if (matches.length > 1) {
      result.errors.param1 = "Param1 no debe estar duplicado.";
      return result;
    }

    if (!rawParam1) {
      result.isValid = result.hasParams;
      result.requiresPhone = true;
      return result;
    }

    // Conserva los enlaces anteriores que enviaban únicamente el teléfono.
    if (/^[\d+().\s-]+$/.test(rawParam1)) {
      const phoneResult = validatePhoneAccess({ phone: rawParam1 });
      return {
        ...result,
        format: "phone",
        isValid: phoneResult.isValid,
        errors: phoneResult.errors,
        normalized: { ...phoneResult.normalized, coordinates }
      };
    }

    try {
      const decoded = decodeBase64Utf8(rawParam1);
      result.decodedParam1 = decoded;
      const parts = decoded.split("|");
      if (parts.length < 4) {
        throw new Error("El QR debe contener IP, ruta, clave y teléfono separados por |.");
      }
      if (parts.slice(0, 3).some(part => !part || part !== part.trim())) {
        throw new Error("La IP, la ruta y la clave no pueden estar vacías ni tener espacios en los extremos.");
      }
      buildPortalBaseUrl(parts[0], parts[1]);
      const portal = {
        ipOctet: String(Number(parts[0])),
        path: parts[1].replace(/^\//, "").replace(/_/g, "/"),
        fields: parts.slice(2)
      };
      result.format = "portal";
      result.normalized = { email: "", coordinates, portal };
      if (!parts[3].trim()) {
        result.isValid = true;
        result.requiresPhone = true;
        return result;
      }

      if (!/^\+?[\d(). -]+$/.test(parts[3])) {
        throw new Error("El teléfono de Param1 no es válido.");
      }
      const phoneResult = validatePhoneAccess({ phone: parts[3] });
      result.isValid = phoneResult.isValid;
      result.errors = phoneResult.errors;
      result.normalized = { ...phoneResult.normalized, coordinates, portal };
    } catch (error) {
      result.errors.param1 = error.message;
    }

    return result;
  }

  function generateVerificationCode(random = Math.random) {
    const value = Math.floor(random() * 1000000);
    return String(value).padStart(6, "0");
  }

  function createVerificationSession(user, options) {
    const opts = options || {};
    const now = Number(opts.now ?? Date.now());
    const ttlMinutes = Number(opts.ttlMinutes ?? DEFAULT_TTL_MINUTES);
    const random = opts.random || Math.random;
    const code = opts.code || generateVerificationCode(random);

    return {
      id: `wa_${now}_${code}`,
      user: {
        email: user.email || "",
        phoneE164: user.phoneE164,
        phoneDisplay: user.phoneDisplay,
        coordinates: user.coordinates || "",
        ...(user.portal ? { portal: { ...user.portal, fields: [...user.portal.fields] } } : {})
      },
      code,
      status: "pending",
      attempts: 0,
      createdAt: now,
      expiresAt: now + ttlMinutes * 60 * 1000
    };
  }

  function isExpired(session, now = Date.now()) {
    return Number(now) > Number(session.expiresAt);
  }

  function verifyCode(session, codeInput, options) {
    const opts = options || {};
    const now = Number(opts.now ?? Date.now());
    const nextSession = {
      ...session,
      user: { ...session.user }
    };
    // Reactiva sesiones no vencidas que hayan sido bloqueadas por una version anterior.
    if (nextSession.status === "blocked") {
      nextSession.status = "pending";
    }

    if (nextSession.status === "verified") {
      return {
        ok: true,
        reason: "already_verified",
        session: nextSession
      };
    }

    if (isExpired(nextSession, now)) {
      nextSession.status = "expired";
      return {
        ok: false,
        reason: "expired",
        session: nextSession
      };
    }

    const normalizedInput = sanitizeDigits(codeInput);

    if (normalizedInput === nextSession.code) {
      nextSession.status = "verified";
      nextSession.verifiedAt = now;
      return {
        ok: true,
        reason: "verified",
        session: nextSession
      };
    }

    nextSession.attempts += 1;

    return {
      ok: false,
      reason: "invalid_code",
      session: nextSession
    };
  }

  function buildAuthorizationMessage(values) {
    const data = values || {};
    const lines = [
      `AUTORIZAR ${data.code}`,
      `Telefono: +${sanitizeDigits(data.userPhone)}`
    ];

    if (data.email) {
      lines.splice(1, 0, `Correo: ${data.email}`);
    }

    return lines.join("\n");
  }

  function buildWhatsAppAuthorizationUrl(values) {
    const data = values || {};
    let businessPhone = "";

    try {
      businessPhone = normalizePhone(data.businessPhone).phoneE164;
    } catch (error) {
      businessPhone = "";
    }

    if (!businessPhone) {
      return "";
    }

    const message = buildAuthorizationMessage(data);
    return `https://api.whatsapp.com/send?phone=${businessPhone}&text=${encodeURIComponent(message)}`;
  }

  function getPortalPhoneParam(phone, countryCode = DEFAULT_COUNTRY_CODE) {
    const digits = sanitizeDigits(phone);
    const cleanCountryCode = sanitizeDigits(countryCode) || DEFAULT_COUNTRY_CODE;

    if (digits.length === cleanCountryCode.length + 10 && digits.startsWith(cleanCountryCode)) {
      return digits.slice(cleanCountryCode.length);
    }

    return digits;
  }

  function buildPortalAccessUrl(values) {
    const data = values || {};
    const baseUrl = data.portal
      ? buildPortalBaseUrl(data.portal.ipOctet, data.portal.path)
      : data.baseUrl || DEFAULT_PORTAL_URL;

    if (!data.includePhoneParam) {
      return baseUrl;
    }

    const phone = getPortalPhoneParam(data.phone);
    const coordinates = parseCoordinatesParam(data.coordinates);

    if (!phone) {
      return baseUrl;
    }

    let param1 = phone;
    if (data.portal) {
      const fields = [...data.portal.fields];
      fields[1] = phone;
      const joined = fields.join("|");
      param1 = encodeBase64Utf8(`|${joined}${joined.endsWith("|") ? "" : "|"}`);
    }

    const separator = baseUrl.includes("?") ? "&" : "?";
    let url = `${baseUrl}${separator}Param1=${encodeURIComponent(param1)}`;

    if (coordinates) {
      url += `&Param2=${encodeURIComponent(coordinates)}`;
    }

    return url;
  }

  function formatRemainingTime(milliseconds) {
    const safeMs = Math.max(Number(milliseconds) || 0, 0);
    const totalSeconds = Math.ceil(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return {
    DEFAULT_COUNTRY_CODE,
    DEFAULT_TTL_MINUTES,
    DEFAULT_PORTAL_URL,
    normalizeEmail,
    isValidEmail,
    sanitizeDigits,
    normalizePhone,
    validateRegistration,
    validatePhoneAccess,
    parseExternalLoginParams,
    parseCoordinatesParam,
    decodeBase64Utf8,
    generateVerificationCode,
    createVerificationSession,
    isExpired,
    verifyCode,
    buildAuthorizationMessage,
    buildWhatsAppAuthorizationUrl,
    getPortalPhoneParam,
    buildPortalAccessUrl,
    formatRemainingTime
  };
});
