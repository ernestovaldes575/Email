const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Auth = require("../src/auth");

const markup = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
const storageKey = "whatsapp-login-demo:session";
const suppliedParam1 = "77u/MzR8UG9ydGFsU2VyUHViX1NlclB1YlZhbDAyLmFzcHwxMDV8NzIyMTQ4NDczOXw=";
const queryFor = payload => `?Param1=${encodeURIComponent(Buffer.from(payload).toString("base64"))}`;

// Adaptador mínimo del DOM: ejecuta el app.js real y sus eventos sin servicios externos.
function createElement(classes = "") {
  const names = new Set(classes.split(/\s+/).filter(Boolean));
  return {
    value: "", textContent: "", href: "", disabled: false,
    listeners: {}, children: {},
    classList: {
      add: (...values) => values.forEach(value => names.add(value)),
      remove: (...values) => values.forEach(value => names.delete(value)),
      contains: value => names.has(value),
      toggle(value, force) {
        const add = force === undefined ? !names.has(value) : force;
        if (add) names.add(value); else names.delete(value);
      }
    },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    querySelector(selector) { return this.children[selector] || null; },
    setAttribute: jest.fn(),
    focus: jest.fn(),
    select: jest.fn()
  };
}

async function openScreen(search, options = {}) {
  const elements = {};
  for (const match of markup.matchAll(/<[a-z]+\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    elements[match[2]] = createElement((match[1].match(/\bclass="([^"]*)"/) || [])[1]);
  }
  elements.emptyState.children.h2 = createElement();
  elements.emptyState.children.p = createElement();
  const fieldError = createElement();
  const storage = options.storage || new Map();
  const location = { href: `http://localhost/${search}`, search, hostname: "localhost" };
  const navigator = {
    userAgent: "Prueba automatizada",
    clipboard: options.noClipboard ? undefined : { writeText: jest.fn().mockResolvedValue(undefined) },
    geolocation: {
      getCurrentPosition: jest.fn((success, failure) => {
        if (options.locationDenied) {
          failure({ code: 1, PERMISSION_DENIED: 1, message: "Permiso denegado" });
        } else {
          success({ coords: { latitude: 19.4326, longitude: -99.1332 } });
        }
      })
    }
  };
  const window = {
    AuthCore: Auth,
    WHATSAPP_LOGIN_CONFIG: { debugConsole: options.debug !== false },
    location, isSecureContext: true,
    addEventListener: jest.fn(),
    setInterval: jest.fn(() => 1), clearInterval: jest.fn(),
    Swal: { fire: jest.fn() }
  };
  const fetch = jest.fn().mockResolvedValue({ ok: !options.saveFailed, status: options.saveFailed ? 500 : 200 });
  vm.runInNewContext(appSource, {
    window, navigator, location, fetch, URL, URLSearchParams,
    document: {
      getElementById: id => elements[id] || null,
      querySelectorAll: () => [fieldError],
      querySelector: () => fieldError
    },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
  }, { filename: "src/app.js" });
  await Promise.resolve();
  return {
    elements, storage, location, navigator, fetch,
    get session() { return JSON.parse(storage.get(storageKey) || "null"); },
    async trigger(id, type) {
      await elements[id].listeners[type]({ preventDefault() {} });
    }
  };
}

describe("Flujo de confirmación del portal", () => {
  it("should authorize the phone from the supplied URL without showing registration", async () => {
    const screen = await openScreen(`?Param1=${suppliedParam1}`);

    expect(screen.elements.registrationForm.classList.contains("hidden")).toBe(true);
    expect(screen.elements.pendingState.classList.contains("hidden")).toBe(false);
    expect(screen.elements.summaryPhone.textContent).toBe("+527221484739");
    expect(screen.elements.debugOutput.value).toContain("34|PortalSerPub_SerPubVal02.asp|105|7221484739|");
    expect(screen.elements.debugOutput.value).not.toContain("AUTORIZAR ");
    expect(screen.session.user.coordinates).toBe("19.4326,-99.1332");
  });

  it("should register the missing phone, save access and prepare the ASP link with the original key", async () => {
    const screen = await openScreen(queryFor("34|PortalSerPub_SerPubVal02.asp|105||extra||"));

    expect(screen.elements.registrationForm.classList.contains("hidden")).toBe(false);
    expect(screen.elements.registrationSubmit.disabled).toBe(false);
    expect(screen.elements.emptyState.children.h2.textContent).toContain("Registra");
    expect(screen.session).toBeNull();

    screen.elements.phone.value = "55 1234 5678";
    await screen.trigger("registrationForm", "submit");
    expect(screen.elements.pendingState.classList.contains("hidden")).toBe(false);
    expect(screen.elements.registrationForm.classList.contains("hidden")).toBe(true);

    screen.elements.verificationCode.value = screen.session.code;
    await screen.trigger("verificationForm", "submit");

    expect(screen.elements.accessState.classList.contains("hidden")).toBe(false);
    expect(screen.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(screen.fetch.mock.calls[0][1].body)).toMatchObject({
      phone: "525512345678", coordinates: "19.4326,-99.1332", source: "manual"
    });
    const target = new URL(screen.elements.portalLink.href);
    expect(target.pathname).toBe("/PortalSerPub/SerPubVal02.asp");
    expect(Buffer.from(target.searchParams.get("Param1"), "base64").toString("utf8"))
      .toBe("|105|5512345678|extra||");
    expect(target.searchParams.get("Param2")).toBe("19.4326,-99.1332");
    expect(screen.location.href).toMatch(/^http:\/\/localhost\//);
    expect(screen.elements.debugOutput.value).toContain("pendiente de Continuar");
    expect(screen.elements.debugOutput.value).toContain("|105|5512345678|extra||");
  });

  it("should redirect automatically when the test console is disabled", async () => {
    const screen = await openScreen(`?Param1=${suppliedParam1}`, { debug: false });
    screen.elements.verificationCode.value = screen.session.code;
    await screen.trigger("verificationForm", "submit");

    const target = new URL(screen.location.href);
    expect(target.origin).toBe("http://201.122.44.34");
    expect(Buffer.from(target.searchParams.get("Param1"), "base64").toString("utf8"))
      .toBe("|105|7221484739|");
    expect(screen.elements.debugConsole.classList.contains("hidden")).toBe(true);
    expect(screen.elements.debugOutput.value).toBe("");
  });

  it("should display malformed input instead of allowing a default portal session", async () => {
    const screen = await openScreen(queryFor("34|PortalSerPub/../index.asp|105|7221484739|"));
    expect(screen.session).toBeNull();
    expect(screen.elements.registrationForm.classList.contains("hidden")).toBe(true);
    expect(screen.elements.emptyState.children.p.textContent).toContain("ruta");
    expect(screen.fetch).not.toHaveBeenCalled();
  });

  it("should not reuse authorization for the same phone with a different portal key", async () => {
    const first = await openScreen(queryFor("34|PortalSerPub_SerPubVal02.asp|105|7221484739|"));
    first.elements.verificationCode.value = first.session.code;
    await first.trigger("verificationForm", "submit");

    const second = await openScreen(queryFor("34|PortalSerPub_SerPubVal02.asp|999|7221484739|"), { storage: first.storage });
    expect(second.session.status).toBe("pending");
    expect(second.session.user.portal.fields[0]).toBe("999");
    expect(second.elements.accessState.classList.contains("hidden")).toBe(true);
  });

  it("should copy the visible diagnosis", async () => {
    const screen = await openScreen(`?Param1=${suppliedParam1}`);
    const diagnostic = screen.elements.debugOutput.value;
    await screen.trigger("copyDebugButton", "click");
    expect(screen.navigator.clipboard.writeText).toHaveBeenCalledWith(diagnostic);
    expect(screen.elements.debugCopyStatus.textContent).toContain("copiado");
  });

  it("should select the diagnosis for manual copying when the clipboard API is unavailable", async () => {
    const screen = await openScreen(`?Param1=${suppliedParam1}`, { noClipboard: true });
    await screen.trigger("copyDebugButton", "click");
    expect(screen.elements.debugOutput.select).toHaveBeenCalledTimes(1);
    expect(screen.elements.debugCopyStatus.textContent).toContain("Ctrl+C");
  });

  it("should show a location error while keeping the missing-phone registration visible", async () => {
    const screen = await openScreen(queryFor("34|PortalSerPub_SerPubVal02.asp|105||"), { locationDenied: true });
    expect(screen.elements.registrationForm.classList.contains("hidden")).toBe(false);
    expect(screen.elements.registrationSubmit.disabled).toBe(true);
    expect(screen.elements.registrationFeedback.textContent).toContain("ubicación");
    expect(screen.elements.debugOutput.value).toContain("Permiso denegado");
  });

  it("should keep the ASP link available and log a local save failure", async () => {
    const screen = await openScreen(`?Param1=${suppliedParam1}`, { saveFailed: true });
    screen.elements.verificationCode.value = screen.session.code;
    await screen.trigger("verificationForm", "submit");
    expect(screen.session.accessSaved).toBe(false);
    expect(screen.storage.has("whatsapp-login-demo:last-access")).toBe(true);
    expect(screen.elements.portalLink.href).toContain("/PortalSerPub/SerPubVal02.asp?Param1=");
    expect(screen.elements.debugOutput.value).toContain("No se pudo guardar");
  });
});
