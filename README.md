# WhatsApp Login Demo

Prototipo frontend para registrar un correo, asociar un numero telefonico y simular una autorizacion desde WhatsApp.

## Ejecutar

Abre `index.html` directamente en el navegador o usa:

```bash
npm.cmd install
npm.cmd run serve
```

## Configurar WhatsApp destino

Por defecto, el QR usa el telefono capturado en el formulario. Si cada usuario tiene un numero distinto, deja `src/config.js` asi:

```js
window.WHATSAPP_LOGIN_CONFIG = {
  receiverMode: "registered-phone",
  authorizationReceiverPhone: ""
};
```

Si quieres que todos los codigos lleguen a un solo WhatsApp fijo, cambia a:

```js
window.WHATSAPP_LOGIN_CONFIG = {
  receiverMode: "fixed",
  authorizationReceiverPhone: "525512345678"
};
```

Tambien puedes probar un destino puntual con `?wa=525512345678`. Por seguridad, WhatsApp no permite enviar el mensaje automaticamente desde un sitio web; el usuario debe tocar Enviar.

## Redireccion desde login

Despues de validar clave y contrasena en tu login, redirige a esta pantalla con un solo parametro:

```text
index.html?Param1=7221484739
```

`Param1` es el telefono del usuario que inicio sesion. Si existe, la pantalla oculta el formulario manual y pasa directo a autorizacion por WhatsApp.

Si no llega `Param1`, la pantalla muestra un campo para capturar el telefono manualmente.

## Guardar accesos

Al presionar `Accesar` con el codigo correcto, la app envia el telefono a `guardar-acceso.php`. Ese archivo guarda los accesos en:

```text
data/accesos.json
```

En hosting PHP, asegúrate de que la carpeta `data` tenga permisos de escritura para PHP.

Despues de verificar correctamente, aparece un boton `Continuar` hacia:

```text
http://201.122.44.34/PortalSerPub/SerPubVal02.asp
```

Si el telefono se capturo manualmente porque no venia `Param1` en la URL, el boton agrega el telefono local:

```text
http://201.122.44.34/PortalSerPub/SerPubVal02.asp?Param1=7221484739
```

## Pruebas

```bash
npm.cmd test
```

## Integracion real de WhatsApp

Este demo abre WhatsApp con un mensaje de autorizacion y valida el codigo en el navegador. Para validar automaticamente desde WhatsApp se necesita un backend que genere el reto, guarde sesiones, reciba webhooks y envie/reciba mensajes mediante WhatsApp Business Cloud API o un proveedor como Twilio.
